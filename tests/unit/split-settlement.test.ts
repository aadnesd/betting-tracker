/**
 * Unit tests for computePerAccountAdjustments.
 *
 * Why: When a back/lay stake is split across several accounts, settlement must
 * deduct the correct amount from each account (e.g. 4500 from Stake, 1500 from
 * Sharkbetx) instead of the full amount from the single stored account. The
 * per-account amounts must always sum to the bet's total P&L so account
 * balances stay consistent with reporting.
 */
import { describe, expect, it } from "vitest";
import {
  calculateProfitLoss,
  computePerAccountAdjustments,
  type SettlementSplitLeg,
} from "@/lib/settlement";

const STAKE = "stake-account";
const SHARK = "sharkbetx-account";

describe("computePerAccountAdjustments", () => {
  it("returns a single adjustment against the primary account when there are no split legs", () => {
    const result = computePerAccountAdjustments({
      kind: "back",
      outcome: "loss",
      totalProfitLoss: -6000,
      primaryAccountId: STAKE,
      legs: null,
    });

    expect(result).toEqual([{ accountId: STAKE, amount: -6000 }]);
  });

  it("returns the primary account even when the total P&L is zero for a single-account bet (callers decide whether to record it)", () => {
    const result = computePerAccountAdjustments({
      kind: "back",
      outcome: "loss",
      totalProfitLoss: 0,
      primaryAccountId: STAKE,
      legs: null,
    });

    expect(result).toEqual([{ accountId: STAKE, amount: 0 }]);
  });

  it("returns no adjustments when there is no account at all", () => {
    const result = computePerAccountAdjustments({
      kind: "back",
      outcome: "loss",
      totalProfitLoss: -100,
      primaryAccountId: null,
      legs: null,
    });

    expect(result).toEqual([]);
  });

  it("splits a losing back bet across the accounts it was placed on (the bug scenario)", () => {
    const legs: SettlementSplitLeg[] = [
      { accountId: STAKE, stake: 3000, odds: 2.1 },
      { accountId: STAKE, stake: 1500, odds: 2.1 },
      { accountId: SHARK, stake: 1500, odds: 2.041 },
    ];

    const result = computePerAccountAdjustments({
      kind: "back",
      outcome: "loss",
      totalProfitLoss: -6000,
      primaryAccountId: STAKE,
      legs,
    });

    // Same account aggregates into one adjustment.
    expect(result).toContainEqual({ accountId: STAKE, amount: -4500 });
    expect(result).toContainEqual({ accountId: SHARK, amount: -1500 });
    const total = result.reduce((sum, adj) => sum + adj.amount, 0);
    expect(total).toBeCloseTo(-6000, 2);
  });

  it("splits a winning back bet using each leg's own odds", () => {
    const legs: SettlementSplitLeg[] = [
      { accountId: STAKE, stake: 3000, odds: 2.1 },
      { accountId: STAKE, stake: 1500, odds: 2.1 },
      { accountId: SHARK, stake: 1500, odds: 2.041 },
    ];
    // Total win P&L = sum of each leg's profit.
    const totalWin =
      calculateProfitLoss("win", 3000, 2.1) +
      calculateProfitLoss("win", 1500, 2.1) +
      calculateProfitLoss("win", 1500, 2.041);

    const result = computePerAccountAdjustments({
      kind: "back",
      outcome: "win",
      totalProfitLoss: totalWin,
      primaryAccountId: STAKE,
      legs,
    });

    // Stake: 3000*(1.1) + 1500*(1.1) = 4950; Sharkbetx: 1500*(1.041) = 1561.5
    expect(result).toContainEqual({ accountId: STAKE, amount: 4950 });
    expect(result).toContainEqual({ accountId: SHARK, amount: 1561.5 });
    const total = result.reduce((sum, adj) => sum + adj.amount, 0);
    expect(total).toBeCloseTo(totalWin, 2);
  });

  it("reconciles rounding drift onto the primary account so the split matches the total exactly", () => {
    const legs: SettlementSplitLeg[] = [
      { accountId: STAKE, stake: 33.33, odds: 3 },
      { accountId: SHARK, stake: 33.33, odds: 3 },
      { accountId: STAKE, stake: 33.34, odds: 3 },
    ];
    const total = -100; // full combined stake lost

    const result = computePerAccountAdjustments({
      kind: "back",
      outcome: "loss",
      totalProfitLoss: total,
      primaryAccountId: STAKE,
      legs,
    });

    const summed = result.reduce((sum, adj) => sum + adj.amount, 0);
    expect(Math.round(summed * 100) / 100).toBe(total);
  });

  it("returns no adjustments for a losing free bet split (no real stake risked)", () => {
    const legs: SettlementSplitLeg[] = [
      { accountId: STAKE, stake: 50, odds: 2 },
      { accountId: SHARK, stake: 50, odds: 2 },
    ];

    const result = computePerAccountAdjustments({
      kind: "back",
      outcome: "loss",
      totalProfitLoss: 0,
      primaryAccountId: STAKE,
      legs,
      isFreeBet: true,
    });

    expect(result).toEqual([]);
  });

  it("splits a winning lay bet (selection lost) across exchange accounts, net of commission", () => {
    const legs: SettlementSplitLeg[] = [
      { accountId: STAKE, stake: 1000, odds: 3 },
      { accountId: SHARK, stake: 500, odds: 3 },
    ];
    const commissionRate = 0.02;
    // Lay wins when the selection loses. From the layer's perspective that is
    // outcome "loss" (back lost). Each leg wins stake * (1 - commission).
    const total = 1500 * (1 - commissionRate);

    const result = computePerAccountAdjustments({
      kind: "lay",
      outcome: "loss",
      totalProfitLoss: total,
      primaryAccountId: STAKE,
      legs,
      commissionRate,
    });

    expect(result).toContainEqual({ accountId: STAKE, amount: 980 });
    expect(result).toContainEqual({ accountId: SHARK, amount: 490 });
    const summed = result.reduce((sum, adj) => sum + adj.amount, 0);
    expect(summed).toBeCloseTo(total, 2);
  });

  it("collapses to a single adjustment when every leg is on the same account", () => {
    const legs: SettlementSplitLeg[] = [
      { accountId: STAKE, stake: 3000, odds: 2.1 },
      { accountId: STAKE, stake: 1500, odds: 2.1 },
    ];

    const result = computePerAccountAdjustments({
      kind: "back",
      outcome: "loss",
      totalProfitLoss: -4500,
      primaryAccountId: STAKE,
      legs,
    });

    expect(result).toEqual([{ accountId: STAKE, amount: -4500 }]);
  });
});
