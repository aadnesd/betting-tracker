import {
  DEFAULT_COMPETITION_CODES,
  type FootballMatchStatus,
} from "@/lib/db/schema";
import type {
  FetchMatchesOptions,
  MatchProvider,
  ProviderMatch,
} from "@/lib/matches/types";

/**
 * Football-data.org API v4 response types.
 * These match the actual API response structure.
 */
export type FootballDataMatch = {
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
};

type FootballDataResponse = {
  matches: FootballDataMatch[];
  resultSet?: {
    count: number;
    competitions: string;
    first: string;
    last: string;
  };
};

/**
 * Parse a football-data.org match into our ProviderMatch format.
 */
export function parseFootballDataMatch(
  match: FootballDataMatch
): ProviderMatch {
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
 * football-data.org provider — the original (default fallback) match source.
 * Competition identifiers are football-data competition codes (e.g. "PL").
 */
export const footballDataProvider: MatchProvider = {
  id: "football-data",
  label: "football-data.org",

  isConfigured() {
    return Boolean(process.env.FOOTBALL_DATA_API_TOKEN);
  },

  resolveCompetitions(userEnabled: string[]) {
    const competitions =
      userEnabled.length > 0 ? userEnabled : [...DEFAULT_COMPETITION_CODES];
    return Promise.resolve(competitions);
  },

  async fetchUpcoming({ competitions, from, to }: FetchMatchesOptions) {
    const matches = await fetchMatchesFromApi({
      dateFrom: from,
      dateTo: to,
      competitions,
      status: ["SCHEDULED", "TIMED"],
    });
    return matches.map(parseFootballDataMatch);
  },

  async fetchFinished({ competitions, from, to }: FetchMatchesOptions) {
    const matches = await fetchMatchesFromApi({
      dateFrom: from,
      dateTo: to,
      competitions,
      status: ["FINISHED"],
    });
    return matches.map(parseFootballDataMatch);
  },
};
