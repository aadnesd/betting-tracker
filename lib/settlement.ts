/**
 * Settlement Outcome Logic
 *
 * Determines bet outcomes (win/loss/push) based on match results and bet selections.
 * Calculates profit/loss for matched bets when settling.
 *
 * Supports common match betting markets:
 * - Match Odds (1X2): Home Win, Draw, Away Win
 * - Over/Under Goals: Over 0.5, Under 2.5, etc.
 * - Both Teams To Score: Yes, No
 * - Correct Score: 1-0, 2-1, etc.
 * - Double Chance: Home or Draw, Away or Draw, Home or Away
 */

/**
 * Bet outcome enumeration
 */
export type BetOutcome = "win" | "loss" | "push" | "unknown";

/**
 * Market type detection
 */
export type MarketType =
  | "match_odds"
  | "over_under"
  | "btts"
  | "correct_score"
  | "double_chance"
  | "unknown";

/**
 * Match result for outcome calculation
 */
export interface MatchResult {
  homeScore: number;
  awayScore: number;
}

/**
 * Outcome calculation result
 */
export interface OutcomeResult {
  outcome: BetOutcome;
  confidence: "high" | "medium" | "low";
  reason: string;
  detectedMarket: MarketType;
}

/**
 * Detect the market type from market name
 */
export function detectMarketType(market: string): MarketType {
  const normalized = market.toLowerCase().trim();

  // Match Odds / 1X2
  if (
    normalized.includes("match odds") ||
    normalized.includes("1x2") ||
    normalized.includes("full time result") ||
    normalized.includes("match result") ||
    normalized === "moneyline"
  ) {
    return "match_odds";
  }

  // Over/Under
  if (
    normalized.includes("over") ||
    normalized.includes("under") ||
    normalized.includes("o/u") ||
    normalized.includes("total goals") ||
    normalized.includes("goals")
  ) {
    return "over_under";
  }

  // Both Teams To Score
  if (
    normalized.includes("both teams") ||
    normalized.includes("btts") ||
    normalized.includes("gg") ||
    normalized.includes("bts")
  ) {
    return "btts";
  }

  // Correct Score
  if (
    normalized.includes("correct score") ||
    normalized.includes("exact score")
  ) {
    return "correct_score";
  }

  // Double Chance
  if (normalized.includes("double chance") || normalized.includes("dc")) {
    return "double_chance";
  }

  return "unknown";
}

/**
 * Normalize selection text for matching
 */
function normalizeSelection(selection: string): string {
  return selection.toLowerCase().trim();
}

/**
 * Determine outcome for Match Odds (1X2) market
 * Selections: "Home", "Home Win", "1", "Draw", "X", "Away", "Away Win", "2"
 */
function resolveMatchOddsOutcome(
  selection: string,
  result: MatchResult
): OutcomeResult {
  const normalized = normalizeSelection(selection);
  const { homeScore, awayScore } = result;

  // Home win selection
  if (
    normalized.includes("home") ||
    normalized === "1" ||
    normalized.includes("home win")
  ) {
    if (homeScore > awayScore) {
      return {
        outcome: "win",
        confidence: "high",
        reason: `Home win selected. Result: ${homeScore}-${awayScore} (home wins)`,
        detectedMarket: "match_odds",
      };
    }
    return {
      outcome: "loss",
      confidence: "high",
      reason: `Home win selected. Result: ${homeScore}-${awayScore} (home did not win)`,
      detectedMarket: "match_odds",
    };
  }

  // Draw selection
  if (
    normalized === "draw" ||
    normalized === "x" ||
    normalized.includes("draw")
  ) {
    if (homeScore === awayScore) {
      return {
        outcome: "win",
        confidence: "high",
        reason: `Draw selected. Result: ${homeScore}-${awayScore} (match drawn)`,
        detectedMarket: "match_odds",
      };
    }
    return {
      outcome: "loss",
      confidence: "high",
      reason: `Draw selected. Result: ${homeScore}-${awayScore} (not a draw)`,
      detectedMarket: "match_odds",
    };
  }

  // Away win selection
  if (
    normalized.includes("away") ||
    normalized === "2" ||
    normalized.includes("away win")
  ) {
    if (awayScore > homeScore) {
      return {
        outcome: "win",
        confidence: "high",
        reason: `Away win selected. Result: ${homeScore}-${awayScore} (away wins)`,
        detectedMarket: "match_odds",
      };
    }
    return {
      outcome: "loss",
      confidence: "high",
      reason: `Away win selected. Result: ${homeScore}-${awayScore} (away did not win)`,
      detectedMarket: "match_odds",
    };
  }

  // Try to match team names against selection
  // This will be handled externally with team name matching
  return {
    outcome: "unknown",
    confidence: "low",
    reason: `Could not determine 1X2 outcome for selection "${selection}"`,
    detectedMarket: "match_odds",
  };
}

