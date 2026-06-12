import { NextResponse } from "next/server";
import { runMatchSync } from "@/lib/matches/sync";

// Re-exported for backwards compatibility with existing tests/importers.
export { parseFootballDataMatch } from "@/lib/matches/providers/football-data";

/**
 * Sync matches from the active match provider into our local FootballMatch cache.
 * This is a cron job endpoint that runs daily via Vercel cron.
 *
 * The data source is pluggable (see lib/matches): odds-api.io when configured,
 * otherwise football-data.org. Both feed the same FootballMatch cache, so
 * match-linking and auto-settlement are unaffected by the choice.
 *
 * Authorization:
 * Uses CRON_SECRET header for Vercel cron authorization.
 */
export async function GET(request: Request) {
  console.log("[Match Sync] Request received");

  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // In production, require CRON_SECRET if it's configured
  // Vercel cron jobs automatically send: Authorization: Bearer <CRON_SECRET>
  if (
    process.env.NODE_ENV === "production" &&
    cronSecret &&
    authHeader !== `Bearer ${cronSecret}`
  ) {
    console.log("[Match Sync] Auth FAILED - header mismatch");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runMatchSync();
    return NextResponse.json({
      success: true,
      message: "Match sync completed",
      results,
    });
  } catch (error) {
    console.error("[Match Sync] Fatal error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Match sync failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
