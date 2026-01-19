import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getFootballMatchById } from "@/lib/db/queries";

/**
 * GET /api/bets/matches/:id - Fetch a single football match by ID
 *
 * Returns a simplified match object used by MatchPicker when a match is already linked.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const match = await getFootballMatchById({ id });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const formattedMatch = {
      id: match.id,
      externalId: match.externalId,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      competition: match.competition,
      competitionCode: match.competitionCode,
      matchDate: match.matchDate.toISOString(),
      status: match.status,
      label: `${match.homeTeam} vs ${match.awayTeam}`,
      detail: `${match.competition} • ${match.matchDate.toLocaleDateString()} ${match.matchDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    };

    return NextResponse.json({ match: formattedMatch });
  } catch (error) {
    console.error("[Matches API] Error fetching match:", error);
    return NextResponse.json(
      { error: "Failed to fetch match" },
      { status: 500 }
    );
  }
}
