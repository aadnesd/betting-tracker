/**
 * Reporting helper functions for matched betting profit/loss calculations.
 *
 * Key concepts:
 * - Qualifying Loss: The small guaranteed loss from a qualifying bet (used to unlock free bets)
 * - Net Profit: Total profit minus qualifying losses
 * - ROI: Return on Investment as a percentage of total stake
 * - All monetary values are converted to base currency (NOK) before aggregation
 */

import type { BackBet, LayBet, MatchedBet } from "@/lib/db/schema";

export type MatchedBetWithLegs = {
  matched: MatchedBet;
  back: BackBet | null;
  lay: LayBet | null;
};

export type ReportingSummary = {
  /** Total profit from all settled bets (sum of profitLoss) */
  totalProfit: number;
  /** Total qualifying loss (negative profit on qualifying bets) */
  qualifyingLoss: number;
  /** Net profit (betting profit + bonuses) */
  netProfit: number;
  /** Total stake wagered */
  totalStake: number;
  /** ROI percentage (netProfit / totalStake * 100) */
  roi: number;
  /** Number of settled bets */
  settledCount: number;
  /** Total net exposure on open positions */
  openExposure: number;
  /** Total bonus/reward transactions (optional, 0 if not provided) */
  bonusTotal: number;
  /** Betting profit/loss only (before bonuses) - same as totalProfit */
  bettingProfit: number;
};

export type BookmakerSummary = {
  accountId: string | null;
  accountName: string;
  count: number;
  totalProfitLoss: number;
  totalStake: number;
  roi: number;
};

export type PromoTypeSummary = {
  promoType: string;
  count: number;
  totalProfitLoss: number;
  totalStake: number;
  roi: number;
};

function resolveNokValue({
  nokValue,
  rawValue,
  currency,
}: {
  nokValue?: string | null;
  rawValue?: string | null;
  currency?: string | null;
}): number {
  if (nokValue !== undefined && nokValue !== null) {
    return Number.parseFloat(nokValue);
  }
  const normalizedCurrency = currency ?? "NOK";
  if (normalizedCurrency === "NOK" && rawValue) {
    return Number.parseFloat(rawValue);
  }
  return 0;
}

/**
 * Calculate the qualifying loss for a matched bet.
 * Qualifying bets are typically promos like "free_bet" or "sign_up" that
 * result in a small loss to unlock a free bet.
 */
export function calculateQualifyingLoss(bet: MatchedBetWithLegs): number {
  // Qualifying loss occurs when back/lay bets result in a net loss
  // that's intentional to unlock a free bet or bonus
  const backPL = bet.back?.profitLoss ? Number.parseFloat(bet.back.profitLoss) : 0;
  const layPL = bet.lay?.profitLoss ? Number.parseFloat(bet.lay.profitLoss) : 0;
  const totalPL = backPL + layPL;

  // Qualifying loss is only the negative portion of qualifying bets
  // (promos that are designed to lose a small amount)
  const isQualifyingPromo =
    bet.matched.promoType?.toLowerCase().includes("qualifying") ||
    bet.matched.promoType?.toLowerCase().includes("sign_up") ||
    bet.matched.promoType?.toLowerCase().includes("signup");

  if (isQualifyingPromo && totalPL < 0) {
    return Math.abs(totalPL);
  }

  return 0;
}

/**
 * Calculate reporting summary from an array of matched bets with their legs.
 * All amounts are converted to NOK (base currency) before aggregation.
 * @param bets - Array of matched bets with back/lay legs
 * @param openExposure - Total open exposure from non-settled bets (optional, defaults to 0)
 * @param bonusTotal - Total bonus/reward transactions in NOK (optional, defaults to 0)
 */
