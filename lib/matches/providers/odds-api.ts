import type { FootballMatchStatus } from "@/lib/db/schema";
import type {
  FetchMatchesOptions,
  MatchProvider,
  ProviderMatch,
} from "@/lib/matches/types";

const ODDS_API_BASE_URL = "https://api.odds-api.io/v3";
const FOOTBALL_SPORT_SLUG = "football";
/** Per-league event cap; windows are small (days), so this is generous. */
const EVENTS_PER_LEAGUE_LIMIT = 400;

/**
 * Curated set of league slugs we want to track on odds-api.io.
 *
 * Override at runtime with ODDS_API_LEAGUES (comma-separated). When the app's
 * competition settings are available, resolveCompetitions narrows this list
 * to the selected competitions.
 */
export const DEFAULT_ODDS_API_LEAGUES = [
  // Internationals
  "international-fifa-world-cup",
  "international-uefa-nations-league",
  // UEFA club competitions
  "uefa-champions-league",
  "uefa-europa-league",
  "uefa-europa-conference-league",
  // England
  "england-premier-league",
  "england-championship",
  "england-fa-cup",
  "england-efl-cup",
  // Spain
  "spain-laliga",
  "spain-copa-del-rey",
  // Other top-5
  "germany-bundesliga",
  "italy-serie-a",
  "france-ligue-1",
  // Requested long-tail leagues
  "netherlands-eredivisie",
  "denmark-superligaen",
  "sweden-allsvenskan",
  "norway-eliteserien",
  "usa-mls",
];

type OddsApiPeriodScore = {
  home: number | null;
  away: number | null;
};

type OddsApiEvent = {
  id: number;
  home: string;
  away: string;
  date: string;
  status?: string;
  league?: { name?: string; slug?: string };
  scores?: {
    home?: number | null;
    away?: number | null;
    periods?: Record<string, OddsApiPeriodScore>;
  };
};

/**
 * Map odds-api.io event status to our FootballMatch status enum.
 * odds-api statuses: pending, live, settled, cancelled.
 */
export function mapOddsApiStatus(
  status: string | undefined
): FootballMatchStatus {
  switch ((status ?? "").toLowerCase()) {
    case "pending":
      return "SCHEDULED";
    case "live":
      return "IN_PLAY";
    case "settled":
      return "FINISHED";
    case "cancelled":
      return "CANCELLED";
    default:
      return "SCHEDULED";
  }
}

/**
 * Derive the regulation-time score from an odds-api event.
 *
 * We prefer periods.ft (full-time / regulation result) to match the settlement
 * semantics used by football-data.org's fullTime score. We fall back to the
 * top-level score (which is OT/penalty-inclusive) only when ft is absent.
 */
function deriveScores(event: OddsApiEvent): {
  homeScore: number | null;
  awayScore: number | null;
} {
  const ft = event.scores?.periods?.ft;
  if (ft && typeof ft.home === "number" && typeof ft.away === "number") {
    return { homeScore: ft.home, awayScore: ft.away };
  }

  const top = event.scores;
  if (top && typeof top.home === "number" && typeof top.away === "number") {
    return { homeScore: top.home, awayScore: top.away };
  }

  return { homeScore: null, awayScore: null };
}

/**
 * Parse an odds-api.io event into our ProviderMatch format.
 *
 * NOTE: competitionCode is left null because FootballMatch.competitionCode is
 * varchar(10) and odds-api league slugs (e.g. "england-premier-league") exceed
 * that. The full league name is stored in `competition`. Widening that column
 * is a recommended follow-up if slug-based filtering is ever needed.
 */
export function parseOddsApiEvent(event: OddsApiEvent): ProviderMatch {
  const { homeScore, awayScore } = deriveScores(event);
  return {
    externalId: event.id,
    homeTeam: event.home,
    awayTeam: event.away,
    competition: event.league?.name ?? event.league?.slug ?? "Unknown",
    competitionCode: undefined,
    matchDate: new Date(event.date),
    status: mapOddsApiStatus(event.status),
    homeScore,
    awayScore,
  };
}

function getApiKey(): string {
  const apiKey = process.env.ODDS_API_API_KEY;
  if (!apiKey) {
    throw new Error("ODDS_API_API_KEY environment variable not set");
  }
  return apiKey;
}

