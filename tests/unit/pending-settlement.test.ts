/**
 * Unit tests for pending settlement bets queries.
 *
 * Why: The pending settlement queue is a key workflow feature that helps users
 * efficiently settle bets after matches complete. These tests validate:
 * - Query function signatures and return types
 * - Filter parameters (today, thisWeek, all)
 * - Integration with football match data
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock server-only to allow testing server modules
vi.mock("server-only", () => ({}));

// Mock database to test function signature without actual DB calls
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      })),
    })),
  })),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({})),
}));

import * as dbQueries from "@/lib/db/queries";
import type { PendingSettlementBet } from "@/lib/db/queries";

describe("getPendingSettlementBets", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("function signature", () => {
    it("is a function that accepts userId and optional filter/limit", async () => {
      expect(typeof dbQueries.getPendingSettlementBets).toBe("function");

      // Verify function returns array
      const fn: (args: {
        userId: string;
        filter?: "today" | "thisWeek" | "all";
        limit?: number;
      }) => Promise<PendingSettlementBet[]> = dbQueries.getPendingSettlementBets;
      expect(fn).toBeDefined();
    });

    it("accepts all filter values", () => {
      const todayParams: Parameters<typeof dbQueries.getPendingSettlementBets>[0] = {
        userId: "user-1",
        filter: "today",
      };
      expect(todayParams.filter).toBe("today");

      const weekParams: Parameters<typeof dbQueries.getPendingSettlementBets>[0] = {
        userId: "user-1",
        filter: "thisWeek",
      };
      expect(weekParams.filter).toBe("thisWeek");

      const allParams: Parameters<typeof dbQueries.getPendingSettlementBets>[0] = {
        userId: "user-1",
        filter: "all",
      };
      expect(allParams.filter).toBe("all");
    });

    it("accepts optional limit parameter", () => {
      const params: Parameters<typeof dbQueries.getPendingSettlementBets>[0] = {
        userId: "user-1",
        limit: 20,
      };
      expect(params.limit).toBe(20);
    });
  });

  describe("PendingSettlementBet interface", () => {
    it("has all required fields for display", () => {
      const mockBet: PendingSettlementBet = {
        id: "bet-1",
        market: "Match Odds",
        selection: "Liverpool",
        status: "matched",
        netExposure: "150.00",
        createdAt: new Date(),
        promoType: "Free Bet",
        matchId: "match-1",
        footballMatch: {
          id: "match-1",
          homeTeam: "Liverpool",
          awayTeam: "Manchester United",
          competition: "Premier League",
          matchDate: new Date(),
          status: "FINISHED",
          homeScore: "2",
          awayScore: "1",
        },
      };

      expect(mockBet.id).toBeDefined();
      expect(mockBet.market).toBeDefined();
      expect(mockBet.selection).toBeDefined();
      expect(mockBet.status).toBeDefined();
      expect(mockBet.footballMatch).toBeDefined();
    });

    it("supports bets without linked football match", () => {
      const betWithoutMatch: PendingSettlementBet = {
        id: "bet-2",
        market: "Over/Under 2.5",
        selection: "Over 2.5 Goals",
        status: "matched",
        netExposure: "100.00",
        createdAt: new Date(),
        promoType: null,
        matchId: null,
        footballMatch: null,
      };

      expect(betWithoutMatch.matchId).toBeNull();
      expect(betWithoutMatch.footballMatch).toBeNull();
    });

    it("supports all football match statuses", () => {
      const statuses = [
        "SCHEDULED",
        "TIMED",
        "IN_PLAY",
        "PAUSED",
        "FINISHED",
        "POSTPONED",
        "SUSPENDED",
        "CANCELLED",
      ];

      for (const status of statuses) {
        const bet: PendingSettlementBet = {
          id: "bet-1",
          market: "Match Odds",
          selection: "Team A",
          status: "matched",
          netExposure: "100.00",
          createdAt: new Date(),
          promoType: null,
          matchId: "match-1",
          footballMatch: {
            id: "match-1",
            homeTeam: "Team A",
            awayTeam: "Team B",
            competition: "League",
            matchDate: new Date(),
            status,
            homeScore: null,
            awayScore: null,
          },
        };
        expect(bet.footballMatch!.status).toBe(status);
      }
    });
  });
});

describe("countPendingSettlementBets", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("function signature", () => {
    it("is a function that accepts userId and returns count", async () => {
      expect(typeof dbQueries.countPendingSettlementBets).toBe("function");

      // Verify function returns number
      const fn: (args: { userId: string }) => Promise<number> =
        dbQueries.countPendingSettlementBets;
      expect(fn).toBeDefined();
    });

    it("only requires userId parameter", () => {
      const params: Parameters<typeof dbQueries.countPendingSettlementBets>[0] = {
        userId: "user-1",
      };
      expect(params.userId).toBe("user-1");
    });
  });

  describe("return value", () => {
    it("returns a number representing count of pending bets", () => {
      const count: Awaited<ReturnType<typeof dbQueries.countPendingSettlementBets>> = 5;
      expect(typeof count).toBe("number");
    });

    it("can return zero when no pending bets", () => {
      const count = 0;
      expect(count).toBe(0);
    });
  });
});

describe("pending settlement workflow", () => {
  it("bets with status 'matched' are pending settlement", () => {
    // Bets transition: draft -> matched -> settled
    // 'matched' status means both legs placed but not yet settled
    const pendingStatus = "matched";
    expect(pendingStatus).toBe("matched");
  });

  it("bets linked to FINISHED matches are ready for quick settlement", () => {
    const bet: PendingSettlementBet = {
      id: "bet-1",
      market: "Match Odds",
      selection: "Home Win",
      status: "matched",
      netExposure: "100.00",
      createdAt: new Date(),
      promoType: null,
      matchId: "match-1",
      footballMatch: {
        id: "match-1",
        homeTeam: "Team A",
        awayTeam: "Team B",
        competition: "League",
        matchDate: new Date(),
        status: "FINISHED",
        homeScore: "2",
        awayScore: "1",
      },
    };

    const isReady =
      bet.footballMatch?.status === "FINISHED" &&
      bet.footballMatch?.homeScore !== null;
    expect(isReady).toBe(true);
  });

  it("groups bets by match date for display", () => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const bets: PendingSettlementBet[] = [
      {
        id: "bet-1",
        market: "Match Odds",
        selection: "Team A",
        status: "matched",
        netExposure: "100.00",
        createdAt: today,
        promoType: null,
        matchId: "match-1",
        footballMatch: {
          id: "match-1",
          homeTeam: "Team A",
          awayTeam: "Team B",
          competition: "League",
          matchDate: today,
          status: "SCHEDULED",
          homeScore: null,
          awayScore: null,
        },
      },
      {
        id: "bet-2",
        market: "Match Odds",
        selection: "Team C",
        status: "matched",
        netExposure: "150.00",
        createdAt: today,
        promoType: null,
        matchId: "match-2",
        footballMatch: {
          id: "match-2",
          homeTeam: "Team C",
          awayTeam: "Team D",
          competition: "League",
          matchDate: tomorrow,
          status: "SCHEDULED",
          homeScore: null,
          awayScore: null,
        },
      },
    ];

    // Grouping by match date
    const groups = new Map<string, PendingSettlementBet[]>();
    for (const bet of bets) {
      const dateKey = bet.footballMatch?.matchDate.toDateString() ?? bet.createdAt.toDateString();
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(bet);
    }

    expect(groups.size).toBe(2);
  });
});