export async function calculateReportingSummary(
  bets: MatchedBetWithLegs[],
  openExposure = 0,
  bonusTotal = 0
): Promise<ReportingSummary> {
  let totalProfit = 0;
  let qualifyingLoss = 0;
  let totalStake = 0;
  let settledCount = 0;

  for (const bet of bets) {
    if (bet.matched.status !== "settled") {
      continue;
    }

    settledCount++;

    // Sum profit/loss from both legs using stored NOK values
    const backPLNok = resolveNokValue({
      nokValue: bet.back?.profitLossNok,
      rawValue: bet.back?.profitLoss,
      currency: bet.back?.currency,
    });
    const layPLNok = resolveNokValue({
      nokValue: bet.lay?.profitLossNok,
      rawValue: bet.lay?.profitLoss,
      currency: bet.lay?.currency,
    });
    totalProfit += backPLNok + layPLNok;

    // Sum stakes from both legs using stored NOK values
    const backStakeNok = resolveNokValue({
      nokValue: bet.back?.stakeNok,
      rawValue: bet.back?.stake,
      currency: bet.back?.currency,
    });
    const layStakeNok = resolveNokValue({
      nokValue: bet.lay?.stakeNok,
      rawValue: bet.lay?.stake,
      currency: bet.lay?.currency,
    });
    totalStake += backStakeNok + layStakeNok;

    // Calculate qualifying loss for this bet (in NOK)
    qualifyingLoss += await calculateQualifyingLossInNok(bet);
  }

  // Betting profit is the raw profit from bets only
  const bettingProfit = totalProfit;

  // Net profit includes bonuses: betting profit + bonus transactions
  const netProfit = totalProfit + bonusTotal;

  // ROI = net profit / total stake * 100
  const roi = totalStake > 0 ? (netProfit / totalStake) * 100 : 0;

  return {
    totalProfit,
    qualifyingLoss,
    netProfit,
    totalStake,
    roi,
    settledCount,
    openExposure,
    bonusTotal,
    bettingProfit,
  };
}

/**
 * Calculate qualifying loss for a matched bet, converted to NOK.
 */
async function calculateQualifyingLossInNok(bet: MatchedBetWithLegs): Promise<number> {
  const promoType = bet.matched.promoType;
  const isQualifyingPromo = promoType === "Qualifying Bet" || promoType === "Sign-up Offer";

  if (!isQualifyingPromo) {
    return 0;
  }

  // Calculate P/L from both legs in NOK using stored values
  const backPLNok = resolveNokValue({
    nokValue: bet.back?.profitLossNok,
    rawValue: bet.back?.profitLoss,
    currency: bet.back?.currency,
  });
  const layPLNok = resolveNokValue({
    nokValue: bet.lay?.profitLossNok,
    rawValue: bet.lay?.profitLoss,
    currency: bet.lay?.currency,
  });
  const totalPL = backPLNok + layPLNok;

  // For qualifying bets with a loss, record the absolute value as qualifying loss
  if (totalPL < 0) {
    return Math.abs(totalPL);
  }

  return 0;
}

/**
 * Calculate ROI percentage from profit and stake.
 */
export function calculateROI(profit: number, stake: number): number {
  if (stake <= 0) return 0;
  return (profit / stake) * 100;
}

/**
 * Add ROI calculation to bookmaker/exchange/promo summaries.
 */
export function enrichWithROI<T extends { totalProfitLoss: number; totalStake: number }>(
  items: T[]
): (T & { roi: number })[] {
  return items.map((item) => ({
    ...item,
    roi: calculateROI(item.totalProfitLoss, item.totalStake),
  }));
}

/**
 * Format a number as NOK currency.
 */
