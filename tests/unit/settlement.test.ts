/**
 * Unit tests for settlement outcome logic.
 *
 * Why: Validates that the outcome resolver correctly determines win/loss/push
 * for various bet types (Match Odds, Over/Under, BTTS, Correct Score, Double Chance)
 * and accurately calculates profit/loss. This is critical for auto-settlement
 * accuracy and user trust.
 */
import { describe, expect, it } from "vitest";
import {
  detectMarketType,
  resolveOutcome,
  calculateProfitLoss,
  calculateLayProfitLoss,
  calculateMatchedBetProfitLoss,
  type BetOutcome,
  type MatchResult,
} from "@/lib/settlement";

describe("settlement outcome logic", () => {
  describe("detectMarketType", () => {
    it("detects Match Odds market", () => {
      expect(detectMarketType("Match Odds")).toBe("match_odds");
      expect(detectMarketType("1X2")).toBe("match_odds");
      expect(detectMarketType("Full Time Result")).toBe("match_odds");
      expect(detectMarketType("Match Result")).toBe("match_odds");
      expect(detectMarketType("Moneyline")).toBe("match_odds");
    });

    it("detects Over/Under market", () => {
      expect(detectMarketType("Over 2.5 Goals")).toBe("over_under");
      expect(detectMarketType("Under 1.5")).toBe("over_under");
      expect(detectMarketType("O/U 3.5")).toBe("over_under");
      expect(detectMarketType("Total Goals")).toBe("over_under");
      expect(detectMarketType("Goals Over/Under")).toBe("over_under");
    });

    it("detects BTTS market", () => {
      expect(detectMarketType("Both Teams To Score")).toBe("btts");
      expect(detectMarketType("BTTS")).toBe("btts");
      expect(detectMarketType("GG")).toBe("btts");
      expect(detectMarketType("BTS")).toBe("btts");
    });

    it("detects Correct Score market", () => {
      expect(detectMarketType("Correct Score")).toBe("correct_score");
      expect(detectMarketType("Exact Score")).toBe("correct_score");
    });

    it("detects Double Chance market", () => {
      expect(detectMarketType("Double Chance")).toBe("double_chance");
      expect(detectMarketType("DC")).toBe("double_chance");
    });

    it("returns unknown for unrecognized markets", () => {
      expect(detectMarketType("Random Market")).toBe("unknown");
      expect(detectMarketType("")).toBe("unknown");
    });
  });

  describe("resolveOutcome - Match Odds (1X2)", () => {
    const result20: MatchResult = { homeScore: 2, awayScore: 0 };
    const result11: MatchResult = { homeScore: 1, awayScore: 1 };
    const result02: MatchResult = { homeScore: 0, awayScore: 2 };

    it("resolves Home Win correctly", () => {
      // Home wins 2-0
      let outcome = resolveOutcome("Match Odds", "Home Win", result20);
      expect(outcome.outcome).toBe("win");
      expect(outcome.confidence).toBe("high");

      outcome = resolveOutcome("Match Odds", "Home", result20);
      expect(outcome.outcome).toBe("win");

      outcome = resolveOutcome("Match Odds", "1", result20);
      expect(outcome.outcome).toBe("win");

      // Home loses when result is 0-2
      outcome = resolveOutcome("Match Odds", "Home Win", result02);
      expect(outcome.outcome).toBe("loss");

      // Home loses when draw
      outcome = resolveOutcome("Match Odds", "Home", result11);
      expect(outcome.outcome).toBe("loss");
    });

    it("resolves Draw correctly", () => {
      let outcome = resolveOutcome("Match Odds", "Draw", result11);
      expect(outcome.outcome).toBe("win");
      expect(outcome.confidence).toBe("high");

      outcome = resolveOutcome("Match Odds", "X", result11);
      expect(outcome.outcome).toBe("win");

      // Draw loses when not a draw
      outcome = resolveOutcome("Match Odds", "Draw", result20);
      expect(outcome.outcome).toBe("loss");

      outcome = resolveOutcome("Match Odds", "X", result02);
      expect(outcome.outcome).toBe("loss");
    });

    it("resolves Away Win correctly", () => {
      let outcome = resolveOutcome("Match Odds", "Away Win", result02);
      expect(outcome.outcome).toBe("win");
      expect(outcome.confidence).toBe("high");

      outcome = resolveOutcome("Match Odds", "Away", result02);
      expect(outcome.outcome).toBe("win");

      outcome = resolveOutcome("Match Odds", "2", result02);
      expect(outcome.outcome).toBe("win");

      // Away loses when home wins
      outcome = resolveOutcome("Match Odds", "Away Win", result20);
      expect(outcome.outcome).toBe("loss");

      // Away loses when draw
      outcome = resolveOutcome("Match Odds", "Away", result11);
      expect(outcome.outcome).toBe("loss");
    });
  });

  describe("resolveOutcome - Over/Under", () => {
    const result32: MatchResult = { homeScore: 3, awayScore: 2 }; // 5 goals
    const result10: MatchResult = { homeScore: 1, awayScore: 0 }; // 1 goal
    const result20: MatchResult = { homeScore: 2, awayScore: 0 }; // 2 goals (for push)

    it("resolves Over with Asian line (no push)", () => {
      // 5 goals > 2.5 = win
      let outcome = resolveOutcome("Over/Under", "Over 2.5", result32);
      expect(outcome.outcome).toBe("win");
      expect(outcome.confidence).toBe("high");

      // 1 goal > 2.5 = loss
      outcome = resolveOutcome("Over/Under", "Over 2.5", result10);
      expect(outcome.outcome).toBe("loss");

      // Short notation
      outcome = resolveOutcome("Over/Under", "O2.5", result32);
      expect(outcome.outcome).toBe("win");
    });

    it("resolves Under with Asian line (no push)", () => {
      // 1 goal < 2.5 = win
      let outcome = resolveOutcome("Over/Under", "Under 2.5", result10);
      expect(outcome.outcome).toBe("win");
      expect(outcome.confidence).toBe("high");

      // 5 goals < 2.5 = loss
      outcome = resolveOutcome("Over/Under", "Under 2.5", result32);
      expect(outcome.outcome).toBe("loss");

      // Short notation
      outcome = resolveOutcome("Over/Under", "U2.5", result10);
      expect(outcome.outcome).toBe("win");
    });

    it("resolves Over with whole number line (push possible)", () => {
      // 5 goals > 2 = win
      let outcome = resolveOutcome("Over/Under", "Over 2", result32);
      expect(outcome.outcome).toBe("win");

      // 2 goals = 2 = push
      outcome = resolveOutcome("Over/Under", "Over 2", result20);
      expect(outcome.outcome).toBe("push");

      // 1 goal > 2 = loss
      outcome = resolveOutcome("Over/Under", "Over 2", result10);
      expect(outcome.outcome).toBe("loss");
    });

    it("resolves Under with whole number line (push possible)", () => {
      // 1 goal < 2 = win
      let outcome = resolveOutcome("Over/Under", "Under 2", result10);
      expect(outcome.outcome).toBe("win");

      // 2 goals = 2 = push
      outcome = resolveOutcome("Over/Under", "Under 2", result20);
      expect(outcome.outcome).toBe("push");

      // 5 goals < 2 = loss
      outcome = resolveOutcome("Over/Under", "Under 2", result32);
      expect(outcome.outcome).toBe("loss");
    });
  });

  describe("resolveOutcome - Both Teams To Score", () => {
    const resultBothScore: MatchResult = { homeScore: 2, awayScore: 1 };
    const resultCleanSheet: MatchResult = { homeScore: 2, awayScore: 0 };
    const result00: MatchResult = { homeScore: 0, awayScore: 0 };

    it("resolves BTTS Yes correctly", () => {
      let outcome = resolveOutcome("Both Teams To Score", "Yes", resultBothScore);
      expect(outcome.outcome).toBe("win");
      expect(outcome.confidence).toBe("high");

      outcome = resolveOutcome("BTTS", "GG", resultBothScore);
      expect(outcome.outcome).toBe("win");

      // BTTS Yes loses on clean sheet
      outcome = resolveOutcome("BTTS", "Yes", resultCleanSheet);
      expect(outcome.outcome).toBe("loss");

      // BTTS Yes loses on 0-0
      outcome = resolveOutcome("BTTS", "Yes", result00);
      expect(outcome.outcome).toBe("loss");
    });

    it("resolves BTTS No correctly", () => {
      let outcome = resolveOutcome("Both Teams To Score", "No", resultCleanSheet);
      expect(outcome.outcome).toBe("win");
      expect(outcome.confidence).toBe("high");

      outcome = resolveOutcome("BTTS", "NG", result00);
      expect(outcome.outcome).toBe("win");

      // BTTS No loses when both teams score
      outcome = resolveOutcome("BTTS", "No", resultBothScore);
      expect(outcome.outcome).toBe("loss");
    });
  });

  describe("resolveOutcome - Correct Score", () => {
    const result21: MatchResult = { homeScore: 2, awayScore: 1 };

    it("resolves correct score win", () => {
      const outcome = resolveOutcome("Correct Score", "2-1", result21);
      expect(outcome.outcome).toBe("win");
      expect(outcome.confidence).toBe("high");
    });

    it("resolves correct score loss", () => {
      let outcome = resolveOutcome("Correct Score", "1-0", result21);
      expect(outcome.outcome).toBe("loss");

      outcome = resolveOutcome("Correct Score", "2-0", result21);
      expect(outcome.outcome).toBe("loss");

      outcome = resolveOutcome("Correct Score", "0-0", result21);
      expect(outcome.outcome).toBe("loss");
    });

    it("handles different score formats", () => {
      let outcome = resolveOutcome("Correct Score", "2:1", result21);
      expect(outcome.outcome).toBe("win");

      outcome = resolveOutcome("Exact Score", "2 - 1", result21);
      expect(outcome.outcome).toBe("win");
    });
  });

  describe("resolveOutcome - Double Chance", () => {
    const resultHome: MatchResult = { homeScore: 2, awayScore: 0 };
    const resultDraw: MatchResult = { homeScore: 1, awayScore: 1 };
    const resultAway: MatchResult = { homeScore: 0, awayScore: 2 };

    it("resolves Home or Draw (1X) correctly", () => {
      let outcome = resolveOutcome("Double Chance", "Home or Draw", resultHome);
      expect(outcome.outcome).toBe("win");

      outcome = resolveOutcome("DC", "1X", resultDraw);
      expect(outcome.outcome).toBe("win");

      // Loses on away win
      outcome = resolveOutcome("Double Chance", "Home or Draw", resultAway);
      expect(outcome.outcome).toBe("loss");
    });

    it("resolves Away or Draw (X2) correctly", () => {
      let outcome = resolveOutcome("Double Chance", "Away or Draw", resultAway);
      expect(outcome.outcome).toBe("win");

      outcome = resolveOutcome("DC", "X2", resultDraw);
      expect(outcome.outcome).toBe("win");

      // Loses on home win
      outcome = resolveOutcome("Double Chance", "Away or Draw", resultHome);
      expect(outcome.outcome).toBe("loss");
    });

    it("resolves Home or Away (12 / No Draw) correctly", () => {
      let outcome = resolveOutcome("Double Chance", "Home or Away", resultHome);
      expect(outcome.outcome).toBe("win");

      outcome = resolveOutcome("DC", "12", resultAway);
      expect(outcome.outcome).toBe("win");

      // Loses on draw
      outcome = resolveOutcome("Double Chance", "No Draw", resultDraw);
      expect(outcome.outcome).toBe("loss");
    });
  });

  describe("resolveOutcome - Unknown market", () => {
    it("returns unknown for unrecognized market", () => {
      const outcome = resolveOutcome("Random Market", "Something", { homeScore: 1, awayScore: 0 });
      expect(outcome.outcome).toBe("unknown");
      expect(outcome.confidence).toBe("low");
    });

    it("infers Over/Under from selection pattern", () => {
      const outcome = resolveOutcome("Goals", "Over 2.5", { homeScore: 3, awayScore: 1 });
      expect(outcome.outcome).toBe("win");
    });

    it("infers Correct Score from selection pattern", () => {
      const outcome = resolveOutcome("Score", "2-1", { homeScore: 2, awayScore: 1 });
      expect(outcome.outcome).toBe("win");
    });
  });

  describe("calculateProfitLoss", () => {
    it("calculates win profit correctly", () => {
      // £100 @ 2.50 = £150 profit (stake * (odds - 1))
      expect(calculateProfitLoss("win", 100, 2.5)).toBe(150);

      // £50 @ 3.00 = £100 profit
      expect(calculateProfitLoss("win", 50, 3.0)).toBe(100);
    });

    it("calculates loss correctly", () => {
      // Lose stake
      expect(calculateProfitLoss("loss", 100, 2.5)).toBe(-100);
      expect(calculateProfitLoss("loss", 50, 3.0)).toBe(-50);
    });

    it("calculates push correctly", () => {
      // No profit/loss
      expect(calculateProfitLoss("push", 100, 2.5)).toBe(0);
    });

    it("handles free bet wins correctly", () => {
      // Free bet: profit = stake * (odds - 1), stake not returned
      // £100 free bet @ 2.50 = £150 profit
      expect(calculateProfitLoss("win", 100, 2.5, true)).toBe(150);
    });

    it("handles free bet losses correctly", () => {
      // Free bet loss: no real loss (it was free money)
      expect(calculateProfitLoss("loss", 100, 2.5, true)).toBe(0);
    });

    it("returns 0 for unknown outcome", () => {
      expect(calculateProfitLoss("unknown", 100, 2.5)).toBe(0);
    });
  });

  describe("calculateLayProfitLoss", () => {
    it("calculates lay loss when selection wins", () => {
      // Lay £100 @ 2.50, liability = 100 * (2.5 - 1) = £150 loss
      expect(calculateLayProfitLoss("win", 100, 2.5)).toBe(-150);

      // Lay £50 @ 3.00, liability = 50 * (3.0 - 1) = £100 loss
      expect(calculateLayProfitLoss("win", 50, 3.0)).toBe(-100);
    });

    it("calculates lay win when selection loses", () => {
      // Layer wins the lay stake
      expect(calculateLayProfitLoss("loss", 100, 2.5)).toBe(100);
      expect(calculateLayProfitLoss("loss", 50, 3.0)).toBe(50);
    });

    it("returns 0 for push", () => {
      expect(calculateLayProfitLoss("push", 100, 2.5)).toBe(0);
    });

    it("deducts commission from winning lay bets", () => {
      // Lay £100, selection loses, 5% commission
      // Gross profit = £100, commission = £5, net = £95
      expect(calculateLayProfitLoss("loss", 100, 2.5, 0.05)).toBe(95);
      
      // Lay £200, selection loses, 2% commission
      // Gross profit = £200, commission = £4, net = £196
      expect(calculateLayProfitLoss("loss", 200, 3.0, 0.02)).toBe(196);
    });

    it("does not apply commission to losing lay bets", () => {
      // When lay bet loses (selection wins), no commission is applied
      // Commission only applies to profits, not losses
      expect(calculateLayProfitLoss("win", 100, 2.5, 0.05)).toBe(-150);
      expect(calculateLayProfitLoss("win", 50, 3.0, 0.02)).toBe(-100);
    });

    it("handles zero commission correctly", () => {
      expect(calculateLayProfitLoss("loss", 100, 2.5, 0)).toBe(100);
    });
  });

  describe("calculateMatchedBetProfitLoss", () => {
    it("calculates correctly when back wins", () => {
      // Back £100 @ 2.00, Lay £95 @ 2.05
      // Back wins: +£100 profit, Lay loses: -£99.75 liability
      const result = calculateMatchedBetProfitLoss("win", 100, 2.0, 95, 2.05);

      expect(result.backProfitLoss).toBe(100); // 100 * (2.0 - 1)
      expect(result.layProfitLoss).toBeCloseTo(-99.75); // -95 * (2.05 - 1)
      expect(result.netProfitLoss).toBeCloseTo(0.25);
    });

    it("calculates correctly when back loses", () => {
      // Back £100 @ 2.00, Lay £95 @ 2.05
      // Back loses: -£100, Lay wins: +£95
      const result = calculateMatchedBetProfitLoss("loss", 100, 2.0, 95, 2.05);

      expect(result.backProfitLoss).toBe(-100);
      expect(result.layProfitLoss).toBe(95);
      expect(result.netProfitLoss).toBe(-5);
    });

    it("calculates free bet matched correctly when back wins", () => {
      // Free bet £100 @ 5.00, Lay £80 @ 5.10
      // Free bet wins: +£400 (no stake return), Lay loses: -£328 liability
      const result = calculateMatchedBetProfitLoss("win", 100, 5.0, 80, 5.1, true);

      expect(result.backProfitLoss).toBe(400); // 100 * (5.0 - 1)
      expect(result.layProfitLoss).toBeCloseTo(-328); // -80 * (5.1 - 1)
      expect(result.netProfitLoss).toBeCloseTo(72);
    });

    it("calculates free bet matched correctly when back loses", () => {
      // Free bet £100 @ 5.00, Lay £80 @ 5.10
      // Free bet loses: £0 (free bet), Lay wins: +£80
      const result = calculateMatchedBetProfitLoss("loss", 100, 5.0, 80, 5.1, true);

      expect(result.backProfitLoss).toBe(0); // Free bet loss = 0
      expect(result.layProfitLoss).toBe(80);
      expect(result.netProfitLoss).toBe(80);
    });

    it("applies exchange commission when back loses (lay wins)", () => {
      // Back £100 @ 2.00, Lay £100 @ 2.00, 5% exchange commission
      // Back loses: -£100, Lay wins: +£100 gross, -£5 commission = +£95 net
      const result = calculateMatchedBetProfitLoss("loss", 100, 2.0, 100, 2.0, false, 0.05);

      expect(result.backProfitLoss).toBe(-100);
      expect(result.layProfitLoss).toBe(95); // 100 * (1 - 0.05)
      expect(result.netProfitLoss).toBe(-5); // -100 + 95
    });

    it("does not apply commission when back wins (lay loses)", () => {
      // Back £100 @ 2.00, Lay £100 @ 2.00, 5% exchange commission
      // Back wins: +£100, Lay loses: -£100 (no commission on losses)
      const result = calculateMatchedBetProfitLoss("win", 100, 2.0, 100, 2.0, false, 0.05);

      expect(result.backProfitLoss).toBe(100);
      expect(result.layProfitLoss).toBe(-100); // Full liability, no commission
      expect(result.netProfitLoss).toBe(0);
    });

    it("calculates free bet with commission correctly", () => {
      // Free bet £100 @ 5.00, Lay £80 @ 5.10, 2% exchange commission
      // Free bet loses: £0, Lay wins: +£80 gross, -£1.60 commission = +£78.40 net
      const result = calculateMatchedBetProfitLoss("loss", 100, 5.0, 80, 5.1, true, 0.02);

      expect(result.backProfitLoss).toBe(0); // Free bet loss = 0
      expect(result.layProfitLoss).toBeCloseTo(78.4); // 80 * (1 - 0.02)
      expect(result.netProfitLoss).toBeCloseTo(78.4);
    });
  });
});
