import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  generateShortcutApiKey,
  getShortcutApiKeyInfo,
  revokeShortcutApiKey,
} from "@/lib/db/queries";

/**
 * GET /api/bets/settings/api-keys
 *
 * Returns the user's API key status (has key, hint, created date).
 * Does NOT return the actual key - that is only shown once on generation.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyInfo = await getShortcutApiKeyInfo({ userId: session.user.id });

  return NextResponse.json(keyInfo);
}

/**
 * POST /api/bets/settings/api-keys
 *
 * Generates a new API key for the user.
 * Returns the full key - this is the ONLY time it will be visible.
 * Any existing key is replaced.
 */
export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateShortcutApiKey({ userId: session.user.id });

  return NextResponse.json({
    success: true,
    key: result.key,
    hint: result.hint,
    createdAt: result.createdAt.toISOString(),
  });
}

/**
 * DELETE /api/bets/settings/api-keys
 *
 * Revokes the user's API key.
 * Any future requests with this key will be rejected.
 */
export async function DELETE() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const revoked = await revokeShortcutApiKey({ userId: session.user.id });

  if (!revoked) {
    return NextResponse.json(
      { error: "No API key to revoke" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