/**
 * Parse over/under goal line from selection
 * Handles: "Over 2.5", "Under 1.5", "O2.5", "U3.5", etc.
 */
function parseGoalLine(selection: string): {
  type: "over" | "under" | null;
  line: number | null;
} {
  const normalized = normalizeSelection(selection);

  // Match patterns like "over 2.5", "o2.5", "under 1.5", "u3.5"
  const overMatch = normalized.match(/(?:over|o)\s*(\d+\.?\d*)/);
  if (overMatch) {
    return { type: "over", line: Number.parseFloat(overMatch[1]) };
  }

  const underMatch = normalized.match(/(?:under|u)\s*(\d+\.?\d*)/);
  if (underMatch) {
    return { type: "under", line: Number.parseFloat(underMatch[1]) };
  }

  return { type: null, line: null };
}

/**
 * Determine outcome for Over/Under goals market
 */
function resolveOverUnderOutcome(
  selection: string,
  result: MatchResult
): OutcomeResult {
  const totalGoals = result.homeScore + result.awayScore;
  const { type, line } = parseGoalLine(selection);

  if (type === null || line === null) {
    return {
      outcome: "unknown",
      confidence: "low",
      reason: `Could not parse goal line from selection "${selection}"`,
      detectedMarket: "over_under",
    };
  }

  // Handle Asian lines (0.5, 1.5, 2.5) - no push possible
  if (line % 1 !== 0) {
    if (type === "over") {
      const isWin = totalGoals > line;
      return {
        outcome: isWin ? "win" : "loss",
        confidence: "high",
        reason: `Over ${line} goals selected. Total goals: ${totalGoals}`,
        detectedMarket: "over_under",
      };
    }
    // under
    const isWin = totalGoals < line;
    return {
      outcome: isWin ? "win" : "loss",
      confidence: "high",
      reason: `Under ${line} goals selected. Total goals: ${totalGoals}`,
      detectedMarket: "over_under",
    };
  }

  // Handle whole number lines - push possible
  if (type === "over") {
    if (totalGoals > line) {
      return {
        outcome: "win",
        confidence: "high",
        reason: `Over ${line} goals selected. Total goals: ${totalGoals}`,
        detectedMarket: "over_under",
      };
    }
    if (totalGoals === line) {
      return {
        outcome: "push",
        confidence: "high",
        reason: `Over ${line} goals selected. Total goals: ${totalGoals} (push)`,
        detectedMarket: "over_under",
      };
    }
    return {
      outcome: "loss",
      confidence: "high",
      reason: `Over ${line} goals selected. Total goals: ${totalGoals}`,
      detectedMarket: "over_under",
    };
  }

  // under with whole number
  if (totalGoals < line) {
    return {
      outcome: "win",
      confidence: "high",
      reason: `Under ${line} goals selected. Total goals: ${totalGoals}`,
      detectedMarket: "over_under",
    };
  }
  if (totalGoals === line) {
    return {
      outcome: "push",
      confidence: "high",
      reason: `Under ${line} goals selected. Total goals: ${totalGoals} (push)`,
      detectedMarket: "over_under",
    };
  }
  return {
    outcome: "loss",
    confidence: "high",
    reason: `Under ${line} goals selected. Total goals: ${totalGoals}`,
    detectedMarket: "over_under",
  };
}

/**
 * Determine outcome for Both Teams To Score market
 */
