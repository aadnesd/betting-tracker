import { describe, expect, it } from "vitest";
import {
  combineSplitBetLegs,
  computeMatchedNetExposure,
} from "@/lib/bet-calculations";

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

describe("combineSplitBetLegs", () => {
  it("combines back splits into total stake and equivalent odds", () => {
    const result = combineSplitBetLegs(
      [
        { odds: 2.02, stake: 200 },
        { odds: 2.04, stake: 100 },
      ],
      "back"
    );

    expect(result.stake).toBe(300);
    expect(result.profit).toBeCloseTo(308);
    expect(result.odds).toBeCloseTo(2.026_666_666_7);
  });

  it("combines lay splits using total liability", () => {
    const result = combineSplitBetLegs(
      [
        { odds: 2.02, stake: 200 },
        { odds: 2.04, stake: 100 },
      ],
      "lay"
    );

    expect(result.stake).toBe(300);
    expect(result.liability).toBeCloseTo(308);
    expect(result.odds).toBeCloseTo(2.026_666_666_7);
  });
});
