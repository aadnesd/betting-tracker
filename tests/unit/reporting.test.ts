import { describe, expect, test, vi } from "vitest";
import {
  calculateCumulativeProfitData,
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

// FX conversion no longer used in reporting calculations (stored NOK values are used instead)

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

  const backOverrides = overrides.back ?? {};
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
          stakeNok: backOverrides.stakeNok ?? backOverrides.stake ?? "100.00",
          exchange: "Bet365",
          currency: "NOK",
          placedAt: now,
          settledAt: now,
          profitLoss: "50.00",
          profitLossNok:
            backOverrides.profitLossNok ?? backOverrides.profitLoss ?? "50.00",
          confidence: null,
          status: "settled",
          error: null,
          ...backOverrides,
        };

  const layOverrides = overrides.lay ?? {};
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
          stakeNok: layOverrides.stakeNok ?? layOverrides.stake ?? "95.24",
          exchange: "Betfair",
          currency: "NOK",
          placedAt: now,
          settledAt: now,
          profitLoss: "-45.00",
          profitLossNok:
            layOverrides.profitLossNok ?? layOverrides.profitLoss ?? "-45.00",
          confidence: null,
          status: "settled",
          error: null,
          ...layOverrides,
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
  test("returns zeros for empty array", async () => {
    const summary = await calculateReportingSummary([]);
    expect(summary).toEqual({
      totalProfit: 0,
      qualifyingLoss: 0,
      netProfit: 0,
      totalStake: 0,
      roi: 0,
      settledCount: 0,
      openExposure: 0,
      bonusTotal: 0,
      bettingProfit: 0,
    });
  });

  test("calculates profit from settled bets only", async () => {
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

    const summary = await calculateReportingSummary(bets);

    expect(summary.totalProfit).toBe(5); // 50 - 45
    expect(summary.bettingProfit).toBe(5); // Same as totalProfit
    expect(summary.netProfit).toBe(5); // No bonuses, so same as totalProfit
    expect(summary.totalStake).toBeCloseTo(195.24); // 100 + 95.24
    expect(summary.settledCount).toBe(1);
  });

  test("includes open exposure from parameter", async () => {
    const summary = await calculateReportingSummary([], 1500);
    expect(summary.openExposure).toBe(1500);
  });

  test("calculates ROI correctly", async () => {
    const bets: MatchedBetWithLegs[] = [
      createMockMatchedBet({
        matched: { status: "settled" },
        back: { profitLoss: "20.00", stake: "100.00" },
        lay: { profitLoss: "-15.00", stake: "100.00" },
      }),
    ];

    const summary = await calculateReportingSummary(bets);

    // Net profit: 20 - 15 = 5
    // Total stake: 100 + 100 = 200
    // ROI: 5 / 200 * 100 = 2.5%
    expect(summary.roi).toBe(2.5);
  });

  test("includes bonus total in net profit calculation", async () => {
    const bets: MatchedBetWithLegs[] = [
      createMockMatchedBet({
        matched: { status: "settled" },
        back: { profitLoss: "50.00", stake: "100.00" },
        lay: { profitLoss: "-45.00", stake: "100.00" },
      }),
    ];

    // Add 100 NOK in bonuses
    const summary = await calculateReportingSummary(bets, 0, 100);

    expect(summary.bettingProfit).toBe(5); // 50 - 45
    expect(summary.bonusTotal).toBe(100);
    expect(summary.netProfit).toBe(105); // 5 + 100 bonuses
    // ROI should use net profit (including bonuses)
    // ROI: 105 / 200 * 100 = 52.5%
    expect(summary.roi).toBe(52.5);
  });

  test("handles negative betting profit with positive bonuses", async () => {
    const bets: MatchedBetWithLegs[] = [
      createMockMatchedBet({
        matched: { status: "settled" },
        back: { profitLoss: "-20.00", stake: "100.00" },
        lay: { profitLoss: "-10.00", stake: "100.00" },
      }),
    ];

    // Add 50 NOK in bonuses
    const summary = await calculateReportingSummary(bets, 0, 50);

    expect(summary.bettingProfit).toBe(-30); // -20 - 10
    expect(summary.bonusTotal).toBe(50);
    expect(summary.netProfit).toBe(20); // -30 + 50 bonuses = positive overall
    expect(summary.roi).toBe(10); // 20 / 200 * 100 = 10%
  });

  test("zero bonuses does not affect calculations", async () => {
    const bets: MatchedBetWithLegs[] = [
      createMockMatchedBet({
        matched: { status: "settled" },
        back: { profitLoss: "100.00", stake: "500.00" },
        lay: { profitLoss: "-50.00", stake: "500.00" },
      }),
    ];

    const summaryWithoutBonuses = await calculateReportingSummary(bets, 0, 0);
    const summaryDefaultBonuses = await calculateReportingSummary(bets, 0);

    expect(summaryWithoutBonuses.netProfit).toBe(50);
    expect(summaryDefaultBonuses.netProfit).toBe(50);
    expect(summaryWithoutBonuses.bonusTotal).toBe(0);
    expect(summaryDefaultBonuses.bonusTotal).toBe(0);
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

describe("calculateCumulativeProfitData", () => {
  /**
   * WHY: Cumulative profit visualization helps users see their profit trend over time.
   * These tests verify the data points are correctly computed for charting.
   */

  test("returns empty array for no bets", async () => {
    const result = await calculateCumulativeProfitData([]);
    expect(result).toEqual([]);
  });

  test("returns empty array for non-settled bets", async () => {
    const bets = [
      createMockMatchedBet({
        matched: { status: "draft" },
        back: { profitLoss: "50.00" },
      }),
      createMockMatchedBet({
        matched: { status: "matched" },
        back: { profitLoss: "100.00" },
      }),
    ];

    const result = await calculateCumulativeProfitData(bets);
    expect(result).toEqual([]);
  });

  test("calculates cumulative profit correctly for settled bets", async () => {
    const bets = [
      createMockMatchedBet({
        matched: { status: "settled", createdAt: new Date("2025-01-01") },
        back: { profitLoss: "50.00", settledAt: new Date("2025-01-01") },
        lay: { profitLoss: "-10.00" },
      }),
      createMockMatchedBet({
        matched: { status: "settled", createdAt: new Date("2025-01-02") },
        back: { profitLoss: "30.00", settledAt: new Date("2025-01-02") },
        lay: { profitLoss: "-5.00" },
      }),
      createMockMatchedBet({
        matched: { status: "settled", createdAt: new Date("2025-01-03") },
        back: { profitLoss: "-20.00", settledAt: new Date("2025-01-03") },
        lay: { profitLoss: "100.00" },
      }),
    ];

    const result = await calculateCumulativeProfitData(bets, "day");

    expect(result.length).toBe(3);
    // Day 1: profit 40 (50-10), cumulative 40
    expect(result[0].profit).toBe(40);
    expect(result[0].cumulative).toBe(40);
    expect(result[0].count).toBe(1);
    // Day 2: profit 25 (30-5), cumulative 65
    expect(result[1].profit).toBe(25);
    expect(result[1].cumulative).toBe(65);
    expect(result[1].count).toBe(1);
    // Day 3: profit 80 (-20+100), cumulative 145
    expect(result[2].profit).toBe(80);
    expect(result[2].cumulative).toBe(145);
    expect(result[2].count).toBe(1);
  });

  test("groups by week correctly", async () => {
    const bets = [
      createMockMatchedBet({
        matched: { status: "settled", createdAt: new Date("2025-01-06") }, // Monday
        back: { profitLoss: "50.00", settledAt: new Date("2025-01-06") },
        lay: { profitLoss: "0" },
      }),
      createMockMatchedBet({
        matched: { status: "settled", createdAt: new Date("2025-01-08") }, // Wednesday same week
        back: { profitLoss: "30.00", settledAt: new Date("2025-01-08") },
        lay: { profitLoss: "0" },
      }),
      createMockMatchedBet({
        matched: { status: "settled", createdAt: new Date("2025-01-13") }, // Next Monday
        back: { profitLoss: "20.00", settledAt: new Date("2025-01-13") },
        lay: { profitLoss: "0" },
      }),
    ];

    const result = await calculateCumulativeProfitData(bets, "week");

    expect(result.length).toBe(2);
    // Week 1: profit 80 (50+30), cumulative 80, count 2
    expect(result[0].profit).toBe(80);
    expect(result[0].cumulative).toBe(80);
    expect(result[0].count).toBe(2);
    // Week 2: profit 20, cumulative 100, count 1
    expect(result[1].profit).toBe(20);
    expect(result[1].cumulative).toBe(100);
    expect(result[1].count).toBe(1);
  });

  test("groups by month correctly", async () => {
    const bets = [
      createMockMatchedBet({
        matched: { status: "settled", createdAt: new Date("2025-01-15") },
        back: { profitLoss: "100.00", settledAt: new Date("2025-01-15") },
        lay: { profitLoss: "0" },
      }),
      createMockMatchedBet({
        matched: { status: "settled", createdAt: new Date("2025-01-20") },
        back: { profitLoss: "50.00", settledAt: new Date("2025-01-20") },
        lay: { profitLoss: "0" },
      }),
      createMockMatchedBet({
        matched: { status: "settled", createdAt: new Date("2025-02-10") },
        back: { profitLoss: "75.00", settledAt: new Date("2025-02-10") },
        lay: { profitLoss: "0" },
      }),
    ];

    const result = await calculateCumulativeProfitData(bets, "month");

    expect(result.length).toBe(2);
    // Jan: profit 150, cumulative 150, count 2
    expect(result[0].profit).toBe(150);
    expect(result[0].cumulative).toBe(150);
    expect(result[0].count).toBe(2);
    // Feb: profit 75, cumulative 225, count 1
    expect(result[1].profit).toBe(75);
    expect(result[1].cumulative).toBe(225);
    expect(result[1].count).toBe(1);
  });

  test("sorts bets chronologically", async () => {
    // Create bets out of order
    const bets = [
      createMockMatchedBet({
        matched: { status: "settled", createdAt: new Date("2025-01-03") },
        back: { profitLoss: "30.00", settledAt: new Date("2025-01-03") },
        lay: { profitLoss: "0" },
      }),
      createMockMatchedBet({
        matched: { status: "settled", createdAt: new Date("2025-01-01") },
        back: { profitLoss: "10.00", settledAt: new Date("2025-01-01") },
        lay: { profitLoss: "0" },
      }),
      createMockMatchedBet({
        matched: { status: "settled", createdAt: new Date("2025-01-02") },
        back: { profitLoss: "20.00", settledAt: new Date("2025-01-02") },
        lay: { profitLoss: "0" },
      }),
    ];

    const result = await calculateCumulativeProfitData(bets, "day");

    expect(result.length).toBe(3);
    // Should be sorted: Day 1 (10), Day 2 (20), Day 3 (30)
    expect(result[0].cumulative).toBe(10);
    expect(result[1].cumulative).toBe(30);
    expect(result[2].cumulative).toBe(60);
  });
});
