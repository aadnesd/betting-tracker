import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getFootballMatchByIdCached } from "@/lib/db/cached-queries";
import {
  DEFAULT_ODDS_BOOKMAKER,
  fetchMatchResultOdds,
} from "@/lib/matches/providers/odds-api";

/**
 * GET /api/bets/matches/:id/odds - Fetch match-result (1X2) odds for a linked match
 *
 * Query parameters:
 * - bookmaker: Optional bookmaker name (defaults to "Stake").
 *
 * Uses the synced FootballMatch's externalId as the odds-api.io event id, so it
 * only resolves odds when odds-api.io is the active match provider (its key is
 * set and externalIds are odds-api event ids). Returns null odds otherwise.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ODDS_API_API_KEY) {
    return NextResponse.json({ odds: null, configured: false });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const bookmaker =
    searchParams.get("bookmaker")?.trim() || DEFAULT_ODDS_BOOKMAKER;

  try {
    const match = await getFootballMatchByIdCached(id);

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const odds = await fetchMatchResultOdds({
      eventId: match.externalId,
      bookmaker,
    });

    return NextResponse.json({ odds, configured: true });
  } catch (error) {
    console.error("[Matches API] Error fetching match odds:", error);
    return NextResponse.json(
      { error: "Failed to fetch match odds" },
      { status: 500 }
    );
  }
}