function resolveBttsOutcome(
  selection: string,
  result: MatchResult
): OutcomeResult {
  const normalized = normalizeSelection(selection);
  const bothScored = result.homeScore > 0 && result.awayScore > 0;

  if (normalized === "yes" || normalized.includes("yes") || normalized === "gg") {
    return {
      outcome: bothScored ? "win" : "loss",
      confidence: "high",
      reason: `BTTS Yes selected. Result: ${result.homeScore}-${result.awayScore}${bothScored ? " (both teams scored)" : " (clean sheet)"}`,
      detectedMarket: "btts",
    };
  }

  if (normalized === "no" || normalized.includes("no") || normalized === "ng") {
    return {
      outcome: bothScored ? "loss" : "win",
      confidence: "high",
      reason: `BTTS No selected. Result: ${result.homeScore}-${result.awayScore}${bothScored ? " (both teams scored)" : " (clean sheet)"}`,
      detectedMarket: "btts",
    };
  }

  return {
    outcome: "unknown",
    confidence: "low",
    reason: `Could not determine BTTS outcome for selection "${selection}"`,
    detectedMarket: "btts",
  };
}

/**
 * Determine outcome for Correct Score market
 * Selections: "1-0", "2-1", "0-0", etc.
 */
function resolveCorrectScoreOutcome(
  selection: string,
  result: MatchResult
): OutcomeResult {
  const normalized = normalizeSelection(selection);

  // Parse score from selection (format: "X-Y" or "X:Y")
  const scoreMatch = normalized.match(/(\d+)\s*[-:]\s*(\d+)/);

  if (!scoreMatch) {
    return {
      outcome: "unknown",
      confidence: "low",
      reason: `Could not parse score from selection "${selection}"`,
      detectedMarket: "correct_score",
    };
  }

  const selectedHome = Number.parseInt(scoreMatch[1], 10);
  const selectedAway = Number.parseInt(scoreMatch[2], 10);

  if (result.homeScore === selectedHome && result.awayScore === selectedAway) {
    return {
      outcome: "win",
      confidence: "high",
      reason: `Correct score ${selectedHome}-${selectedAway} selected. Result: ${result.homeScore}-${result.awayScore} (exact match)`,
      detectedMarket: "correct_score",
    };
  }

  return {
    outcome: "loss",
    confidence: "high",
    reason: `Correct score ${selectedHome}-${selectedAway} selected. Result: ${result.homeScore}-${result.awayScore}`,
    detectedMarket: "correct_score",
  };
}

/**
 * Determine outcome for Double Chance market
 * Selections: "Home or Draw", "1X", "Away or Draw", "X2", "Home or Away", "12"
 */
function resolveDoubleChanceOutcome(
  selection: string,
  result: MatchResult
): OutcomeResult {
  const normalized = normalizeSelection(selection);
  const { homeScore, awayScore } = result;

  // Home or Draw (1X)
  if (
    normalized.includes("home or draw") ||
    normalized === "1x" ||
    normalized.includes("home/draw")
  ) {
    const isWin = homeScore >= awayScore; // home wins or draws
    return {
      outcome: isWin ? "win" : "loss",
      confidence: "high",
      reason: `Home or Draw selected. Result: ${homeScore}-${awayScore}`,
      detectedMarket: "double_chance",
    };
  }

  // Away or Draw (X2)
  if (
    normalized.includes("away or draw") ||
    normalized === "x2" ||
    normalized.includes("draw/away")
  ) {
    const isWin = awayScore >= homeScore; // away wins or draws
    return {
      outcome: isWin ? "win" : "loss",
      confidence: "high",
      reason: `Away or Draw selected. Result: ${homeScore}-${awayScore}`,
      detectedMarket: "double_chance",
    };
  }

  // Home or Away (12) - no draw
  if (
    normalized.includes("home or away") ||
    normalized === "12" ||
    normalized.includes("no draw")
  ) {
    const isWin = homeScore !== awayScore; // not a draw
    return {
      outcome: isWin ? "win" : "loss",
      confidence: "high",
      reason: `Home or Away selected. Result: ${homeScore}-${awayScore}`,
      detectedMarket: "double_chance",
    };
  }

  return {
    outcome: "unknown",
    confidence: "low",
    reason: `Could not determine double chance outcome for selection "${selection}"`,
    detectedMarket: "double_chance",
  };
}

