import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { createAuditEntry, upsertGmailConnection } from "@/lib/db/queries";
import {
  exchangeGmailCodeForTokens,
  fetchGmailProfile,
} from "@/lib/gmail/google";
import { encryptToken } from "@/lib/gmail/token-crypto";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gmail_oauth_state")?.value;

  if (!(code && state && expectedState) || state !== expectedState) {
    return NextResponse.redirect(
      new URL("/bets/promo-inbox?gmail=state-error", request.url)
    );
  }

  try {
    const tokenResponse = await exchangeGmailCodeForTokens({
      code,
      requestUrl: request.url,
    });
    const profile = await fetchGmailProfile({
      accessToken: tokenResponse.access_token,
    });

    const connection = await upsertGmailConnection({
      userId: session.user.id,
      gmailEmail: profile.emailAddress,
      accessTokenCiphertext: encryptToken(tokenResponse.access_token),
      refreshTokenCiphertext: tokenResponse.refresh_token
        ? encryptToken(tokenResponse.refresh_token)
        : null,
      tokenExpiresAt: tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000)
        : null,
      scope: tokenResponse.scope ?? null,
      historyId: profile.historyId ?? null,
    });

    await createAuditEntry({
      userId: session.user.id,
      entityType: "gmail_connection",
      entityId: connection.id,
      action: "create",
      changes: { gmailEmail: profile.emailAddress },
      notes: "Connected Gmail for promotion intake",
    });

    const response = NextResponse.redirect(
      new URL("/bets/promo-inbox?gmail=connected", request.url)
    );
    response.cookies.delete("gmail_oauth_state");
    return response;
  } catch (error) {
    console.error("[gmail/callback] Failed to connect Gmail", error);
    return NextResponse.redirect(
      new URL("/bets/promo-inbox?gmail=connect-error", request.url)
    );
  }
}
