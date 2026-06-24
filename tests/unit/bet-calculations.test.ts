import { describe, expect, it } from "vitest";
import {
  calculateOptimalLayStake,
  combineSplitBetLegs,
  computeMatchedNetExposure,
  computeSingleLegOutcome,
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

describe("calculateOptimalLayStake", () => {
  it("calculates the equal-profit stake for a qualifying bet", () => {
    const result = calculateOptimalLayStake({
      backStake: 100,
      backOdds: 2,
      layOdds: 2.02,
      commissionRate: 0.02,
    });

    expect(result?.layStake).toBeCloseTo(100);
    expect(result?.layLiability).toBeCloseTo(102);
  });

  it("converts the back stake into the lay currency before calculating", () => {
    const result = calculateOptimalLayStake({
      backStake: 100,
      backOdds: 2,
      layOdds: 2,
      backRateToBase: 12,
      layRateToBase: 10,
    });

    expect(result?.layStake).toBeCloseTo(120);
    expect(result?.layLiability).toBeCloseTo(120);
  });

  it("uses only winnings for stake-not-returned free bets", () => {
    const result = calculateOptimalLayStake({
      backStake: 50,
      backOdds: 5,
      layOdds: 5,
      isFreeBet: true,
      freeBetStakeReturned: false,
    });

    expect(result?.layStake).toBeCloseTo(40);
    expect(result?.layLiability).toBeCloseTo(160);
  });

  it("uses full returns for stake-returned free bets", () => {
    const result = calculateOptimalLayStake({
      backStake: 50,
      backOdds: 5,
      layOdds: 5,
      isFreeBet: true,
      freeBetStakeReturned: true,
    });

    expect(result?.layStake).toBeCloseTo(50);
    expect(result?.layLiability).toBeCloseTo(200);
  });

  it("underlays by reducing the balanced lay stake", () => {
    const result = calculateOptimalLayStake({
      backStake: 100,
      backOdds: 2,
      layOdds: 2.02,
      commissionRate: 0.02,
      strategy: "underlay",
      biasPercent: 50,
    });

    expect(result?.balancedLayStake).toBeCloseTo(100);
    expect(result?.layStake).toBeCloseTo(75);
    expect(result?.profitIfBackWins).toBeGreaterThan(
      result?.profitIfLayWins ?? 0
    );
  });

  it("overlays by increasing the balanced lay stake", () => {
    const result = calculateOptimalLayStake({
      backStake: 100,
      backOdds: 2,
      layOdds: 2.02,
      commissionRate: 0.02,
      strategy: "overlay",
      biasPercent: 50,
    });

    expect(result?.balancedLayStake).toBeCloseTo(100);
    expect(result?.layStake).toBeCloseTo(125);
    expect(result?.profitIfLayWins).toBeGreaterThan(
      result?.profitIfBackWins ?? 0
    );
  });
});

describe("computeSingleLegOutcome", () => {
  it("computes a cash back leg: wins stake*(odds-1), loses the stake", () => {
    const result = computeSingleLegOutcome({
      kind: "back",
      stake: 80,
      odds: 26,
    });

    expect(result.profitIfWins).toBeCloseTo(2000);
    expect(result.profitIfLoses).toBeCloseTo(-80);
    expect(result.netExposure).toBeCloseTo(-80);
  });

  it("treats a free-bet back leg as risk-free on the losing side", () => {
    const result = computeSingleLegOutcome({
      kind: "back",
      stake: 50,
      odds: 25,
      isFreeBet: true,
    });

    // Stake-not-returned free bet: keep only the profit, lose nothing.
    expect(result.profitIfWins).toBeCloseTo(1200);
    expect(result.profitIfLoses).toBe(0);
    expect(result.netExposure).toBe(0);
  });

  it("adds the stake back for a stake-returned free-bet back leg", () => {
    const result = computeSingleLegOutcome({
      kind: "back",
      stake: 50,
      odds: 25,
      isFreeBet: true,
      freeBetStakeReturned: true,
    });

    expect(result.profitIfWins).toBeCloseTo(1250);
    expect(result.profitIfLoses).toBe(0);
  });

  it("computes a lay leg: loses the liability, wins stake net of commission", () => {
    const result = computeSingleLegOutcome({
      kind: "lay",
      stake: 100,
      odds: 3,
      commissionRate: 0.02,
    });

    expect(result.profitIfWins).toBeCloseTo(-200);
    expect(result.profitIfLoses).toBeCloseTo(98);
    expect(result.netExposure).toBeCloseTo(-200);
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