/**
 * Main function to resolve bet outcome based on market, selection, and match result.
 *
 * @param market - The betting market (e.g., "Match Odds", "Over/Under 2.5")
 * @param selection - The selection made (e.g., "Home Win", "Over 2.5")
 * @param result - The match result with home and away scores
 * @returns OutcomeResult with outcome, confidence, and explanation
 */
export function resolveOutcome(
  market: string,
  selection: string,
  result: MatchResult
): OutcomeResult {
  const marketType = detectMarketType(market);

  switch (marketType) {
    case "match_odds":
      return resolveMatchOddsOutcome(selection, result);

    case "over_under":
      return resolveOverUnderOutcome(selection, result);

    case "btts":
      return resolveBttsOutcome(selection, result);

    case "correct_score":
      return resolveCorrectScoreOutcome(selection, result);

    case "double_chance":
      return resolveDoubleChanceOutcome(selection, result);

    default:
      // Try to infer from selection patterns
      if (parseGoalLine(selection).type !== null) {
        return resolveOverUnderOutcome(selection, result);
      }
      if (/\d+\s*[-:]\s*\d+/.test(selection)) {
        return resolveCorrectScoreOutcome(selection, result);
      }
      return {
        outcome: "unknown",
        confidence: "low",
        reason: `Unknown market type "${market}" with selection "${selection}"`,
        detectedMarket: "unknown",
      };
  }
}

/**
 * Calculate profit/loss for a bet based on outcome
 *
 * @param outcome - The bet outcome (win/loss/push)
 * @param stake - The stake amount
 * @param odds - The decimal odds
 * @param isFreeBet - Whether this is a free bet (stake not returned on win)
 * @returns The profit/loss amount
 */
export function calculateProfitLoss(
  outcome: BetOutcome,
  stake: number,
  odds: number,
  isFreeBet = false
): number {
  switch (outcome) {
    case "win":
      if (isFreeBet) {
        // Free bet: profit = stake * (odds - 1), no stake return
        return stake * (odds - 1);
      }
      // Normal bet: profit = stake * (odds - 1)
      return stake * (odds - 1);

    case "loss":
      if (isFreeBet) {
        // Free bet lost: no loss (free bet value was not real money)
        return 0;
      }
      // Normal bet: lose the stake
      return -stake;

    case "push":
      // Stake returned, no profit/loss
      return 0;

    default:
      // Unknown outcome - cannot calculate
      return 0;
  }
}

/**
 * Calculate lay bet profit/loss based on outcome
 *
 * @param outcome - The bet outcome from back bet perspective
 * @param layStake - The lay stake amount
 * @param layOdds - The decimal lay odds
 * @returns The profit/loss amount for the layer
 */
export function calculateLayProfitLoss(
  outcome: BetOutcome,
  layStake: number,
  layOdds: number
): number {
  // Lay liability = layStake * (layOdds - 1)
  const liability = layStake * (layOdds - 1);

  switch (outcome) {
    case "win":
      // Selection won: layer loses liability
      return -liability;

    case "loss":
      // Selection lost: layer wins the lay stake
      return layStake;

    case "push":
      // Push: no profit/loss
      return 0;

    default:
      // Unknown outcome - cannot calculate
      return 0;
  }
}

/**
 * Calculate matched bet net profit/loss
 *
 * @param outcome - The bet outcome
 * @param backStake - The back bet stake
 * @param backOdds - The back bet decimal odds
 * @param layStake - The lay bet stake
 * @param layOdds - The lay bet decimal odds
 * @param isFreeBet - Whether the back bet is a free bet
 * @returns The net profit/loss from both legs
 */
export function calculateMatchedBetProfitLoss(
  outcome: BetOutcome,
  backStake: number,
  backOdds: number,
  layStake: number,
  layOdds: number,
  isFreeBet = false
): { backProfitLoss: number; layProfitLoss: number; netProfitLoss: number } {
  const backProfitLoss = calculateProfitLoss(outcome, backStake, backOdds, isFreeBet);
  const layProfitLoss = calculateLayProfitLoss(outcome, layStake, layOdds);

  return {
    backProfitLoss,
    layProfitLoss,
    netProfitLoss: backProfitLoss + layProfitLoss,
  };
}
