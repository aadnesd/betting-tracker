import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { runMatchSync } from "@/lib/matches/sync";

/** Minimum gap between manual syncs to avoid burning the provider quota. */
const MANUAL_SYNC_COOLDOWN_MS = 30_000;

// Best-effort in-process throttle (per serverless instance).
let lastManualSyncAt = 0;

/**
 * POST /api/bets/matches/sync
 *
 * Lets an authenticated user trigger a match sync on demand (same logic as the
 * daily cron). Useful to pull in just-settled scores without waiting for the
 * next scheduled run.
 */
export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  if (now - lastManualSyncAt < MANUAL_SYNC_COOLDOWN_MS) {
    const retryInSeconds = Math.ceil(
      (MANUAL_SYNC_COOLDOWN_MS - (now - lastManualSyncAt)) / 1000
    );
    return NextResponse.json(
      {
        success: false,
        error: `Sync was just run. Try again in ${retryInSeconds}s.`,
      },
      { status: 429 }
    );
  }
  lastManualSyncAt = now;

  try {
    const results = await runMatchSync();
    return NextResponse.json({
      success: true,
      message: "Match sync completed",
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Match sync failed",
      },
      { status: 500 }
    );
  }
}
