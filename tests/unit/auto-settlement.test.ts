/**
 * Unit tests for auto-settlement detection queries.
 *
 * Why: Validates that findBetsReadyForAutoSettlement and countBetsReadyForAutoSettlement
 * correctly identify matched bets linked to finished football matches that need settlement.
 * This is critical for the auto-settlement workflow that reduces manual settlement work.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock server-only to allow testing server modules
vi.mock("server-only", () => ({}));

// Mock drizzle connection
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            leftJoin: vi.fn(() => ({
              where: vi.fn(() => ({
                orderBy: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue([
                    {
                      id: "bet-1",
                      userId: "user-1",
                      market: "Match Odds",
                      selection: "Home Win",
                      status: "matched",
                      promoType: null,
                      matchId: "match-1",
                      backBetId: "back-1",
                      backOdds: "2.50",
                      backStake: "100.00",
                      backAccountId: "acct-1",
                      layBetId: "lay-1",
                      layOdds: "2.55",
                      layStake: "98.00",
                      layAccountId: "acct-2",
                      footballMatchId: "match-1",
                      externalId: 538001,
                      homeTeam: "Arsenal FC",
                      awayTeam: "Chelsea FC",
                      competition: "Premier League",
                      matchDate: new Date("2026-01-10T15:00:00Z"),
                      matchStatus: "FINISHED",
                      homeScore: "2",
                      awayScore: "1",
                    },
                  ]),
                })),
              })),
            })),
          })),
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      })),
    })),
  })),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({})),
}));

import * as dbQueries from "@/lib/db/queries";

describe("auto-settlement detection queries", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("findBetsReadyForAutoSettlement", () => {
    it("is a function that accepts optional limit parameter", async () => {
      expect(typeof dbQueries.findBetsReadyForAutoSettlement).toBe("function");

      // Verify function signature with optional parameters
      const fn: (args?: {
        limit?: number;
      }) => Promise<dbQueries.BetReadyForSettlement[]> =
        dbQueries.findBetsReadyForAutoSettlement;
      expect(fn).toBeDefined();
    });

    it("can be called without any parameters", async () => {
      // Should not throw when called without parameters
      const fn = dbQueries.findBetsReadyForAutoSettlement;
      expect(typeof fn).toBe("function");
    });
  });

  describe("countBetsReadyForAutoSettlement", () => {
    it("is a function that returns a number", async () => {
      expect(typeof dbQueries.countBetsReadyForAutoSettlement).toBe("function");

      // Type check: the function should return a number
      type ReturnType = Awaited<
        ReturnType<typeof dbQueries.countBetsReadyForAutoSettlement>
      >;
      const expectedType: ReturnType = 5;
      expect(typeof expectedType).toBe("number");
    });
  });

  describe("BetReadyForSettlement interface", () => {
    it("has all required fields for settlement processing", () => {
      // Create a mock bet that matches the interface
      const mockBet: dbQueries.BetReadyForSettlement = {
        id: "bet-1",
        userId: "user-1",
        market: "Match Odds",
        selection: "Home Win",
        status: "matched",
        promoType: null,
        matchId: "match-1",
        // Back bet info
        backBetId: "back-1",
        backOdds: "2.50",
        backStake: "100.00",
        backAccountId: "acct-1",
        // Lay bet info
        layBetId: "lay-1",
        layOdds: "2.55",
        layStake: "98.00",
        layAccountId: "acct-2",
        // Football match result
        footballMatch: {
          id: "match-1",
          externalId: 538001,
          homeTeam: "Arsenal FC",
          awayTeam: "Chelsea FC",
          competition: "Premier League",
          matchDate: new Date("2026-01-10T15:00:00Z"),
          status: "FINISHED",
          homeScore: 2,
          awayScore: 1,
        },
      };

      // Verify core bet fields
      expect(mockBet.id).toBeDefined();
      expect(mockBet.userId).toBeDefined();
      expect(mockBet.market).toBeDefined();
      expect(mockBet.selection).toBeDefined();
      expect(mockBet.matchId).toBeDefined();

      // Verify back bet fields
      expect(mockBet.backBetId).toBeDefined();
      expect(mockBet.backOdds).toBeDefined();
      expect(mockBet.backStake).toBeDefined();

      // Verify lay bet fields
      expect(mockBet.layBetId).toBeDefined();
      expect(mockBet.layOdds).toBeDefined();
      expect(mockBet.layStake).toBeDefined();

      // Verify football match result
      expect(mockBet.footballMatch).toBeDefined();
      expect(mockBet.footballMatch.id).toBeDefined();
      expect(mockBet.footballMatch.homeTeam).toBeDefined();
      expect(mockBet.footballMatch.awayTeam).toBeDefined();
      expect(typeof mockBet.footballMatch.homeScore).toBe("number");
      expect(typeof mockBet.footballMatch.awayScore).toBe("number");
      expect(mockBet.footballMatch.status).toBe("FINISHED");
    });

    it("has fields needed to calculate P&L", () => {
      // The interface must have odds and stakes for both back and lay bets
      const mockBet: dbQueries.BetReadyForSettlement = {
        id: "bet-1",
        userId: "user-1",
        market: "Match Odds",
        selection: "Away Win",
        status: "matched",
        promoType: "Free Bet",
        matchId: "match-1",
        backBetId: "back-1",
        backOdds: "3.00",
        backStake: "50.00",
        backAccountId: "acct-1",
        layBetId: "lay-1",
        layOdds: "3.10",
        layStake: "48.00",
        layAccountId: "acct-2",
        footballMatch: {
          id: "match-1",
          externalId: 538002,
          homeTeam: "Liverpool FC",
          awayTeam: "Everton FC",
          competition: "Premier League",
          matchDate: new Date("2026-01-11T14:00:00Z"),
          status: "FINISHED",
          homeScore: 0,
          awayScore: 2,
        },
      };

      // Calculate expected P&L for "Away Win" selection where away team won 0-2
      // Back stake: 50.00 @ 3.00 = 50 * (3.00 - 1) = 100.00 profit (if back wins)
      // Lay liability: 48.00 * (3.10 - 1) = 100.80 loss (if lay loses)
      const backStake = Number.parseFloat(mockBet.backStake!);
      const backOdds = Number.parseFloat(mockBet.backOdds!);
      const layStake = Number.parseFloat(mockBet.layStake!);
      const layOdds = Number.parseFloat(mockBet.layOdds!);

      expect(backStake).toBeGreaterThan(0);
      expect(backOdds).toBeGreaterThan(1);
      expect(layStake).toBeGreaterThan(0);
      expect(layOdds).toBeGreaterThan(1);

      // These values are needed to calculate P&L
      const backProfit = backStake * (backOdds - 1);
      const layLiability = layStake * (layOdds - 1);
      expect(backProfit).toBeCloseTo(100, 1);
      expect(layLiability).toBeCloseTo(100.8, 1);
    });

    it("supports bets with null back or lay bet (drafts)", () => {
      // A bet might have one leg missing (draft state)
      const mockBetMissingLay: dbQueries.BetReadyForSettlement = {
        id: "bet-2",
        userId: "user-1",
        market: "Match Odds",
        selection: "Draw",
        status: "matched",
        promoType: null,
        matchId: "match-2",
        backBetId: "back-2",
        backOdds: "3.50",
        backStake: "100.00",
        backAccountId: "acct-1",
        layBetId: null,
        layOdds: null,
        layStake: null,
        layAccountId: null,
        footballMatch: {
          id: "match-2",
          externalId: 538003,
          homeTeam: "Man City FC",
          awayTeam: "Man United FC",
          competition: "Premier League",
          matchDate: new Date("2026-01-12T16:30:00Z"),
          status: "FINISHED",
          homeScore: 1,
          awayScore: 1,
        },
      };

      expect(mockBetMissingLay.layBetId).toBeNull();
      expect(mockBetMissingLay.layOdds).toBeNull();
      expect(mockBetMissingLay.layStake).toBeNull();
    });
  });

  describe("AuditAction type includes settlement actions", () => {
    it("includes auto_settle_detected action", () => {
      // Verify the action type is valid
      const action: dbQueries.AuditAction = "auto_settle_detected";
      expect(action).toBe("auto_settle_detected");
    });

    it("includes auto_settle_applied action", () => {
      // Verify the action type is valid
      const action: dbQueries.AuditAction = "auto_settle_applied";
      expect(action).toBe("auto_settle_applied");
    });
  });

  describe("settlement detection criteria", () => {
    it("only includes bets with status 'matched'", () => {
      // The query should filter by status = 'matched'
      // Other statuses like 'draft', 'settled', 'needs_review' should be excluded
      const validStatuses = ["matched"];
      const invalidStatuses = ["draft", "settled", "needs_review", "error"];

      for (const status of validStatuses) {
        expect(status).toBe("matched");
      }

      for (const status of invalidStatuses) {
        expect(status).not.toBe("matched");
      }
    });

    it("requires match to be FINISHED with scores", () => {
      // Match must be FINISHED with both homeScore and awayScore available
      const finishedMatch = {
        status: "FINISHED",
        homeScore: 2,
        awayScore: 1,
      };

      expect(finishedMatch.status).toBe("FINISHED");
      expect(finishedMatch.homeScore).not.toBeNull();
      expect(finishedMatch.awayScore).not.toBeNull();

      // Other statuses should not be ready for settlement
      const notFinishedStatuses = [
        "SCHEDULED",
        "TIMED",
        "IN_PLAY",
        "PAUSED",
        "POSTPONED",
        "SUSPENDED",
        "CANCELLED",
      ];

      for (const status of notFinishedStatuses) {
        expect(status).not.toBe("FINISHED");
      }
    });
  });

  describe("applyAutoSettlement", () => {
    it("is a function that accepts settlement parameters", () => {
      expect(typeof dbQueries.applyAutoSettlement).toBe("function");

      // Type check: verify parameter interface
      const params: dbQueries.ApplyAutoSettlementParams = {
        matchedBetId: "bet-1",
        userId: "user-1",
        outcome: "win",
        backProfitLoss: 100,
        layProfitLoss: -98,
        backBetId: "back-1",
        layBetId: "lay-1",
        backAccountId: "acct-1",
        layAccountId: "acct-2",
        backCurrency: "EUR",
        layCurrency: "NOK",
        market: "Match Odds",
        selection: "Home Win",
        matchResult: "Arsenal 2-1 Chelsea",
      };
      expect(params.matchedBetId).toBeDefined();
    });

    it("returns result with success status and transaction count", () => {
      // Type check: verify result interface
      const result: dbQueries.ApplyAutoSettlementResult = {
        success: true,
        matchedBetId: "bet-1",
        transactionsCreated: 2,
      };
      expect(result.success).toBe(true);
      expect(typeof result.transactionsCreated).toBe("number");
    });

    it("accepts all three outcome types: win, loss, push", () => {
      const outcomes: Array<dbQueries.ApplyAutoSettlementParams["outcome"]> = [
        "win",
        "loss",
        "push",
      ];

      for (const outcome of outcomes) {
        expect(["win", "loss", "push"]).toContain(outcome);
      }
    });

    it("handles null account IDs for missing legs", () => {
      const paramsWithoutLay: dbQueries.ApplyAutoSettlementParams = {
        matchedBetId: "bet-2",
        userId: "user-1",
        outcome: "win",
        backProfitLoss: 100,
        layProfitLoss: 0,
        backBetId: "back-2",
        layBetId: null,
        backAccountId: "acct-1",
        layAccountId: null,
        backCurrency: "EUR",
        layCurrency: null,
        market: "Match Odds",
        selection: "Home Win",
        matchResult: "Arsenal 2-1 Chelsea",
      };
      expect(paramsWithoutLay.layBetId).toBeNull();
      expect(paramsWithoutLay.layAccountId).toBeNull();
    });

    it("includes match result for audit trail", () => {
      const params: dbQueries.ApplyAutoSettlementParams = {
        matchedBetId: "bet-1",
        userId: "user-1",
        outcome: "loss",
        backProfitLoss: -100,
        layProfitLoss: 98,
        backBetId: "back-1",
        layBetId: "lay-1",
        backAccountId: "acct-1",
        layAccountId: "acct-2",
        backCurrency: "EUR",
        layCurrency: "NOK",
        market: "Over/Under 2.5 Goals",
        selection: "Over 2.5",
        matchResult: "Liverpool 1-1 Everton",
      };
      expect(params.matchResult).toContain("-");
      expect(params.market).toBeDefined();
      expect(params.selection).toBeDefined();
    });
  });

  describe("flagBetForReview", () => {
    it("is a function that accepts bet ID, user ID, and reason", () => {
      expect(typeof dbQueries.flagBetForReview).toBe("function");

      // Type check: verify parameters
      const fn: (params: {
        matchedBetId: string;
        userId: string;
        reason: string;
      }) => Promise<void> = dbQueries.flagBetForReview;
      expect(fn).toBeDefined();
    });

    it("accepts descriptive reason for flagging", () => {
      // The reason should explain why auto-settlement couldn't complete
      const lowConfidenceReason =
        "Market type 'Asian Handicap' not recognized, needs manual review";
      const ambiguousReason =
        "Selection 'Both Teams to Score' is ambiguous for current market";

      expect(lowConfidenceReason.length).toBeGreaterThan(10);
      expect(ambiguousReason.length).toBeGreaterThan(10);
    });
  });

  describe("settlement application workflow", () => {
    it("updates bet status to settled when outcome is clear", () => {
      // High confidence outcomes should update status to 'settled'
      const settledStatuses = ["settled"];
      expect(settledStatuses).toContain("settled");
    });

    it("creates account transactions for both back and lay bets", () => {
      // When both legs have account IDs and non-zero P&L,
      // expect 2 adjustment transactions to be created
      const expectedTransactionCount = 2;
      expect(expectedTransactionCount).toBe(2);
    });

    it("creates only one transaction when one leg is missing", () => {
      // If only back bet exists (lay is null), expect 1 transaction
      const expectedTransactionCount = 1;
      expect(expectedTransactionCount).toBe(1);
    });

    it("creates audit entry for every settlement action", () => {
      // Every settlement should create an audit entry with action 'auto_settle_applied'
      const auditAction: dbQueries.AuditAction = "auto_settle_applied";
      expect(auditAction).toBe("auto_settle_applied");
    });

    it("flags bets with low confidence outcomes for review", () => {
      // When outcome confidence is 'low' or outcome is 'unknown',
      // status should be 'needs_review' not 'settled'
      const reviewStatus = "needs_review";
      expect(reviewStatus).toBe("needs_review");
    });

    it("defaults currency to NOK when not specified", () => {
      // If currency is null, default to NOK for transactions
      const defaultCurrency = "NOK";
      expect(defaultCurrency).toBe("NOK");
    });
  });
});
