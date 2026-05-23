import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  getEmailPromoCandidateByMessageId,
  getGmailConnectionByUserId,
  listAccountsByUser,
  updateGmailConnectionSyncState,
  upsertEmailPromoCandidate,
} from "@/lib/db/queries";
import {
  extractGmailText,
  getGmailHeader,
  readGmailMessage,
  refreshGmailAccessToken,
  searchGmailMessages,
} from "@/lib/gmail/google";
import { parseEmailPromo } from "@/lib/gmail/promo-parser";
import { decryptToken, encryptToken } from "@/lib/gmail/token-crypto";

const DEFAULT_PROMO_QUERY =
  'newer_than:30d (bonus OR "free bet" OR promo OR promotion OR boosted OR cashback OR refund OR deposit)';

async function getUsableAccessToken({
  connection,
  userId,
}: {
  connection: NonNullable<
    Awaited<ReturnType<typeof getGmailConnectionByUserId>>
  >;
  userId: string;
}) {
  const expiresAt = connection.tokenExpiresAt?.getTime() ?? 0;
  const shouldRefresh = expiresAt < Date.now() + 60_000;

  if (!(shouldRefresh && connection.refreshTokenCiphertext)) {
    return decryptToken(connection.accessTokenCiphertext);
  }

  const refreshed = await refreshGmailAccessToken({
    refreshToken: decryptToken(connection.refreshTokenCiphertext),
  });

  await updateGmailConnectionSyncState({
    id: connection.id,
    userId,
    accessTokenCiphertext: encryptToken(refreshed.access_token),
    tokenExpiresAt: refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000)
      : null,
    status: "connected",
    lastError: null,
  });

  return refreshed.access_token;
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await getGmailConnectionByUserId({
    userId: session.user.id,
  });

  if (!connection || connection.status !== "connected") {
    return NextResponse.json(
      { error: "Gmail is not connected" },
      { status: 409 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const maxResults = Math.min(Math.max(Number(body.maxResults) || 10, 1), 25);
    const query =
      typeof body.query === "string" && body.query.trim()
        ? body.query.trim()
        : DEFAULT_PROMO_QUERY;

    const accessToken = await getUsableAccessToken({
      connection,
      userId: session.user.id,
    });
    const accounts = await listAccountsByUser({
      userId: session.user.id,
      limit: 500,
    });
    const bookmakerAccounts = accounts.filter(
      (account) => account.kind === "bookmaker"
    );
    const messages = await searchGmailMessages({
      accessToken,
      query,
      maxResults,
    });

    let scanned = 0;
    let created = 0;
    let skipped = 0;

    for (const messageRef of messages) {
      const existing = await getEmailPromoCandidateByMessageId({
        userId: session.user.id,
        gmailMessageId: messageRef.id,
      });

      if (existing) {
        skipped++;
        continue;
      }

      const message = await readGmailMessage({
        accessToken,
        id: messageRef.id,
      });
      scanned++;

      const subject = getGmailHeader(message, "subject") ?? "(no subject)";
      const sender = getGmailHeader(message, "from");
      const bodyText = extractGmailText(message);

      if (!bodyText) {
        skipped++;
        continue;
      }

      const parsed = await parseEmailPromo({
        subject,
        sender,
        body: bodyText,
        accounts: bookmakerAccounts,
      });
      const accountMatches =
        parsed.accountId &&
        bookmakerAccounts.some((account) => account.id === parsed.accountId);
      const status = parsed.interesting
        ? parsed.confidence < 0.75 || parsed.needsReviewReason
          ? "needs_review"
          : "interesting"
        : "ignored";

      await upsertEmailPromoCandidate({
        userId: session.user.id,
        gmailConnectionId: connection.id,
        gmailMessageId: message.id,
        gmailThreadId: message.threadId ?? null,
        receivedAt: message.internalDate
          ? new Date(Number(message.internalDate))
          : null,
        sender,
        subject,
        snippet: message.snippet ?? null,
        bodyHash: crypto.createHash("sha256").update(bodyText).digest("hex"),
        accountId: accountMatches ? parsed.accountId : null,
        accountNameGuess: parsed.accountNameGuess,
        promoKind: parsed.promoKind,
        title: parsed.title,
        summary: parsed.summary,
        terms: parsed.terms,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
        minOdds: parsed.minOdds,
        maxStake: parsed.maxStake,
        currency: parsed.currency,
        confidence: parsed.confidence,
        status,
        rawModelOutput: parsed,
      });
      created++;
    }

    await updateGmailConnectionSyncState({
      id: connection.id,
      userId: session.user.id,
      lastSyncedAt: new Date(),
      status: "connected",
      lastError: null,
    });

    return NextResponse.json({
      success: true,
      scanned,
      created,
      skipped,
      query,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sync Gmail";
    console.error("[gmail/sync] Failed to sync Gmail", error);
    await updateGmailConnectionSyncState({
      id: connection.id,
      userId: session.user.id,
      status: "error",
      lastError: message,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
