import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { listUpcomingMatches, searchFootballMatches } from "@/lib/db/queries";

/**
 * GET /api/bets/matches - Search or list football matches
 *
 * Query parameters:
 * - search: Optional search term to filter by team name
 * - limit: Maximum number of results (default 20)
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
  const search = searchParams.get("search");
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);

  try {
    type SearchMatchRow = Awaited<
      ReturnType<typeof searchFootballMatches>
    >[number];
    type UpcomingMatchRow = Awaited<
      ReturnType<typeof listUpcomingMatches>
    >[number];
    type MatchRow = SearchMatchRow | UpcomingMatchRow;
    let matches: MatchRow[] = [];

    if (search && search.trim().length > 0) {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 14);

      // Search for matches by team name
      matches = await searchFootballMatches({
        searchTerm: search.trim(),
        fromDate,
        limit,
      });
    } else {
      // List upcoming matches
      matches = await listUpcomingMatches({
        daysAhead: 14,
      });
    }

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
