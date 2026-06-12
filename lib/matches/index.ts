import { footballDataProvider } from "@/lib/matches/providers/football-data";
import { oddsApiProvider } from "@/lib/matches/providers/odds-api";
import type { MatchProvider } from "@/lib/matches/types";

const PROVIDERS = {
  "football-data": footballDataProvider,
  "odds-api": oddsApiProvider,
} as const;

type ProviderId = keyof typeof PROVIDERS;

function isProviderId(value: string): value is ProviderId {
  return value === "football-data" || value === "odds-api";
}

/**
 * Determine which provider we'd like to use, before checking configuration.
 *
 * Selection order:
 * 1. Explicit MATCH_PROVIDER env var ("odds-api" | "football-data").
 * 2. odds-api when its API key is present (broader coverage).
 * 3. football-data otherwise (original default).
 */
function getPreferredProviderId(): ProviderId {
  const configured = process.env.MATCH_PROVIDER?.trim().toLowerCase();
  if (configured && isProviderId(configured)) {
    return configured;
  }
  if (process.env.ODDS_API_API_KEY) {
    return "odds-api";
  }
  return "football-data";
}

/**
 * Return the active match provider, falling back to any other configured
 * provider when the preferred one is missing its credentials.
 *
 * If nothing is configured, the preferred provider is returned so the caller
 * surfaces a clear configuration error when it tries to fetch.
 */
export function getActiveProvider(): MatchProvider {
  const preferred = PROVIDERS[getPreferredProviderId()];
  if (preferred.isConfigured()) {
    return preferred;
  }

  const fallback = Object.values(PROVIDERS).find(
    (provider) => provider.id !== preferred.id && provider.isConfigured()
  );

  if (fallback) {
    console.warn(
      `[matches] Provider "${preferred.id}" is not configured; falling back to "${fallback.id}".`
    );
    return fallback;
  }

  return preferred;
}

export { footballDataProvider } from "@/lib/matches/providers/football-data";
export { oddsApiProvider } from "@/lib/matches/providers/odds-api";
export type {
  FetchMatchesOptions,
  MatchProvider,
  ProviderMatch,
} from "@/lib/matches/types";
