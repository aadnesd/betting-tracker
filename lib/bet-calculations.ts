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

export function computeMatchedNetExposure({
  backStake,
  backProfit,
  layStake,
  layLiability,
  isFreeBet = false,
  freeBetStakeReturned = false,
  commissionRate = 0,
}: {
  /** Back stake, already converted to the reporting currency. */
  backStake: number;
  /** Back profit if the selection wins, already converted to the reporting currency. */
  backProfit: number;
  /** Lay stake, already converted to the reporting currency. */
  layStake: number;
  /** Lay liability if the selection wins, already converted to the reporting currency. */
  layLiability: number;
  isFreeBet?: boolean;
  freeBetStakeReturned?: boolean;
  /** Exchange commission rate as a decimal (e.g. 0.025 for 2.5%). Defaults to 0. */
  commissionRate?: number;
}) {
  const safeCommissionRate = Math.min(Math.max(commissionRate, 0), 1);

  const profitIfBackWins =
    isFreeBet && freeBetStakeReturned
      ? backProfit + backStake - layLiability
      : backProfit - layLiability;

  const layWinNet = layStake * (1 - safeCommissionRate);
  const profitIfLayWins = isFreeBet ? layWinNet : layWinNet - backStake;
  const netExposure = Math.min(profitIfBackWins, profitIfLayWins);

  return {
    profitIfBackWins,
    profitIfLayWins,
    netExposure,
  };
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
 * For a FREE BET (stake returned):
 * - If selection wins: (backProfit + backStake) - layLiability
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
  freeBetStakeReturned = false,
  layLiabilityProvided,
  commissionRate = 0,
}: {
  backStake: number;
  backOdds: number;
  layStake: number;
  layOdds: number;
  isFreeBet?: boolean;
  freeBetStakeReturned?: boolean;
  layLiabilityProvided?: number | null;
  /** Exchange commission rate as a decimal (e.g. 0.025 for 2.5%). Defaults to 0. */
  commissionRate?: number;
}) {
  const backProfit = backStake * (backOdds - 1);
  const layLiability =
    layLiabilityProvided != null && layLiabilityProvided > 0
      ? layLiabilityProvided
      : layStake * (layOdds - 1);

  // Profit if selection wins: back bet wins, lay bet loses
  const profitIfWins =
    isFreeBet && freeBetStakeReturned
      ? backProfit + backStake - layLiability
      : backProfit - layLiability;

  // Profit if selection loses: back bet loses, lay bet wins
  // Exchange takes commission on lay winnings
  const layWinNet = layStake * (1 - commissionRate);
  // For free bets, we don't lose the stake
  const profitIfLoses = isFreeBet
    ? layWinNet // Only the lay win (no stake lost)
    : layWinNet - backStake; // Lay win minus back stake lost

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
