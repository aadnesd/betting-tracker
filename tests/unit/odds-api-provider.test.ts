/**
 * Unit tests for the odds-api.io provider and provider selection.
 *
 * Why: Validates the mapping from odds-api.io events into our ProviderMatch
 * shape (status, regulation-time scores, league name) and the env-based
 * selection/fallback between providers. Pure logic only — no network calls.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock server-only + DB drivers so importing schema-dependent modules is safe.
vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: vi.fn(() => ({})) }));
vi.mock("postgres", () => ({ default: vi.fn(() => ({})) }));

import {
  DEFAULT_ODDS_API_LEAGUES,
  mapOddsApiStatus,
  parseOddsApiEvent,
} from "@/lib/matches/providers/odds-api";

const baseEvent = {
  id: 69_455_182,
  home: "Manchester City",
  away: "Arsenal",
  date: "2026-01-15T15:00:00Z",
  status: "pending",
  league: { name: "England - Premier League", slug: "england-premier-league" },
};

describe("mapOddsApiStatus", () => {
  it("maps known statuses to the FootballMatch enum", () => {
    expect(mapOddsApiStatus("pending")).toBe("SCHEDULED");
    expect(mapOddsApiStatus("live")).toBe("IN_PLAY");
    expect(mapOddsApiStatus("settled")).toBe("FINISHED");
    expect(mapOddsApiStatus("cancelled")).toBe("CANCELLED");
  });

  it("is case-insensitive", () => {
    expect(mapOddsApiStatus("SETTLED")).toBe("FINISHED");
  });

  it("defaults unknown/missing statuses to SCHEDULED", () => {
    expect(mapOddsApiStatus("weird")).toBe("SCHEDULED");
    expect(mapOddsApiStatus(undefined)).toBe("SCHEDULED");
  });
});

describe("parseOddsApiEvent", () => {
  it("parses a pending event with no scores", () => {
    const result = parseOddsApiEvent(baseEvent);
    expect(result.externalId).toBe(69_455_182);
    expect(result.homeTeam).toBe("Manchester City");
    expect(result.awayTeam).toBe("Arsenal");
    expect(result.competition).toBe("England - Premier League");
    expect(result.status).toBe("SCHEDULED");
    expect(result.homeScore).toBeNull();
    expect(result.awayScore).toBeNull();
    expect(result.matchDate).toBeInstanceOf(Date);
    expect(result.matchDate.toISOString()).toBe("2026-01-15T15:00:00.000Z");
  });

  it("leaves competitionCode undefined (slug does not fit varchar(10))", () => {
    const result = parseOddsApiEvent(baseEvent);
    expect(result.competitionCode).toBeUndefined();
  });

  it("prefers the full-time (regulation) period score", () => {
    const result = parseOddsApiEvent({
      ...baseEvent,
      status: "settled",
      scores: {
        home: 3, // OT/penalty-inclusive top-level
        away: 2,
        periods: { p1: { home: 1, away: 0 }, ft: { home: 2, away: 2 } },
      },
    });
    expect(result.status).toBe("FINISHED");
    expect(result.homeScore).toBe(2);
    expect(result.awayScore).toBe(2);
  });

  it("falls back to top-level score when ft is absent", () => {
    const result = parseOddsApiEvent({
      ...baseEvent,
      status: "settled",
      scores: { home: 1, away: 0, periods: { p1: { home: 0, away: 0 } } },
    });
    expect(result.homeScore).toBe(1);
    expect(result.awayScore).toBe(0);
  });

  it("preserves a 0-0 result instead of treating it as null", () => {
    const result = parseOddsApiEvent({
      ...baseEvent,
      status: "settled",
      scores: { periods: { ft: { home: 0, away: 0 } } },
    });
    expect(result.homeScore).toBe(0);
    expect(result.awayScore).toBe(0);
  });

  it("uses the slug when league name is missing", () => {
    const result = parseOddsApiEvent({
      ...baseEvent,
      league: { slug: "norway-eliteserien" },
    });
    expect(result.competition).toBe("norway-eliteserien");
  });
});

describe("DEFAULT_ODDS_API_LEAGUES", () => {
  it("includes the requested long-tail and international competitions", () => {
    for (const slug of [
      "international-fifa-world-cup",
      "international-uefa-nations-league",
      "uefa-europa-league",
      "uefa-europa-conference-league",
      "england-fa-cup",
      "england-efl-cup",
      "spain-copa-del-rey",
      "netherlands-eredivisie",
      "denmark-superligaen",
      "sweden-allsvenskan",
      "norway-eliteserien",
      "usa-mls",
    ]) {
      expect(DEFAULT_ODDS_API_LEAGUES).toContain(slug);
    }
  });
});

describe("getActiveProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadActiveProvider() {
    const mod = await import("@/lib/matches");
    return mod.getActiveProvider();
  }

  it("uses MATCH_PROVIDER when explicitly set", async () => {
    vi.stubEnv("MATCH_PROVIDER", "football-data");
    vi.stubEnv("FOOTBALL_DATA_API_TOKEN", "token");
    vi.stubEnv("ODDS_API_API_KEY", "key");
    expect((await loadActiveProvider()).id).toBe("football-data");
  });

  it("defaults to odds-api when its key is present", async () => {
    vi.stubEnv("MATCH_PROVIDER", "");
    vi.stubEnv("ODDS_API_API_KEY", "key");
    expect((await loadActiveProvider()).id).toBe("odds-api");
  });

  it("falls back to a configured provider when the preferred one is not configured", async () => {
    // Prefer odds-api by env, but it has no key — should fall back to football-data.
    vi.stubEnv("MATCH_PROVIDER", "odds-api");
    vi.stubEnv("ODDS_API_API_KEY", "");
    vi.stubEnv("FOOTBALL_DATA_API_TOKEN", "token");
    expect((await loadActiveProvider()).id).toBe("football-data");
  });
});