export function formatNOK(amount: number): string {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Crypto currencies that need special formatting (more decimal places).
 */
const CRYPTO_CURRENCIES = new Set([
  "BTC",
  "ETH",
  "BNB",
  "XRP",
  "SOL",
  "DOT",
  "AVAX",
  "MATIC",
  "LTC",
  "ADA",
  "USDT",
  "USDC",
  "DAI",
  "BUSD",
  "ARB",
  "OP",
]);

/**
 * Format a number in its native currency.
 * For crypto: uses more decimal places and symbol prefix.
 * For fiat: uses locale-appropriate formatting.
 */
export function formatCurrency(amount: number, currency: string): string {
  const curr = currency.toUpperCase();

  // Crypto formatting with appropriate decimals
  if (CRYPTO_CURRENCIES.has(curr)) {
    // Stablecoins use 2 decimals, others use up to 8
    const isStablecoin = ["USDT", "USDC", "DAI", "BUSD"].includes(curr);
    const decimals = isStablecoin ? 2 : amount < 1 ? 8 : 4;
    const formatted = amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals,
    });
    return `${formatted} ${curr}`;
  }

  // Fiat formatting
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: curr,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback for unknown currencies
    return `${amount.toFixed(2)} ${curr}`;
  }
}

/**
 * Format a percentage with sign.
 */
export function formatPercentage(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Get date range for common reporting periods.
 */
export function getDateRange(
  period: "week" | "month" | "quarter" | "year" | "all"
): { startDate: Date | null; endDate: Date } {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  if (period === "all") {
    return { startDate: null, endDate };
  }

  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);

  switch (period) {
    case "week":
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "month":
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case "quarter":
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case "year":
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
  }

  return { startDate, endDate };
}

/**
 * Group matched bets by week for trend analysis.
 */
export function groupByWeek(bets: MatchedBetWithLegs[]): Map<string, MatchedBetWithLegs[]> {
  const groups = new Map<string, MatchedBetWithLegs[]>();

  for (const bet of bets) {
    const date = new Date(bet.matched.createdAt);
    // Get the Monday of the week
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    const weekKey = monday.toISOString().split("T")[0];

    const existing = groups.get(weekKey) ?? [];
    existing.push(bet);
    groups.set(weekKey, existing);
  }

  return groups;
}

/**
 * Group matched bets by month for trend analysis.
 */
export function groupByMonth(bets: MatchedBetWithLegs[]): Map<string, MatchedBetWithLegs[]> {
  const groups = new Map<string, MatchedBetWithLegs[]>();

  for (const bet of bets) {
    const date = new Date(bet.matched.createdAt);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const existing = groups.get(monthKey) ?? [];
    existing.push(bet);
    groups.set(monthKey, existing);
  }

  return groups;
}

/**
 * Data point for profit chart visualization.
 */
export type ProfitDataPoint = {
  /** Date string for the x-axis (ISO format date) */
  date: string;
  /** Display label for the date */
  label: string;
  /** Profit/loss for this period */
  profit: number;
  /** Cumulative profit up to and including this period */
  cumulative: number;
  /** Number of bets settled in this period */
  count: number;
};

/**
 * Data point for total balance chart visualization.
 */
export type BalanceDataPoint = {
  /** Date string for the x-axis (ISO format date) */
  date: string;
  /** Display label for the date */
  label: string;
  /** Net balance change for this period */
  net: number;
  /** Cumulative balance up to and including this period */
  cumulative: number;
};

/**
 * Calculate cumulative profit data points for chart visualization.
 * Returns data points sorted chronologically with cumulative profit.
 * All profits are normalized to NOK for consistent aggregation.
 */
