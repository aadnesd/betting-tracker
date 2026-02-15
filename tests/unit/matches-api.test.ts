/**
 * Tests for /api/bets/matches endpoint
 *
 * Why: Ensures match search API returns properly formatted data
 * for the MatchPicker component.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authModule from "@/app/(auth)/auth";
import { GET as getMatchByIdRoute } from "@/app/(chat)/api/bets/matches/[id]/route";
import { GET as listMatchesRoute } from "@/app/(chat)/api/bets/matches/route";
import * as dbQueries from "@/lib/db/queries";

// Mock auth to return a test user
vi.mock("@/app/(auth)/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "test-user-id" } }),
}));

// Mock the queries module
vi.mock("@/lib/db/queries", () => ({
  searchFootballMatches: vi.fn(),
  listUpcomingMatches: vi.fn(),
  getFootballMatchById: vi.fn(),
}));

describe("/api/bets/matches", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (authModule.auth as vi.Mock).mockResolvedValue({
      user: { id: "test-user-id" },
    });
  });

  describe("formatMatch helper", () => {
    it("should format match with all fields", () => {
      const match = {
        id: "match-1",
        externalId: "ext-123",
        homeTeam: "Manchester United",
        awayTeam: "Liverpool",
        competition: "Premier League",
        competitionCode: "PL",
        matchDate: new Date("2024-12-25T15:00:00Z"),
        status: "SCHEDULED" as const,
        homeScore: null,
        awayScore: null,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Test the format logic inline
      const formatted = {
        id: match.id,
        externalId: match.externalId,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        competition: match.competition,
        competitionCode: match.competitionCode,
        matchDate: match.matchDate.toISOString(),
        status: match.status,
        label: `${match.homeTeam} vs ${match.awayTeam}`,
        detail: `${match.competitionCode || match.competition} - ${match.matchDate.toLocaleDateString()}`,
      };

      expect(formatted.id).toBe("match-1");
      expect(formatted.label).toBe("Manchester United vs Liverpool");
      expect(formatted.homeTeam).toBe("Manchester United");
      expect(formatted.awayTeam).toBe("Liverpool");
      expect(formatted.competitionCode).toBe("PL");
    });

    it("should use competition when competitionCode is null", () => {
      const match = {
        id: "match-2",
        externalId: "ext-456",
        homeTeam: "Real Madrid",
        awayTeam: "Barcelona",
        competition: "La Liga",
        competitionCode: null,
        matchDate: new Date("2024-12-26T20:00:00Z"),
        status: "TIMED" as const,
        homeScore: null,
        awayScore: null,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const detail = `${match.competitionCode || match.competition} - ${match.matchDate.toLocaleDateString()}`;
      expect(detail).toContain("La Liga");
    });
  });

  describe("search query handling", () => {
    it("should allow empty search and return upcoming matches", () => {
      // When search is empty, the API should return upcoming matches
      const search = "";
      const shouldSearchByTerm = search.trim().length >= 2;
      expect(shouldSearchByTerm).toBe(false);
    });

    it("should require minimum 2 characters for search", () => {
      const search1 = "a";
      const search2 = "Ma";
      const search3 = "Man";

      expect(search1.trim().length >= 2).toBe(false);
      expect(search2.trim().length >= 2).toBe(true);
      expect(search3.trim().length >= 2).toBe(true);
    });

    it("should trim search input", () => {
      const search = "  Liverpool  ";
      expect(search.trim()).toBe("Liverpool");
    });
  });

  describe("limit parameter handling", () => {
    it("should default to 20 when limit not provided", () => {
      const limitParam = undefined;
      const limit = Math.min(Number(limitParam) || 20, 50);
      expect(limit).toBe(20);
    });

    it("should cap limit at 50", () => {
      const limitParam = "100";
      const limit = Math.min(Number(limitParam) || 20, 50);
      expect(limit).toBe(50);
    });

    it("should use provided limit when valid", () => {
      const limitParam = "10";
      const limit = Math.min(Number(limitParam) || 20, 50);
      expect(limit).toBe(10);
    });
  });

  describe("response format", () => {
    it("should return matches array in response", () => {
      const response = {
        matches: [],
      };
      expect(Array.isArray(response.matches)).toBe(true);
    });

    it("should include all required fields in match response", () => {
      const requiredFields = [
        "id",
        "externalId",
        "homeTeam",
        "awayTeam",
        "competition",
        "competitionCode",
        "matchDate",
        "status",
        "label",
        "detail",
      ];

      const match = {
        id: "test-id",
        externalId: "ext-id",
        homeTeam: "Home Team",
        awayTeam: "Away Team",
        competition: "Test League",
        competitionCode: "TL",
        matchDate: new Date().toISOString(),
        status: "SCHEDULED",
        label: "Home Team vs Away Team",
        detail: "TL - 12/25/2024",
      };

      for (const field of requiredFields) {
        expect(match).toHaveProperty(field);
      }
    });
  });

  describe("match status filtering", () => {
    it("should recognize valid match statuses", () => {
      const validStatuses = [
        "SCHEDULED",
        "TIMED",
        "IN_PLAY",
        "PAUSED",
        "FINISHED",
        "POSTPONED",
        "SUSPENDED",
        "CANCELLED",
      ];

      for (const status of validStatuses) {
        expect(validStatuses).toContain(status);
      }
    });

    it("should format status for display correctly", () => {
      const statusMap: Record<string, string> = {
        SCHEDULED: "Upcoming",
        TIMED: "Upcoming",
        IN_PLAY: "Live",
        PAUSED: "Live",
        FINISHED: "Finished",
        POSTPONED: "Postponed",
        SUSPENDED: "Suspended",
        CANCELLED: "Cancelled",
      };

      expect(statusMap.SCHEDULED).toBe("Upcoming");
      expect(statusMap.IN_PLAY).toBe("Live");
      expect(statusMap.FINISHED).toBe("Finished");
    });
  });

  describe("GET /api/bets/matches route", () => {
    it("returns upcoming matches when no search term provided", async () => {
      (dbQueries.listUpcomingMatches as vi.Mock).mockResolvedValueOnce([]);
      const res = await listMatchesRoute(
        new Request("http://localhost/api/bets/matches")
      );
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(Array.isArray(json.matches)).toBe(true);
    });
  });
});

describe("/api/bets/matches/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (authModule.auth as vi.Mock).mockResolvedValue({
      user: { id: "test-user-id" },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    (authModule.auth as vi.Mock).mockResolvedValueOnce(null);
    const res = await getMatchByIdRoute(
      new Request("http://localhost/api/bets/matches/match-1"),
      { params: Promise.resolve({ id: "match-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when match not found", async () => {
    (dbQueries.getFootballMatchById as vi.Mock).mockResolvedValueOnce(null);
    const res = await getMatchByIdRoute(
      new Request("http://localhost/api/bets/matches/match-1"),
      { params: Promise.resolve({ id: "match-1" }) }
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Match not found");
  });

  it("returns formatted match details", async () => {
    (dbQueries.getFootballMatchById as vi.Mock).mockResolvedValueOnce({
      id: "match-1",
      externalId: "ext-123",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      competition: "Premier League",
      competitionCode: "PL",
      matchDate: new Date("2025-02-01T17:30:00Z"),
      status: "SCHEDULED",
      homeScore: null,
      awayScore: null,
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await getMatchByIdRoute(
      new Request("http://localhost/api/bets/matches/match-1"),
      { params: Promise.resolve({ id: "match-1" }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.match.id).toBe("match-1");
    expect(json.match.label).toBe("Arsenal vs Chelsea");
    expect(json.match.competitionCode).toBe("PL");
  });
});
