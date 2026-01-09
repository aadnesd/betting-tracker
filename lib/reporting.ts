/**
 * Reporting helper functions for matched betting profit/loss calculations.
 *
 * Key concepts:
 * - Qualifying Loss: The small guaranteed loss from a qualifying bet (used to unlock free bets)
 * - Net Profit: Total profit minus qualifying losses
 * - ROI: Return on Investment as a percentage of total stake
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
  /** Net profit (totalProfit - qualifyingLoss if already negative) */
  netProfit: number;
  /** Total stake wagered */
  totalStake: number;
  /** ROI percentage (netProfit / totalStake * 100) */
  roi: number;
  /** Number of settled bets */
  settledCount: number;
  /** Total net exposure on open positions */
  openExposure: number;
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
 */
export function calculateReportingSummary(
  bets: MatchedBetWithLegs[],
  openExposure = 0
): ReportingSummary {
  let totalProfit = 0;
  let qualifyingLoss = 0;
  let totalStake = 0;
  let settledCount = 0;

  for (const bet of bets) {
    if (bet.matched.status !== "settled") {
      continue;
    }

    settledCount++;

    // Sum profit/loss from both legs
    const backPL = bet.back?.profitLoss ? Number.parseFloat(bet.back.profitLoss) : 0;
    const layPL = bet.lay?.profitLoss ? Number.parseFloat(bet.lay.profitLoss) : 0;
    totalProfit += backPL + layPL;

    // Sum stakes from both legs
    const backStake = bet.back?.stake ? Number.parseFloat(bet.back.stake) : 0;
    const layStake = bet.lay?.stake ? Number.parseFloat(bet.lay.stake) : 0;
    totalStake += backStake + layStake;

    // Calculate qualifying loss for this bet
    qualifyingLoss += calculateQualifyingLoss(bet);
  }

  // Net profit is total profit (qualifying losses are already included as negative profit)
  const netProfit = totalProfit;

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
  };
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
