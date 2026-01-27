export function computeNetExposureInputs({
  backStake,
  backOdds,
  layStake,
  layOdds,
  layLiabilityProvided,
}: {
  backStake: number;
  backOdds: number;
  layStake: number;
  layOdds: number;
  /** If liability was captured from an exchange screenshot, use it directly. */
  layLiabilityProvided?: number | null;
}) {
  const backProfit = backStake * (backOdds - 1);
  const layLiability =
    layLiabilityProvided != null && layLiabilityProvided > 0
      ? layLiabilityProvided
      : layStake * (layOdds - 1);
  return { backProfit, layLiability };
}

/**
 * Calculate profit for both outcomes of a matched bet.
 *
 * For a NORMAL bet:
 * - If selection wins: backProfit - layLiability
 * - If selection loses: -backStake + layStake (qualifying loss)
 *
 * For a FREE BET (stake not returned):
 * - If selection wins: backProfit - layLiability
 * - If selection loses: 0 + layStake (no stake lost!)
 *
 * All values should be in the same currency for comparison.
 */
export function computeMatchedBetOutcomes({
  backStake,
  backOdds,
  layStake,
  layOdds,
  isFreeBet = false,
  layLiabilityProvided,
}: {
  backStake: number;
  backOdds: number;
  layStake: number;
  layOdds: number;
  isFreeBet?: boolean;
  layLiabilityProvided?: number | null;
}) {
  const backProfit = backStake * (backOdds - 1);
  const layLiability =
    layLiabilityProvided != null && layLiabilityProvided > 0
      ? layLiabilityProvided
      : layStake * (layOdds - 1);

  // Profit if selection wins: back bet wins, lay bet loses
  const profitIfWins = backProfit - layLiability;

  // Profit if selection loses: back bet loses, lay bet wins
  // For free bets, we don't lose the stake
  const profitIfLoses = isFreeBet
    ? layStake // Only the lay win (no stake lost)
    : layStake - backStake; // Lay win minus back stake lost

  // Guaranteed profit is the minimum of the two outcomes
  const guaranteedProfit = Math.min(profitIfWins, profitIfLoses);

  return {
    backProfit,
    layLiability,
    profitIfWins,
    profitIfLoses,
    guaranteedProfit,
    isFreeBet,
  };
}
