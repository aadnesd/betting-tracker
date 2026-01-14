import { NextResponse } from "next/server";
import {
  batchUpsertFootballMatches,
  getAllEnabledCompetitions,
  countBetsReadyForAutoSettlement,
  type CreateFootballMatchParams,
} from "@/lib/db/queries";
import { DEFAULT_COMPETITION_CODES, type FootballMatchStatus } from "@/lib/db/schema";

/**
 * Football-data.org API v4 response types.
 * These match the actual API response structure.
 */
interface FootballDataMatch {
  id: number;
  utcDate: string;
  status:
    | "SCHEDULED"
    | "TIMED"
    | "IN_PLAY"
    | "PAUSED"
    | "FINISHED"
    | "POSTPONED"
    | "SUSPENDED"
    | "CANCELLED";
  homeTeam: {
    id: number;
    name: string;
    shortName?: string;
    tla?: string;
  };
  awayTeam: {
    id: number;
    name: string;
    shortName?: string;
    tla?: string;
  };
  competition: {
    id: number;
    name: string;
    code: string;
  };
  score: {
    fullTime: {
      home: number | null;
      away: number | null;
    };
  };
}

interface FootballDataResponse {
  matches: FootballDataMatch[];
  resultSet?: {
    count: number;
    competitions: string;
    first: string;
    last: string;
  };
}

/**
 * Parse a football-data.org match into our CreateFootballMatchParams format.
 */
export function parseFootballDataMatch(
  match: FootballDataMatch
): CreateFootballMatchParams {
  return {
    externalId: match.id,
    homeTeam: match.homeTeam.name,
    awayTeam: match.awayTeam.name,
    competition: match.competition.name,
    competitionCode: match.competition.code,
    matchDate: new Date(match.utcDate),
    status: match.status as FootballMatchStatus,
    homeScore: match.score.fullTime.home,
    awayScore: match.score.fullTime.away,
  };
}

/**
 * Format a date as YYYY-MM-DD for the API.
 */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Fetch matches from football-data.org API.
 */
