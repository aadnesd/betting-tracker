import { describe, expect, it } from "vitest";
import { computeMatchedNetExposure } from "@/lib/bet-calculations";

describe("computeMatchedNetExposure", () => {
  it("uses the worse outcome after exchange commission", () => {
    const result = computeMatchedNetExposure({
      backStake: 100,
      backProfit: 150,
      layStake: 99,
      layLiability: 150.48,
      commissionRate: 0.05,
    });

    expect(result.profitIfBackWins).toBeCloseTo(-0.48);
    expect(result.profitIfLayWins).toBeCloseTo(-5.95);
    expect(result.netExposure).toBeCloseTo(-5.95);
  });

  it("does not deduct commission from the back-win side", () => {
    const result = computeMatchedNetExposure({
      backStake: 100,
      backProfit: 100,
      layStake: 100,
      layLiability: 100,
      commissionRate: 0.05,
    });

    expect(result.profitIfBackWins).toBe(0);
    expect(result.profitIfLayWins).toBe(-5);
    expect(result.netExposure).toBe(-5);
  });

  it("handles free bets where the back stake is not lost", () => {
    const result = computeMatchedNetExposure({
      backStake: 100,
      backProfit: 400,
      layStake: 80,
      layLiability: 328,
      isFreeBet: true,
      commissionRate: 0.02,
    });

    expect(result.profitIfBackWins).toBe(72);
    expect(result.profitIfLayWins).toBe(78.4);
    expect(result.netExposure).toBe(72);
  });
});
