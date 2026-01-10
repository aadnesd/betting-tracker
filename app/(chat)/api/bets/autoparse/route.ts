import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import type { ParsedBet } from "@/lib/bet-parser";
import { parseMatchedBetFromScreenshots } from "@/lib/bet-parser";
import { evaluateNeedsReview } from "@/lib/bet-review";
import {
  getAccountByName,
  getScreenshotById,
  updateScreenshotStatus,
} from "@/lib/db/queries";

const bodySchema = z.object({
  backScreenshotId: z.string().uuid(),
  layScreenshotId: z.string().uuid(),
});

/**
 * Attempts to match a parsed exchange/bookmaker name against user's existing accounts.
 * Returns the accountId if matched, otherwise null.
 */
async function matchAccountForBet({
  userId,
  exchangeName,
  kind,
}: {
  userId: string;
  exchangeName: string;
  kind: "bookmaker" | "exchange";
}): Promise<string | null> {
  if (!exchangeName || exchangeName.trim().length === 0) {
    return null;
  }

  const account = await getAccountByName({
    userId,
    name: exchangeName,
    kind,
  });

  return account?.id ?? null;
}

/**
 * Enriches a parsed bet with account matching results.
 * Sets accountId if match found, otherwise sets unmatchedAccount flag.
 */
function enrichBetWithAccountMatch(
  bet: ParsedBet,
  accountId: string | null
): ParsedBet {
  return {
    ...bet,
    accountId,
    unmatchedAccount: accountId === null,
  };
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof bodySchema>;

  try {
    const json = await request.json();
    payload = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const [backShot, layShot] = await Promise.all([
    getScreenshotById({
      id: payload.backScreenshotId,
      userId: session.user.id,
    }),
    getScreenshotById({
      id: payload.layScreenshotId,
      userId: session.user.id,
    }),
  ]);

  if (!backShot || !layShot) {
    return NextResponse.json({ error: "Screenshots not found" }, { status: 404 });
  }

  try {
    const parsed = await parseMatchedBetFromScreenshots({
      backImageUrl: backShot.url,
      layImageUrl: layShot.url,
    });

    // Match parsed exchange/bookmaker names against user's existing accounts
    const [backAccountId, layAccountId] = await Promise.all([
      matchAccountForBet({
        userId: session.user.id,
        exchangeName: parsed.back.exchange,
        kind: "bookmaker",
      }),
      matchAccountForBet({
        userId: session.user.id,
        exchangeName: parsed.lay.exchange,
        kind: "exchange",
      }),
    ]);

    // Enrich bets with account matching results
    const enrichedBack = enrichBetWithAccountMatch(parsed.back, backAccountId);
    const enrichedLay = enrichBetWithAccountMatch(parsed.lay, layAccountId);

    // Flag for review if any account is unmatched (user may need to create accounts)
    const hasUnmatchedAccounts =
      enrichedBack.unmatchedAccount || enrichedLay.unmatchedAccount;

    const { needsReview } = evaluateNeedsReview({
      explicitFlag: parsed.needsReview || hasUnmatchedAccounts,
      backConfidence: parsed.back.confidence,
      layConfidence: parsed.lay.confidence,
    });

    const status = needsReview ? "needs_review" : "parsed";

    // Build notes for unmatched accounts
    const unmatchedNotes: string[] = [];
    if (enrichedBack.unmatchedAccount) {
      unmatchedNotes.push(
        `Bookmaker "${parsed.back.exchange}" not found in your accounts. Consider creating it.`
      );
    }
    if (enrichedLay.unmatchedAccount) {
      unmatchedNotes.push(
        `Exchange "${parsed.lay.exchange}" not found in your accounts. Consider creating it.`
      );
    }

    const notes = unmatchedNotes.length > 0
      ? [parsed.notes, ...unmatchedNotes].filter(Boolean).join("\n")
      : parsed.notes;

    await Promise.all([
      updateScreenshotStatus({
        id: backShot.id,
        status,
        parsedOutput: enrichedBack,
        confidence: enrichedBack.confidence ?? null,
        error: null,
      }),
      updateScreenshotStatus({
        id: layShot.id,
        status,
        parsedOutput: enrichedLay,
        confidence: enrichedLay.confidence ?? null,
        error: null,
      }),
    ]);

    return NextResponse.json({
      back: enrichedBack,
      lay: enrichedLay,
      needsReview,
      notes,
    });
  } catch (error) {
    console.error("Failed to parse bets", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to parse bets";

    await Promise.all([
      updateScreenshotStatus({
        id: backShot.id,
        status: "error",
        error: errorMessage,
        parsedOutput: null,
        confidence: null,
      }),
      updateScreenshotStatus({
        id: layShot.id,
        status: "error",
        error: errorMessage,
        parsedOutput: null,
        confidence: null,
      }),
    ]);

    return NextResponse.json(
      { error: errorMessage, needsReview: true },
      { status: 500 }
    );
  }
}
