import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  listUpcomingMatchesCached,
  searchFootballMatchesCached,
} from "@/lib/db/cached-queries";

/**
 * GET /api/bets/matches - Search or list football matches
 *
 * Query parameters:
 * - search: Optional search term to filter by team name (min 2 chars)
 * - limit: Maximum number of results (default 20, capped at 50)
 *
 * Returns upcoming matches (next 14 days) if no search term provided,
 * or matches matching the search term.
 */
export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawSearch = searchParams.get("search");
  const search = rawSearch?.trim() ?? "";
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit")) || 20, 1),
    50
  );
  const shouldSearch = search.length >= 2;
  const searchFromDate = new Date();
  searchFromDate.setDate(searchFromDate.getDate() - 7);

  try {
    const matches = shouldSearch
      ? // Search for matches by team name
        await searchFootballMatchesCached(
          search.trim().toLowerCase(),
          limit,
          searchFromDate.toISOString()
        )
      : // List upcoming matches
        await listUpcomingMatchesCached(limit);

    // Map to a simpler format for the frontend
    const formattedMatches = matches.map((m) => ({
      id: m.id,
      externalId: m.externalId,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      competition: m.competition,
      competitionCode: m.competitionCode,
      matchDate: m.matchDate.toISOString(),
      status: m.status,
      // Display string for dropdown
      label: `${m.homeTeam} vs ${m.awayTeam}`,
      // Subtext for dropdown
      detail: `${m.competition} • ${new Date(m.matchDate).toLocaleDateString()} ${new Date(m.matchDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    }));

    return NextResponse.json({
      matches: formattedMatches,
      count: formattedMatches.length,
    });
  } catch (error) {
    console.error("[Matches API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch matches" },
      { status: 500 }
    );
  }
}
