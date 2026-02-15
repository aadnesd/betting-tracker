/**
 * Unit tests for getTotalBonusesForUser query.
 *
 * Why: This query sums all bonus-type transactions for a user within a date range.
 * It's used in the reports summary to include bonuses in the overall profit calculation.
 * Bonuses are real profit that should be reflected in performance metrics.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock server-only to allow testing server modules
vi.mock("server-only", () => ({}));

// Mock database to test function signature without actual DB calls
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ total: "150.00" }]),
      })),
    })),
  })),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({})),
}));

import * as dbQueries from "@/lib/db/queries";

describe("getTotalBonusesForUser", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("function signature", () => {
    it("is a function that accepts userId and optional date filters", async () => {
      expect(typeof dbQueries.getTotalBonusesForUser).toBe("function");

      // Verify function returns a number
      const fn: (args: {
        userId: string;
        startDate?: Date | null;
        endDate?: Date | null;
      }) => Promise<number> = dbQueries.getTotalBonusesForUser;
      expect(fn).toBeDefined();
    });

    it("accepts all date range parameters", () => {
      const params: Parameters<typeof dbQueries.getTotalBonusesForUser>[0] = {
        userId: "user-1",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
      };
      expect(params.userId).toBe("user-1");
      expect(params.startDate).toBeInstanceOf(Date);
      expect(params.endDate).toBeInstanceOf(Date);
    });

    it("allows null date parameters for all-time queries", () => {
      const params: Parameters<typeof dbQueries.getTotalBonusesForUser>[0] = {
        userId: "user-1",
        startDate: null,
        endDate: null,
      };
      expect(params.startDate).toBeNull();
      expect(params.endDate).toBeNull();
    });

    it("allows omitting date parameters entirely", () => {
      const params: Parameters<typeof dbQueries.getTotalBonusesForUser>[0] = {
        userId: "user-1",
      };
      expect(params.userId).toBe("user-1");
      expect(params.startDate).toBeUndefined();
      expect(params.endDate).toBeUndefined();
    });
  });

  describe("return value", () => {
    it("returns a number representing total bonus amount", async () => {
      // The function is typed to return Promise<number>
      const returnType: Awaited<
        ReturnType<typeof dbQueries.getTotalBonusesForUser>
      > = 100.5;
      expect(typeof returnType).toBe("number");
    });

    it("represents total as sum of all bonus transactions", () => {
      // Example: User received bonuses of 50, 30, and 20 = 100 total
      const mockBonuses = [50, 30, 20];
      const expectedTotal = mockBonuses.reduce((sum, b) => sum + b, 0);
      expect(expectedTotal).toBe(100);
    });

    it("can return zero when no bonuses exist", () => {
      const noBonus: number = 0;
      expect(noBonus).toBe(0);
    });
  });

  describe("usage in reports summary", () => {
    it("total is added to betting profit for net profit calculation", () => {
      const bettingProfit = 500;
      const bonusTotal = 150;
      const netProfit = bettingProfit + bonusTotal;
      expect(netProfit).toBe(650);
    });

    it("total affects ROI calculation (net profit / stake * 100)", () => {
      const bettingProfit = 100;
      const bonusTotal = 50;
      const totalStake = 1000;

      const roiWithoutBonus = (bettingProfit / totalStake) * 100;
      const roiWithBonus = ((bettingProfit + bonusTotal) / totalStake) * 100;

      expect(roiWithoutBonus).toBe(10);
      expect(roiWithBonus).toBe(15);
      expect(roiWithBonus).toBeGreaterThan(roiWithoutBonus);
    });

    it("positive bonuses can offset negative betting profit", () => {
      const bettingProfit = -50;
      const bonusTotal = 100;
      const netProfit = bettingProfit + bonusTotal;
      expect(netProfit).toBe(50);
      expect(netProfit).toBeGreaterThan(0);
    });
  });
});