export async function calculateCumulativeProfitData(
  bets: MatchedBetWithLegs[],
  grouping: "day" | "week" | "month" = "day"
): Promise<ProfitDataPoint[]> {
  // Filter to only settled bets and sort by settled date
  const settledBets = bets
    .filter((bet) => bet.matched.status === "settled")
    .sort((a, b) => {
      // Use the back bet's settledAt, or fall back to matched createdAt
      const dateA = a.back?.settledAt ?? a.matched.createdAt;
      const dateB = b.back?.settledAt ?? b.matched.createdAt;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

  if (settledBets.length === 0) {
    return [];
  }

  // Group bets by the specified period
  const groups = new Map<string, { profit: number; count: number }>();

  for (const bet of settledBets) {
    // Use back bet's settledAt, or matched createdAt as fallback
    const date = new Date(bet.back?.settledAt ?? bet.matched.createdAt);
    let key: string;
    let label: string;

    switch (grouping) {
      case "week": {
        // Get the Monday of the week
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date);
        monday.setDate(diff);
        key = monday.toISOString().split("T")[0];
        label = `Week of ${monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
        break;
      }
      case "month": {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
        label = date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
        break;
      }
      default: {
        // day
        key = date.toISOString().split("T")[0];
        label = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      }
    }

    // Calculate profit for this bet using stored NOK values
    const backPLNok = resolveNokValue({
      nokValue: bet.back?.profitLossNok,
      rawValue: bet.back?.profitLoss,
      currency: bet.back?.currency,
    });
    const layPLNok = resolveNokValue({
      nokValue: bet.lay?.profitLossNok,
      rawValue: bet.lay?.profitLoss,
      currency: bet.lay?.currency,
    });
    const betProfit = backPLNok + layPLNok;

    const existing = groups.get(key) ?? { profit: 0, count: 0 };
    existing.profit += betProfit;
    existing.count += 1;
    groups.set(key, existing);
  }

  // Convert to sorted array with cumulative values
  const sortedKeys = Array.from(groups.keys()).sort();
  let cumulative = 0;
  const dataPoints: ProfitDataPoint[] = [];

  for (const key of sortedKeys) {
    const data = groups.get(key)!;
    cumulative += data.profit;

    // Generate label based on grouping
    const date = new Date(key);
    let label: string;
    switch (grouping) {
      case "week":
        label = `Week of ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
        break;
      case "month":
        label = date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
        break;
      default:
        label = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    }

    dataPoints.push({
      date: key,
      label,
      profit: Math.round(data.profit * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
      count: data.count,
    });
  }

  return dataPoints;
}

/**
 * Calculate cumulative balance data points for chart visualization.
 * Balance data is derived from account transactions (already normalized to NOK).
 */
export function calculateCumulativeBalanceData(
  transactions: { date: string; label: string; net: number }[]
): BalanceDataPoint[] {
  if (transactions.length === 0) {
    return [];
  }

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  let cumulative = 0;

  return sorted.map((transaction) => {
    cumulative += transaction.net;
    return {
      date: transaction.date,
      label: transaction.label,
      net: Math.round(transaction.net * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
    };
  });
}

/**
 * Transform balance snapshots into chart data points.
 * Snapshots are direct capital values, not deltas - so cumulative = snapshot value.
 */
export function snapshotsToBalanceData(
  snapshots: Array<{
    createdAt: Date;
    totalCapitalNok: number;
  }>,
  grouping: "day" | "week" | "month" = "day"
): BalanceDataPoint[] {
  if (snapshots.length === 0) {
    return [];
  }

  // Group snapshots by the specified period and take the latest value per period
  const groups = new Map<string, { date: string; label: string; value: number }>();

  for (const snapshot of snapshots) {
    const date = snapshot.createdAt;
    let key: string;
    let label: string;

    switch (grouping) {
      case "week": {
        // Get the Monday of the week
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date);
        monday.setDate(diff);
        key = monday.toISOString().split("T")[0];
        label = `Week of ${monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
        break;
      }
      case "month": {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
        label = date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
        break;
      }
      case "day":
      default: {
        key = date.toISOString().split("T")[0];
        label = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        break;
      }
    }

    // Always overwrite with latest value for this period
    groups.set(key, { date: key, label, value: snapshot.totalCapitalNok });
  }

  // Sort by date and convert to data points
  const sorted = Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([_, point]) => point);

  // Since snapshots are already cumulative values, net = difference from previous
  let prevValue = sorted[0]?.value ?? 0;
  return sorted.map((point, i) => {
    const net = i === 0 ? 0 : point.value - prevValue;
    prevValue = point.value;
    return {
      date: point.date,
      label: point.label,
      net: Math.round(net * 100) / 100,
      cumulative: Math.round(point.value * 100) / 100,
    };
  });
}
