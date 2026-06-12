import type { CreateFootballMatchParams } from "@/lib/db/queries";

/**
 * A normalized match record produced by any match-data provider.
 *
 * This is intentionally identical to CreateFootballMatchParams so that every
 * provider feeds the existing FootballMatch cache (and downstream match-linking
 * + auto-settlement) without any further translation.
 */
export type ProviderMatch = CreateFootballMatchParams;

/**
 * Window + competition filter passed to a provider's fetch methods.
 * `competitions` holds provider-specific identifiers (football-data codes like
 * "PL", or odds-api league slugs like "england-premier-league").
 */
export type FetchMatchesOptions = {
  competitions: string[];
  from: Date;
  to: Date;
};

/**
 * A pluggable source of football fixtures + scores.
 *
 * Why this abstraction exists: the app caches matches locally in FootballMatch
 * and only the daily sync cron touches an external API. Keeping the source
 * behind this interface lets us swap providers (or fall back) without changing
 * the cache schema, match-linking, or settlement code.
 *
 * IMPORTANT: only one provider should be active per dataset at a time. Running
 * two providers simultaneously would create duplicate FootballMatch rows (each
 * provider mints its own numeric externalId for the same real-world match),
 * which would break match-linking and exposure grouping.
 */
export type MatchProvider = {
  /** Stable identifier, e.g. "football-data" or "odds-api". */
  id: string;
  /** Human-readable name for logs/UI. */
  label: string;
  /** True when the provider has the env/config it needs to run. */
  isConfigured(): boolean;
  /**
   * Resolve which competition identifiers this provider should sync.
   *
   * Providers may ignore `userEnabled` if it is expressed in a different
   * namespace (e.g. odds-api uses league slugs, not football-data codes), and
   * may perform dynamic discovery to drop competitions that are currently out
   * of season.
   */
  resolveCompetitions(userEnabled: string[]): Promise<string[]>;
  /** Fetch upcoming (not-yet-started) fixtures in the window. */
  fetchUpcoming(options: FetchMatchesOptions): Promise<ProviderMatch[]>;
  /** Fetch recently finished fixtures (with scores) in the window. */
  fetchFinished(options: FetchMatchesOptions): Promise<ProviderMatch[]>;
};
