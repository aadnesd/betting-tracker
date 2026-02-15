/**
 * Unit tests for FootballMatch CRUD queries.
 *
 * Why: Validates that the FootballMatch schema is complete and functional,
 * enabling local caching of match data from football-data.org for linking
 * bets to specific matches and enabling auto-settlement. This is critical
 * for the P7 Match Data & Auto-Settlement feature.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock server-only to allow testing server modules
vi.mock("server-only", () => ({}));

// Mock date for consistent testing
const mockDate = new Date("2026-01-13T12:00:00Z");
const matchDate = new Date("2026-01-15T15:00:00Z");

// Create mock functions that we can control
const mockInsertReturning = vi.fn();
const mockSelectRows = vi.fn();
const mockUpdateReturning = vi.fn();

// Mock drizzle connection
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: mockInsertReturning,
        onConflictDoUpdate: vi.fn(() => ({
          returning: mockInsertReturning,
        })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockImplementation(() => mockSelectRows()),
          orderBy: vi.fn().mockImplementation(() => {
            // Return an object that can be called or has the array result
            const result = mockSelectRows();
            // If result is a promise, return it directly (for functions that don't chain .limit())
            return result instanceof Promise ? result : mockSelectRows();
          }),
        })),
        orderBy: vi.fn(() => ({
          limit: mockSelectRows,
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: mockUpdateReturning,
        })),
      })),
    })),
  })),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({})),
}));

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();

  // Default mock responses
  mockInsertReturning.mockResolvedValue([
    {
      id: "match-1",
      createdAt: mockDate,
      externalId: "12345",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      competition: "Premier League",
      competitionCode: "PL",
      matchDate,
      status: "SCHEDULED",
      homeScore: null,
      awayScore: null,
      lastSyncedAt: mockDate,
    },
  ]);

  mockSelectRows.mockResolvedValue([
    {
      id: "match-1",
      createdAt: mockDate,
      externalId: "12345",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      competition: "Premier League",
      competitionCode: "PL",
      matchDate,
      status: "SCHEDULED",
      homeScore: null,
      awayScore: null,
      lastSyncedAt: mockDate,
    },
  ]);

  mockUpdateReturning.mockResolvedValue([
    {
      id: "match-1",
      createdAt: mockDate,
      externalId: "12345",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      competition: "Premier League",
      competitionCode: "PL",
      matchDate,
      status: "FINISHED",
      homeScore: "2",
      awayScore: "1",
      lastSyncedAt: mockDate,
    },
  ]);
});

describe("FootballMatch Schema", () => {
  it("should export FootballMatch type from schema", async () => {
    const schema = await import("@/lib/db/schema");
    expect(schema.footballMatch).toBeDefined();
  });

  it("should export FootballMatchStatus type from schema", async () => {
    const schema = await import("@/lib/db/schema");
    // Type check - FootballMatchStatus should include all valid statuses
    type StatusType = typeof schema.footballMatch.$inferSelect.status;
    const validStatuses: StatusType[] = [
      "SCHEDULED",
      "TIMED",
      "IN_PLAY",
      "PAUSED",
      "FINISHED",
      "POSTPONED",
      "SUSPENDED",
      "CANCELLED",
    ];
    expect(validStatuses.length).toBe(8);
  });

  it("should have required fields in FootballMatch type", async () => {
    const schema = await import("@/lib/db/schema");
    type Match = typeof schema.footballMatch.$inferSelect;

    // Type assertions to verify schema fields exist
    const typeCheck: Match = {
      id: "uuid",
      createdAt: new Date(),
      externalId: "12345",
      homeTeam: "Team A",
      awayTeam: "Team B",
      competition: "Premier League",
      competitionCode: "PL",
      matchDate: new Date(),
      status: "SCHEDULED",
      homeScore: null,
      awayScore: null,
      lastSyncedAt: new Date(),
    };

    expect(typeCheck.id).toBeDefined();
    expect(typeCheck.externalId).toBeDefined();
    expect(typeCheck.homeTeam).toBeDefined();
    expect(typeCheck.awayTeam).toBeDefined();
    expect(typeCheck.competition).toBeDefined();
    expect(typeCheck.matchDate).toBeDefined();
    expect(typeCheck.status).toBeDefined();
    expect(typeCheck.lastSyncedAt).toBeDefined();
  });
});

describe("FootballMatch Queries", () => {
  describe("createFootballMatch", () => {
    it("should be a function", async () => {
      const queries = await import("@/lib/db/queries");
      expect(typeof queries.createFootballMatch).toBe("function");
    });

    it("should accept CreateFootballMatchParams", async () => {
      const queries = await import("@/lib/db/queries");

      const params: queries.CreateFootballMatchParams = {
        externalId: 12_345,
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        competition: "Premier League",
        competitionCode: "PL",
        matchDate,
        status: "SCHEDULED",
      };

      const result = await queries.createFootballMatch(params);

      expect(result).toBeDefined();
      expect(result.externalId).toBe("12345");
      expect(result.homeTeam).toBe("Arsenal");
    });

    it("should handle optional fields", async () => {
      const queries = await import("@/lib/db/queries");

      // Minimal params without optional fields
      const params: queries.CreateFootballMatchParams = {
        externalId: 12_345,
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        competition: "Premier League",
        matchDate,
      };

      const result = await queries.createFootballMatch(params);
      expect(result).toBeDefined();
    });
  });

  describe("getFootballMatchById", () => {
    it("should be a function", async () => {
      const queries = await import("@/lib/db/queries");
      expect(typeof queries.getFootballMatchById).toBe("function");
    });

    it("should return a match when found", async () => {
      const queries = await import("@/lib/db/queries");

      const result = await queries.getFootballMatchById({ id: "match-1" });

      expect(result).toBeDefined();
      expect(result?.id).toBe("match-1");
    });

    it("should return null when not found", async () => {
      const queries = await import("@/lib/db/queries");

      mockSelectRows.mockResolvedValueOnce([]);

      const result = await queries.getFootballMatchById({
        id: "non-existent",
      });

      expect(result).toBeNull();
    });
  });

  describe("getFootballMatchByExternalId", () => {
    it("should be a function", async () => {
      const queries = await import("@/lib/db/queries");
      expect(typeof queries.getFootballMatchByExternalId).toBe("function");
    });

    it("should return a match when found", async () => {
      const queries = await import("@/lib/db/queries");

      const result = await queries.getFootballMatchByExternalId({
        externalId: 12_345,
      });

      expect(result).toBeDefined();
      expect(result?.externalId).toBe("12345");
    });
  });

  describe("upsertFootballMatch", () => {
    it("should be a function", async () => {
      const queries = await import("@/lib/db/queries");
      expect(typeof queries.upsertFootballMatch).toBe("function");
    });

    it("should create or update a match", async () => {
      const queries = await import("@/lib/db/queries");

      const params: queries.CreateFootballMatchParams = {
        externalId: 12_345,
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        competition: "Premier League",
        matchDate,
        status: "SCHEDULED",
      };

      const result = await queries.upsertFootballMatch(params);

      expect(result).toBeDefined();
      expect(result.externalId).toBe("12345");
    });
  });

  describe("listFootballMatches", () => {
    it("should be a function", async () => {
      const queries = await import("@/lib/db/queries");
      expect(typeof queries.listFootballMatches).toBe("function");
    });

    it("should have correct parameter types", async () => {
      const queries = await import("@/lib/db/queries");

      // Type verification - these should compile without error
      type ListParams = Parameters<typeof queries.listFootballMatches>[0];
      const params: ListParams = {
        competitionCode: "PL",
        status: "SCHEDULED",
        fromDate: new Date(),
        toDate: new Date(),
        limit: 50,
      };

      expect(params.competitionCode).toBe("PL");
      expect(params.status).toBe("SCHEDULED");
      expect(params.limit).toBe(50);
    });
  });

  describe("listUpcomingMatches", () => {
    it("should be a function", async () => {
      const queries = await import("@/lib/db/queries");
      expect(typeof queries.listUpcomingMatches).toBe("function");
    });

    it("should accept optional parameters", async () => {
      const queries = await import("@/lib/db/queries");

      // Test with defaults
      let result = await queries.listUpcomingMatches();
      expect(Array.isArray(result)).toBe(true);

      // Test with custom daysAhead
      result = await queries.listUpcomingMatches({ daysAhead: 7 });
      expect(Array.isArray(result)).toBe(true);

      // Test with competition filter
      result = await queries.listUpcomingMatches({ competitionCode: "PL" });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("listRecentlyFinishedMatches", () => {
    it("should be a function", async () => {
      const queries = await import("@/lib/db/queries");
      expect(typeof queries.listRecentlyFinishedMatches).toBe("function");
    });

    it("should accept optional parameters", async () => {
      const queries = await import("@/lib/db/queries");

      // Test with defaults
      let result = await queries.listRecentlyFinishedMatches();
      expect(Array.isArray(result)).toBe(true);

      // Test with custom daysBack
      result = await queries.listRecentlyFinishedMatches({ daysBack: 7 });
      expect(Array.isArray(result)).toBe(true);

      // Test with competition filter
      result = await queries.listRecentlyFinishedMatches({
        competitionCode: "PL",
      });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("updateFootballMatch", () => {
    it("should be a function", async () => {
      const queries = await import("@/lib/db/queries");
      expect(typeof queries.updateFootballMatch).toBe("function");
    });

    it("should update match status and scores", async () => {
      const queries = await import("@/lib/db/queries");

      const result = await queries.updateFootballMatch({
        id: "match-1",
        status: "FINISHED",
        homeScore: 2,
        awayScore: 1,
      });

      expect(result).toBeDefined();
      expect(result?.status).toBe("FINISHED");
      expect(result?.homeScore).toBe("2");
      expect(result?.awayScore).toBe("1");
    });

    it("should return null when match not found", async () => {
      const queries = await import("@/lib/db/queries");

      mockUpdateReturning.mockResolvedValueOnce([]);

      const result = await queries.updateFootballMatch({
        id: "non-existent",
        status: "FINISHED",
      });

      expect(result).toBeNull();
    });
  });

  describe("searchFootballMatches", () => {
    it("should be a function", async () => {
      const queries = await import("@/lib/db/queries");
      expect(typeof queries.searchFootballMatches).toBe("function");
    });

    it("should have correct parameter types", async () => {
      const queries = await import("@/lib/db/queries");

      // Type verification - these should compile without error
      type SearchParams = Parameters<typeof queries.searchFootballMatches>[0];
      const params: SearchParams = {
        searchTerm: "Arsenal",
        fromDate: new Date(),
        limit: 10,
      };

      expect(params.searchTerm).toBe("Arsenal");
      expect(params.limit).toBe(10);
    });

    it("should require searchTerm parameter", async () => {
      const queries = await import("@/lib/db/queries");

      // Type verification - searchTerm is required
      type SearchParams = Parameters<typeof queries.searchFootballMatches>[0];
      const params: SearchParams = {
        searchTerm: "Chelsea",
      };

      expect(params.searchTerm).toBe("Chelsea");
      // fromDate and limit should be optional
      expect(params.fromDate).toBeUndefined();
      expect(params.limit).toBeUndefined();
    });
  });
});

describe("MatchedBet matchId field", () => {
  it("should have matchId field in MatchedBet schema", async () => {
    const schema = await import("@/lib/db/schema");
    type MatchedBetType = typeof schema.matchedBet.$inferSelect;

    // Type assertion to verify matchId field exists
    const typeCheck: Partial<MatchedBetType> = {
      matchId: "uuid" as string | null,
    };

    expect(typeCheck.matchId).toBeDefined();
  });
});

describe("CreateFootballMatchParams interface", () => {
  it("should export CreateFootballMatchParams type", async () => {
    const queries = await import("@/lib/db/queries");

    // Type check that the interface has correct fields
    const params: queries.CreateFootballMatchParams = {
      externalId: 12_345,
      homeTeam: "Team A",
      awayTeam: "Team B",
      competition: "Competition",
      competitionCode: "CODE",
      matchDate: new Date(),
      status: "SCHEDULED",
      homeScore: 0,
      awayScore: 0,
    };

    expect(params.externalId).toBe(12_345);
    expect(params.homeTeam).toBe("Team A");
    expect(params.awayTeam).toBe("Team B");
    expect(params.competition).toBe("Competition");
    expect(params.competitionCode).toBe("CODE");
    expect(params.matchDate).toBeInstanceOf(Date);
    expect(params.status).toBe("SCHEDULED");
    expect(params.homeScore).toBe(0);
    expect(params.awayScore).toBe(0);
  });

  it("should allow optional fields to be omitted", async () => {
    const queries = await import("@/lib/db/queries");

    // Minimal required fields
    const params: queries.CreateFootballMatchParams = {
      externalId: 12_345,
      homeTeam: "Team A",
      awayTeam: "Team B",
      competition: "Competition",
      matchDate: new Date(),
    };

    expect(params.competitionCode).toBeUndefined();
    expect(params.status).toBeUndefined();
    expect(params.homeScore).toBeUndefined();
    expect(params.awayScore).toBeUndefined();
  });
});
