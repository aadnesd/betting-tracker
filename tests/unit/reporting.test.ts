import { describe, expect, test } from "vitest";
import {
  calculateQualifyingLoss,
  calculateReportingSummary,
  calculateROI,
  enrichWithROI,
  formatNOK,
  formatPercentage,
  getDateRange,
  groupByMonth,
  groupByWeek,
  type MatchedBetWithLegs,
} from "@/lib/reporting";
import type { BackBet, LayBet, MatchedBet } from "@/lib/db/schema";

/**
 * Unit tests for reporting helper functions.
 *
 * WHY THESE TESTS MATTER:
 * - Reporting accuracy is critical for users to understand their matched betting profitability
 * - Incorrect calculations could lead to poor decisions about betting strategy
 * - These tests verify profit/loss, ROI, and qualifying loss calculations work correctly
 */

// Helper to create a mock matched bet with legs
function createMockMatchedBet(
  overrides: {
    matched?: Partial<MatchedBet>;
    back?: Partial<BackBet> | null;
    lay?: Partial<LayBet> | null;
  } = {}
): MatchedBetWithLegs {
  const now = new Date();

  const matched: MatchedBet = {
    id: "matched-1",
    createdAt: now,
    userId: "user-1",
    backBetId: "back-1",
    layBetId: "lay-1",
    market: "Match Odds",
    selection: "Team A",
    promoId: null,
    promoType: null,
    status: "settled",
    netExposure: null,
    notes: null,
    confirmedAt: null,
    lastError: null,
    ...overrides.matched,
  };

  const back: BackBet | null =
    overrides.back === null
      ? null
      : {
          id: "back-1",
          createdAt: now,
          userId: "user-1",
          accountId: "account-1",
          screenshotId: "screenshot-1",
          market: "Match Odds",
          selection: "Team A",
          odds: "2.0",
          stake: "100.00",
          exchange: "Bet365",
          currency: "NOK",
          placedAt: now,
          settledAt: now,
          profitLoss: "50.00",
          confidence: null,
          status: "settled",
          error: null,
          ...overrides.back,
        };

  const lay: LayBet | null =
    overrides.lay === null
      ? null
      : {
          id: "lay-1",
          createdAt: now,
          userId: "user-1",
          accountId: "account-2",
          screenshotId: "screenshot-2",
          market: "Match Odds",
          selection: "Team A",
          odds: "2.1",
          stake: "95.24",
          exchange: "Betfair",
          currency: "NOK",
          placedAt: now,
          settledAt: now,
          profitLoss: "-45.00",
          confidence: null,
          status: "settled",
          error: null,
          ...overrides.lay,
        };

  return { matched, back, lay };
}

describe("calculateQualifyingLoss", () => {
  test("returns 0 for non-qualifying promos", () => {
    const bet = createMockMatchedBet({
      matched: { promoType: "free_bet" },
      back: { profitLoss: "-10.00" },
      lay: { profitLoss: "-5.00" },
    });
    expect(calculateQualifyingLoss(bet)).toBe(0);
  });

  test("returns 0 for profitable qualifying bets", () => {
    const bet = createMockMatchedBet({
      matched: { promoType: "qualifying_bet" },
      back: { profitLoss: "10.00" },
      lay: { profitLoss: "-5.00" },
    });
    expect(calculateQualifyingLoss(bet)).toBe(0);
  });

  test("returns loss amount for losing qualifying bet", () => {
    const bet = createMockMatchedBet({
      matched: { promoType: "qualifying_bet" },
      back: { profitLoss: "-10.00" },
      lay: { profitLoss: "-5.00" },
    });
    // Total loss is 15, returned as positive number
    expect(calculateQualifyingLoss(bet)).toBe(15);
  });

  test("handles sign_up promos as qualifying", () => {
    const bet = createMockMatchedBet({
      matched: { promoType: "sign_up_bonus" },
      back: { profitLoss: "-3.00" },
      lay: { profitLoss: "-2.00" },
    });
    expect(calculateQualifyingLoss(bet)).toBe(5);
  });
});

describe("calculateReportingSummary", () => {
  test("returns zeros for empty array", () => {
    const summary = calculateReportingSummary([]);
    expect(summary).toEqual({
      totalProfit: 0,
      qualifyingLoss: 0,
      netProfit: 0,
      totalStake: 0,
      roi: 0,
      settledCount: 0,
      openExposure: 0,
    });
  });

  test("calculates profit from settled bets only", () => {
    const bets: MatchedBetWithLegs[] = [
      createMockMatchedBet({
        matched: { status: "settled" },
        back: { profitLoss: "50.00", stake: "100.00" },
        lay: { profitLoss: "-45.00", stake: "95.24" },
      }),
      createMockMatchedBet({
        matched: { status: "matched" }, // Not settled, should be ignored
        back: { profitLoss: "100.00", stake: "200.00" },
        lay: { profitLoss: "-95.00", stake: "190.00" },
      }),
    ];

    const summary = calculateReportingSummary(bets);

    expect(summary.totalProfit).toBe(5); // 50 - 45
    expect(summary.totalStake).toBeCloseTo(195.24); // 100 + 95.24
    expect(summary.settledCount).toBe(1);
  });

  test("includes open exposure from parameter", () => {
    const summary = calculateReportingSummary([], 1500);
    expect(summary.openExposure).toBe(1500);
  });

  test("calculates ROI correctly", () => {
    const bets: MatchedBetWithLegs[] = [
      createMockMatchedBet({
        matched: { status: "settled" },
        back: { profitLoss: "20.00", stake: "100.00" },
        lay: { profitLoss: "-15.00", stake: "100.00" },
      }),
    ];

    const summary = calculateReportingSummary(bets);

    // Net profit: 20 - 15 = 5
    // Total stake: 100 + 100 = 200
    // ROI: 5 / 200 * 100 = 2.5%
    expect(summary.roi).toBe(2.5);
  });
});