async function fetchMatchesFromApi({
  dateFrom,
  dateTo,
  competitions,
  status,
}: {
  dateFrom: Date;
  dateTo: Date;
  competitions?: string[];
  status?: string[];
}): Promise<FootballDataMatch[]> {
  const apiToken = process.env.FOOTBALL_DATA_API_TOKEN;

  if (!apiToken) {
    throw new Error("FOOTBALL_DATA_API_TOKEN environment variable not set");
  }

  const url = new URL("https://api.football-data.org/v4/matches");
  url.searchParams.set("dateFrom", formatDate(dateFrom));
  url.searchParams.set("dateTo", formatDate(dateTo));

  if (competitions?.length) {
    url.searchParams.set("competitions", competitions.join(","));
  }

  if (status?.length) {
    url.searchParams.set("status", status.join(","));
  }

  const response = await fetch(url.toString(), {
    headers: {
      "X-Auth-Token": apiToken,
    },
    // Add cache: no-store to prevent caching
    cache: "no-store",
  });

  // Handle rate limiting
  if (response.status === 429) {
    const retryAfter = response.headers.get("X-RequestCounter-Reset");
    throw new Error(
      `Rate limited by football-data.org API. Retry after: ${retryAfter || "unknown"}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Football-data.org API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data: FootballDataResponse = await response.json();
  return data.matches;
}

/**
 * Sync matches from football-data.org to our database.
 * This is a cron job endpoint that runs daily via Vercel cron.
 *
 * Syncs:
 * - Upcoming matches (next 14 days) - SCHEDULED/TIMED
 * - Recently finished matches (last 3 days) - FINISHED
 *
 * Authorization:
 * Uses CRON_SECRET header for Vercel cron authorization.
 */
export async function GET(request: Request) {
  console.log("[Match Sync] Request received");
  
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  console.log("[Match Sync] Auth check - cronSecret set:", !!cronSecret, "authHeader received:", !!authHeader);

  // In production, require CRON_SECRET if it's configured
  // Vercel cron jobs automatically send: Authorization: Bearer <CRON_SECRET>
  if (process.env.NODE_ENV === "production" && cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.log("[Match Sync] Auth FAILED - header mismatch");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  
  console.log("[Match Sync] Auth passed, starting sync");

  // Get competitions to sync from user settings (union of all users' enabled competitions)
  // Falls back to DEFAULT_COMPETITION_CODES if no users have configured settings
  let competitionsToSync: string[];
  try {
    competitionsToSync = await getAllEnabledCompetitions();
  } catch (error) {
    console.warn("[Match Sync] Failed to get user competitions, using defaults:", error);
    competitionsToSync = [...DEFAULT_COMPETITION_CODES];
  }

  const syncResults = {
    upcoming: { synced: 0, errors: 0 },
    finished: { synced: 0, errors: 0 },
    betsReadyForSettlement: 0,
    competitions: competitionsToSync,
    startedAt: new Date().toISOString(),
    completedAt: "",
    errors: [] as string[],
  };

  try {
    // Sync upcoming matches (next 10 days - API limit)
    const now = new Date();
    const tenDaysAhead = new Date();
    tenDaysAhead.setDate(tenDaysAhead.getDate() + 10);

    console.log(
      `[Match Sync] Fetching upcoming matches from ${formatDate(now)} to ${formatDate(tenDaysAhead)} for competitions: ${competitionsToSync.join(", ")}`
    );

    const upcomingMatches = await fetchMatchesFromApi({
      dateFrom: now,
      dateTo: tenDaysAhead,
      competitions: competitionsToSync,
      status: ["SCHEDULED", "TIMED"],
    });

    console.log(`[Match Sync] Found ${upcomingMatches.length} upcoming matches`);

    // Parse all matches and batch upsert
    const upcomingParams = upcomingMatches.map(parseFootballDataMatch);
    console.log(`[Match Sync] Batch upserting ${upcomingParams.length} upcoming matches...`);
    const upcomingResult = await batchUpsertFootballMatches(upcomingParams);
    syncResults.upcoming.synced = upcomingResult.synced;
    syncResults.upcoming.errors = upcomingResult.errors;
    console.log(`[Match Sync] Upcoming matches: ${upcomingResult.synced} synced, ${upcomingResult.errors} errors`);

    // Sync recently finished matches (last 3 days)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    console.log(
      `[Match Sync] Fetching finished matches from ${formatDate(threeDaysAgo)} to ${formatDate(now)}`
    );

    const finishedMatches = await fetchMatchesFromApi({
      dateFrom: threeDaysAgo,
      dateTo: now,
      competitions: competitionsToSync,
      status: ["FINISHED"],
    });

    console.log(`[Match Sync] Found ${finishedMatches.length} finished matches`);

    // Parse all matches and batch upsert
    const finishedParams = finishedMatches.map(parseFootballDataMatch);
    console.log(`[Match Sync] Batch upserting ${finishedParams.length} finished matches...`);
    const finishedResult = await batchUpsertFootballMatches(finishedParams);
    syncResults.finished.synced = finishedResult.synced;
    syncResults.finished.errors = finishedResult.errors;
    console.log(`[Match Sync] Finished matches: ${finishedResult.synced} synced, ${finishedResult.errors} errors`);

    // After syncing finished matches, check for bets ready for auto-settlement
    // These are matched bets linked to FINISHED matches with scores available
    try {
      syncResults.betsReadyForSettlement = await countBetsReadyForAutoSettlement();
      if (syncResults.betsReadyForSettlement > 0) {
        console.log(
          `[Match Sync] Found ${syncResults.betsReadyForSettlement} bets ready for settlement`
        );
      }
    } catch (error) {
      console.warn("[Match Sync] Failed to count bets ready for settlement:", error);
    }

    syncResults.completedAt = new Date().toISOString();

    console.log(
      `[Match Sync] Complete. Upcoming: ${syncResults.upcoming.synced} synced, ${syncResults.upcoming.errors} errors. Finished: ${syncResults.finished.synced} synced, ${syncResults.finished.errors} errors.`
    );

    return NextResponse.json({
      success: true,
      message: "Match sync completed",
      results: syncResults,
    });
  } catch (error) {
    console.error("[Match Sync] Fatal error:", error);

    syncResults.completedAt = new Date().toISOString();
    syncResults.errors.push(
      `Fatal sync error: ${error instanceof Error ? error.message : "Unknown error"}`
    );

    return NextResponse.json(
      {
        success: false,
        message: "Match sync failed",
        results: syncResults,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