async function oddsApiGet<T>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  const url = new URL(`${ODDS_API_BASE_URL}${path}`);
  url.searchParams.set("apiKey", getApiKey());
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), { cache: "no-store" });

  if (response.status === 429) {
    const reset = response.headers.get("x-ratelimit-reset");
    throw new Error(
      `Rate limited by odds-api.io. Limit resets at: ${reset || "unknown"}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `odds-api.io error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return (await response.json()) as T;
}

/** Fetch events for a single league + status within a window. */
async function fetchEventsForLeague({
  league,
  status,
  from,
  to,
}: {
  league: string;
  status: "pending" | "settled";
  from: Date;
  to: Date;
}): Promise<OddsApiEvent[]> {
  return await oddsApiGet<OddsApiEvent[]>("/events", {
    sport: FOOTBALL_SPORT_SLUG,
    league,
    status,
    from: from.toISOString(),
    to: to.toISOString(),
    limit: String(EVENTS_PER_LEAGUE_LIMIT),
  });
}

/** Map the app's competition codes to odds-api.io league slugs. */
const ODDS_API_LEAGUE_BY_CODE: Record<string, string> = {
  ALL: "sweden-allsvenskan",
  BL1: "germany-bundesliga",
  CLI: "south-america-copa-libertadores",
  CL: "uefa-champions-league",
  DED: "netherlands-eredivisie",
  EC: "uefa-europa-conference-league",
  EFL: "england-efl-cup",
  ELC: "england-championship",
  EL: "uefa-europa-league",
  FAC: "england-fa-cup",
  FL1: "france-ligue-1",
  PD: "spain-laliga",
  PL: "england-premier-league",
  PPL: "portugal-primeira-liga",
  SA: "italy-serie-a",
  TIP: "norway-eliteserien",
  WC: "international-fifa-world-cup",
};

/** Read configured target leagues from env or selected app competitions. */
function getTargetLeagues(userEnabled: string[]): string[] {
  const raw = process.env.ODDS_API_LEAGUES;
  if (raw) {
    const slugs = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (slugs.length > 0) {
      return slugs;
    }
  }

  const selected = userEnabled
    .map((code) => ODDS_API_LEAGUE_BY_CODE[code])
    .filter((slug): slug is string => Boolean(slug));

  return selected.length > 0 ? selected : [...DEFAULT_ODDS_API_LEAGUES];
}

/**
 * Fetch events across multiple leagues for a given status.
 * Failures on individual leagues are logged and skipped so one bad slug does
 * not abort the whole sync.
 */
async function fetchAcrossLeagues({
  competitions,
  status,
  from,
  to,
}: {
  competitions: string[];
  status: "pending" | "settled";
  from: Date;
  to: Date;
}): Promise<ProviderMatch[]> {
  const results = await Promise.all(
    competitions.map(async (league) => {
      try {
        const events = await fetchEventsForLeague({ league, status, from, to });
        return events.map(parseOddsApiEvent);
      } catch (error) {
        console.warn(
          `[odds-api] Failed to fetch ${status} events for "${league}":`,
          error instanceof Error ? error.message : error
        );
        return [];
      }
    })
  );
  return results.flat();
}

/**
 * odds-api.io provider — broad coverage (395+ football leagues, multi-sport).
 * Competition identifiers are odds-api league slugs (e.g.
 * "england-premier-league").
 *
 * The target list is deliberately allowlisted. We request those slugs
 * directly instead of treating the provider's league catalog as authoritative:
 * the catalog can omit a competition even when its events endpoint supports it.
 */
export const oddsApiProvider: MatchProvider = {
  id: "odds-api",
  label: "odds-api.io",

  isConfigured() {
    return Boolean(process.env.ODDS_API_API_KEY);
  },

  async resolveCompetitions(userEnabled: string[]) {
    return getTargetLeagues(userEnabled);
  },

  async fetchUpcoming({ competitions, from, to }: FetchMatchesOptions) {
    return await fetchAcrossLeagues({
      competitions,
      status: "pending",
      from,
      to,
    });
  },

  async fetchFinished({ competitions, from, to }: FetchMatchesOptions) {
    return await fetchAcrossLeagues({
      competitions,
      status: "settled",
      from,
      to,
    });
  },
};