describe("calculateROI", () => {
  test("returns 0 for zero stake", () => {
    expect(calculateROI(100, 0)).toBe(0);
  });

  test("returns 0 for negative stake", () => {
    expect(calculateROI(100, -50)).toBe(0);
  });

  test("calculates correct ROI", () => {
    expect(calculateROI(10, 100)).toBe(10); // 10%
    expect(calculateROI(-5, 100)).toBe(-5); // -5%
  });
});

describe("enrichWithROI", () => {
  test("adds ROI to each item", () => {
    const items = [
      { name: "A", totalProfitLoss: 10, totalStake: 100 },
      { name: "B", totalProfitLoss: -5, totalStake: 50 },
    ];

    const enriched = enrichWithROI(items);

    expect(enriched[0].roi).toBe(10);
    expect(enriched[1].roi).toBe(-10);
  });
});

describe("formatNOK", () => {
  test("formats positive amounts correctly", () => {
    // Norwegian locale formats with space as thousands separator and comma as decimal
    const formatted = formatNOK(1234.56);
    expect(formatted).toContain("1");
    expect(formatted).toContain("234");
    expect(formatted).toMatch(/NOK|kr/i);
  });

  test("formats negative amounts correctly", () => {
    const formatted = formatNOK(-500);
    expect(formatted).toMatch(/-|−/);
    expect(formatted).toContain("500");
  });
});

describe("formatPercentage", () => {
  test("adds plus sign for positive values", () => {
    expect(formatPercentage(5.5)).toBe("+5.50%");
  });

  test("includes minus sign for negative values", () => {
    expect(formatPercentage(-3.25)).toBe("-3.25%");
  });

  test("formats zero correctly", () => {
    expect(formatPercentage(0)).toBe("+0.00%");
  });
});

describe("getDateRange", () => {
  test("returns null startDate for 'all'", () => {
    const { startDate, endDate } = getDateRange("all");
    expect(startDate).toBeNull();
    expect(endDate).toBeInstanceOf(Date);
  });

  test("returns approximately 7 days ago for 'week'", () => {
    const { startDate, endDate } = getDateRange("week");
    expect(startDate).toBeInstanceOf(Date);
    const diffDays = Math.round(
      (endDate.getTime() - startDate!.getTime()) / (1000 * 60 * 60 * 24)
    );
    // Can be 7-8 days due to start/end time boundary adjustments
    expect(diffDays).toBeGreaterThanOrEqual(7);
    expect(diffDays).toBeLessThanOrEqual(8);
  });

  test("returns approximately 30 days for 'month'", () => {
    const { startDate, endDate } = getDateRange("month");
    expect(startDate).toBeInstanceOf(Date);
    const diffDays = Math.round(
      (endDate.getTime() - startDate!.getTime()) / (1000 * 60 * 60 * 24)
    );
    // Month can be 28-32 days due to varying month lengths and boundary adjustments
    expect(diffDays).toBeGreaterThanOrEqual(28);
    expect(diffDays).toBeLessThanOrEqual(32);
  });
});

describe("groupByWeek", () => {
  test("groups bets by week starting Monday", () => {
    const bets: MatchedBetWithLegs[] = [
      createMockMatchedBet({
        matched: { createdAt: new Date("2025-01-06") }, // Monday
      }),
      createMockMatchedBet({
        matched: { createdAt: new Date("2025-01-08") }, // Wednesday same week
      }),
      createMockMatchedBet({
        matched: { createdAt: new Date("2025-01-13") }, // Next Monday
      }),
    ];

    const groups = groupByWeek(bets);

    expect(groups.size).toBe(2);
    expect(groups.get("2025-01-06")?.length).toBe(2);
    expect(groups.get("2025-01-13")?.length).toBe(1);
  });
});

describe("groupByMonth", () => {
  test("groups bets by month", () => {
    const bets: MatchedBetWithLegs[] = [
      createMockMatchedBet({
        matched: { createdAt: new Date("2025-01-15") },
      }),
      createMockMatchedBet({
        matched: { createdAt: new Date("2025-01-25") },
      }),
      createMockMatchedBet({
        matched: { createdAt: new Date("2025-02-05") },
      }),
    ];

    const groups = groupByMonth(bets);

    expect(groups.size).toBe(2);
    expect(groups.get("2025-01")?.length).toBe(2);
    expect(groups.get("2025-02")?.length).toBe(1);
  });
});
