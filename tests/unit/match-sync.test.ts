/**
 * Unit tests for match sync API parsing functions.
 *
 * Why: Validates that the football-data.org API response parsing works correctly
 * for the match sync cron job. This ensures matches are correctly transformed
 * from the external API format to our internal database format.
 */
import { describe, expect, it, vi } from "vitest";

// Mock server-only to allow testing server modules
vi.mock("server-only", () => ({}));

// Mock drizzle to avoid DB connection
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({})),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({})),
}));

// Import the parser function directly
import { parseFootballDataMatch } from "@/app/(chat)/api/cron/sync-matches/route";

describe("Match Sync Parser", () => {
  describe("parseFootballDataMatch", () => {
    const sampleMatch = {
      id: 432123,
      utcDate: "2026-01-15T15:00:00Z",
      status: "SCHEDULED" as const,
      homeTeam: {
        id: 57,
        name: "Arsenal FC",
        shortName: "Arsenal",
        tla: "ARS",
      },
      awayTeam: {
        id: 61,
        name: "Chelsea FC",
        shortName: "Chelsea",
        tla: "CHE",
      },
      competition: {
        id: 2021,
        name: "Premier League",
        code: "PL",
      },
      score: {
        fullTime: {
          home: null,
          away: null,
        },
      },
    };

    it("should parse external match ID correctly", () => {
      const result = parseFootballDataMatch(sampleMatch);
      expect(result.externalId).toBe(432123);
    });

    it("should parse home team name correctly", () => {
      const result = parseFootballDataMatch(sampleMatch);
      expect(result.homeTeam).toBe("Arsenal FC");
    });

    it("should parse away team name correctly", () => {
      const result = parseFootballDataMatch(sampleMatch);
      expect(result.awayTeam).toBe("Chelsea FC");
    });

    it("should parse competition name correctly", () => {
      const result = parseFootballDataMatch(sampleMatch);
      expect(result.competition).toBe("Premier League");
    });

    it("should parse competition code correctly", () => {
      const result = parseFootballDataMatch(sampleMatch);
      expect(result.competitionCode).toBe("PL");
    });

    it("should parse match date as Date object", () => {
      const result = parseFootballDataMatch(sampleMatch);
      expect(result.matchDate).toBeInstanceOf(Date);
      expect(result.matchDate.toISOString()).toBe("2026-01-15T15:00:00.000Z");
    });

    it("should parse status correctly", () => {
      const result = parseFootballDataMatch(sampleMatch);
      expect(result.status).toBe("SCHEDULED");
    });

    it("should handle null scores for scheduled matches", () => {
      const result = parseFootballDataMatch(sampleMatch);
      expect(result.homeScore).toBeNull();
      expect(result.awayScore).toBeNull();
    });

    it("should parse finished match with scores", () => {
      const finishedMatch = {
        ...sampleMatch,
        status: "FINISHED" as const,
        score: {
          fullTime: {
            home: 2,
            away: 1,
          },
        },
      };

      const result = parseFootballDataMatch(finishedMatch);
      expect(result.status).toBe("FINISHED");
      expect(result.homeScore).toBe(2);
      expect(result.awayScore).toBe(1);
    });

    it("should parse draw correctly", () => {
      const drawMatch = {
        ...sampleMatch,
        status: "FINISHED" as const,
        score: {
          fullTime: {
            home: 1,
            away: 1,
          },
        },
      };

      const result = parseFootballDataMatch(drawMatch);
      expect(result.homeScore).toBe(1);
      expect(result.awayScore).toBe(1);
    });

    it("should handle IN_PLAY status", () => {
      const inPlayMatch = {
        ...sampleMatch,
        status: "IN_PLAY" as const,
        score: {
          fullTime: {
            home: 0,
            away: 0,
          },
        },
      };

      const result = parseFootballDataMatch(inPlayMatch);
      expect(result.status).toBe("IN_PLAY");
    });

    it("should handle POSTPONED status", () => {
      const postponedMatch = {
        ...sampleMatch,
        status: "POSTPONED" as const,
      };

      const result = parseFootballDataMatch(postponedMatch);
      expect(result.status).toBe("POSTPONED");
    });

    it("should handle CANCELLED status", () => {
      const cancelledMatch = {
        ...sampleMatch,
        status: "CANCELLED" as const,
      };

      const result = parseFootballDataMatch(cancelledMatch);
      expect(result.status).toBe("CANCELLED");
    });

    it("should handle 0-0 score correctly", () => {
      const zeroZeroMatch = {
        ...sampleMatch,
        status: "FINISHED" as const,
        score: {
          fullTime: {
            home: 0,
            away: 0,
          },
        },
      };

      const result = parseFootballDataMatch(zeroZeroMatch);
      expect(result.homeScore).toBe(0);
      expect(result.awayScore).toBe(0);
    });
  });

  describe("Return type structure", () => {
    it("should return all required fields for CreateFootballMatchParams", () => {
      const sampleMatch = {
        id: 432123,
        utcDate: "2026-01-15T15:00:00Z",
        status: "SCHEDULED" as const,
        homeTeam: { id: 57, name: "Arsenal FC" },
        awayTeam: { id: 61, name: "Chelsea FC" },
        competition: { id: 2021, name: "Premier League", code: "PL" },
        score: { fullTime: { home: null, away: null } },
      };

      const result = parseFootballDataMatch(sampleMatch);

      // Verify all required fields are present
      expect(result).toHaveProperty("externalId");
      expect(result).toHaveProperty("homeTeam");
      expect(result).toHaveProperty("awayTeam");
      expect(result).toHaveProperty("competition");
      expect(result).toHaveProperty("competitionCode");
      expect(result).toHaveProperty("matchDate");
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("homeScore");
      expect(result).toHaveProperty("awayScore");

      // Verify types
      expect(typeof result.externalId).toBe("number");
      expect(typeof result.homeTeam).toBe("string");
      expect(typeof result.awayTeam).toBe("string");
      expect(typeof result.competition).toBe("string");
      expect(typeof result.competitionCode).toBe("string");
      expect(typeof result.status).toBe("string");
    });

    it("should produce CreateFootballMatchParams compatible with upsertFootballMatch", async () => {
      const sampleMatch = {
        id: 432123,
        utcDate: "2026-01-15T15:00:00Z",
        status: "FINISHED" as const,
        homeTeam: { id: 57, name: "Arsenal FC" },
        awayTeam: { id: 61, name: "Chelsea FC" },
        competition: { id: 2021, name: "Premier League", code: "PL" },
        score: { fullTime: { home: 2, away: 1 } },
      };

      const result = parseFootballDataMatch(sampleMatch);

      // Verify the result has all required fields for CreateFootballMatchParams
      expect(result.externalId).toBe(432123);
      expect(result.homeTeam).toBe("Arsenal FC");
      expect(result.awayTeam).toBe("Chelsea FC");
      expect(result.competition).toBe("Premier League");
      expect(result.matchDate).toBeInstanceOf(Date);
      expect(result.status).toBe("FINISHED");
    });
  });
});

describe("Match Sync API Route", () => {
  it("should export GET handler", async () => {
    const route = await import("@/app/(chat)/api/cron/sync-matches/route");
    expect(typeof route.GET).toBe("function");
  });

  it("should export parseFootballDataMatch function", async () => {
    const route = await import("@/app/(chat)/api/cron/sync-matches/route");
    expect(typeof route.parseFootballDataMatch).toBe("function");
  });
});
