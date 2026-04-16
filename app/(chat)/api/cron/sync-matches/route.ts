import { NextResponse } from "next/server";
import {
  batchUpsertFootballMatches,
  type CreateFootballMatchParams,
  countBetsReadyForAutoSettlement,
  getAllEnabledCompetitions,
} from "@/lib/db/queries";
import {
  DEFAULT_COMPETITION_CODES,
  type FootballMatchStatus,
} from "@/lib/db/schema";

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

  console.log(
    "[Match Sync] Auth check - cronSecret set:",
    !!cronSecret,
    "authHeader received:",
    !!authHeader
  );

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

  console.log("[Match Sync] Auth passed, starting sync");

  // Get competitions to sync from user settings (union of all users' enabled competitions)
  // Falls back to DEFAULT_COMPETITION_CODES if no users have configured settings
  let competitionsToSync: string[];
  try {
    competitionsToSync = await getAllEnabledCompetitions();
  } catch (error) {
    console.warn(
      "[Match Sync] Failed to get user competitions, using defaults:",
      error
    );
    competitionsToSync = [...DEFAULT_COMPETITION_CODES];
  }

  const syncResults = {
    upcoming: { synced: 0, errors: 0 },
    finished: { synced: 0, errors: 0 },
    betsReadyForSettlement: 0,
    competitions: competitionsToSync,
    competitionBreakdown: {} as Record<
      string,
      { upcoming: number; finished: number }
    >,
    skippedCompetitions: [] as string[],
    startedAt: new Date().toISOString(),
    completedAt: "",
    errors: [] as string[],
  };

  try {
    const now = new Date();
    const tenDaysAhead = new Date();
    tenDaysAhead.setDate(tenDaysAhead.getDate() + 10);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    // Fetch each competition individually so that tier-restricted or
    // invalid codes don't silently suppress other competitions' matches.
    const allUpcomingMatches: FootballDataMatch[] = [];
    const allFinishedMatches: FootballDataMatch[] = [];

    for (const code of competitionsToSync) {
      try {
        console.log(`[Match Sync] Fetching matches for ${code}...`);

        const upcoming = await fetchMatchesFromApi({
          dateFrom: now,
          dateTo: tenDaysAhead,
          competitions: [code],
          status: ["SCHEDULED", "TIMED"],
        });

        const finished = await fetchMatchesFromApi({
          dateFrom: threeDaysAgo,
          dateTo: now,
          competitions: [code],
          status: ["FINISHED"],
        });

        allUpcomingMatches.push(...upcoming);
        allFinishedMatches.push(...finished);

        syncResults.competitionBreakdown[code] = {
          upcoming: upcoming.length,
          finished: finished.length,
        };

        console.log(
          `[Match Sync] ${code}: ${upcoming.length} upcoming, ${finished.length} finished`
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.warn(
          `[Match Sync] Failed to fetch ${code} (may require higher API tier): ${message}`
        );
        syncResults.skippedCompetitions.push(code);
        syncResults.errors.push(`${code}: ${message}`);
      }
    }

    console.log(
      `[Match Sync] Total: ${allUpcomingMatches.length} upcoming, ${allFinishedMatches.length} finished across ${Object.keys(syncResults.competitionBreakdown).length}/${competitionsToSync.length} competitions`
    );

    // Parse and batch upsert upcoming matches
    if (allUpcomingMatches.length > 0) {
      const upcomingParams = allUpcomingMatches.map(parseFootballDataMatch);
      const upcomingResult = await batchUpsertFootballMatches(upcomingParams);
      syncResults.upcoming.synced = upcomingResult.synced;
      syncResults.upcoming.errors = upcomingResult.errors;
      console.log(
        `[Match Sync] Upcoming: ${upcomingResult.synced} synced, ${upcomingResult.errors} errors`
      );
    }

    // Parse and batch upsert finished matches
    if (allFinishedMatches.length > 0) {
      const finishedParams = allFinishedMatches.map(parseFootballDataMatch);
      const finishedResult = await batchUpsertFootballMatches(finishedParams);
      syncResults.finished.synced = finishedResult.synced;
      syncResults.finished.errors = finishedResult.errors;
      console.log(
        `[Match Sync] Finished: ${finishedResult.synced} synced, ${finishedResult.errors} errors`
      );
    }

    // After syncing finished matches, check for bets ready for auto-settlement
    try {
      syncResults.betsReadyForSettlement =
        await countBetsReadyForAutoSettlement();
      if (syncResults.betsReadyForSettlement > 0) {
        console.log(
          `[Match Sync] Found ${syncResults.betsReadyForSettlement} bets ready for settlement`
        );
      }
    } catch (error) {
      console.warn(
        "[Match Sync] Failed to count bets ready for settlement:",
        error
      );
    }

    syncResults.completedAt = new Date().toISOString();

    if (syncResults.skippedCompetitions.length > 0) {
      console.warn(
        `[Match Sync] Skipped competitions (API tier or invalid code): ${syncResults.skippedCompetitions.join(", ")}`
      );
    }

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
