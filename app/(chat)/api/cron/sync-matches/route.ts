import { NextResponse } from "next/server";
import {
  upsertFootballMatch,
  type CreateFootballMatchParams,
} from "@/lib/db/queries";
import type { FootballMatchStatus } from "@/lib/db/schema";

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
 * Default competitions to sync if none configured.
 * Popular leagues for matched betting.
 */
const DEFAULT_COMPETITIONS = ["PL", "CL", "EL", "FL1", "BL1", "SA", "PD"];

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
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // In production, require CRON_SECRET. In development, allow without it.
  if (
    process.env.NODE_ENV === "production" &&
    cronSecret &&
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const syncResults = {
    upcoming: { synced: 0, errors: 0 },
    finished: { synced: 0, errors: 0 },
    competitions: DEFAULT_COMPETITIONS,
    startedAt: new Date().toISOString(),
    completedAt: "",
    errors: [] as string[],
  };

  try {
    // Sync upcoming matches (next 14 days)
    const now = new Date();
    const fourteenDaysAhead = new Date();
    fourteenDaysAhead.setDate(fourteenDaysAhead.getDate() + 14);

    console.log(
      `[Match Sync] Fetching upcoming matches from ${formatDate(now)} to ${formatDate(fourteenDaysAhead)}`
    );

    const upcomingMatches = await fetchMatchesFromApi({
      dateFrom: now,
      dateTo: fourteenDaysAhead,
      competitions: DEFAULT_COMPETITIONS,
      status: ["SCHEDULED", "TIMED"],
    });

    console.log(`[Match Sync] Found ${upcomingMatches.length} upcoming matches`);

    for (const match of upcomingMatches) {
      try {
        const params = parseFootballDataMatch(match);
        await upsertFootballMatch(params);
        syncResults.upcoming.synced++;
      } catch (error) {
        syncResults.upcoming.errors++;
        syncResults.errors.push(
          `Failed to sync upcoming match ${match.id}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    // Sync recently finished matches (last 3 days)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    console.log(
      `[Match Sync] Fetching finished matches from ${formatDate(threeDaysAgo)} to ${formatDate(now)}`
    );

    const finishedMatches = await fetchMatchesFromApi({
      dateFrom: threeDaysAgo,
      dateTo: now,
      competitions: DEFAULT_COMPETITIONS,
      status: ["FINISHED"],
    });

    console.log(`[Match Sync] Found ${finishedMatches.length} finished matches`);

    for (const match of finishedMatches) {
      try {
        const params = parseFootballDataMatch(match);
        await upsertFootballMatch(params);
        syncResults.finished.synced++;
      } catch (error) {
        syncResults.finished.errors++;
        syncResults.errors.push(
          `Failed to sync finished match ${match.id}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
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
