import { NextResponse } from "next/server";
import {
  activateFreeBetWageringOnWin,
  applyAutoSettlement,
  type BetReadyForSettlement,
  findBetsReadyForAutoSettlement,
  flagBetForReview,
  getFreeBetByMatchedBetId,
  processFreeBetWageringProgressOnSettle,
  processWageringProgressOnSettle,
} from "@/lib/db/queries";
import {
  type BetOutcome,
  calculateMatchedBetProfitLoss,
  isFreeBetPromoType,
  resolveOutcome,
  resolveOutcomeWithNormalizedSelection,
} from "@/lib/settlement";

/**
 * Auto-settle cron endpoint.
 *
 * Processes matched bets linked to finished football matches:
 * 1. Queries all bets ready for auto-settlement
 * 2. Resolves outcome based on market, selection, and match result
 * 3. High confidence outcomes → auto-settle with P&L calculation
 * 4. Low/unknown confidence → flag for manual review
 *
 * Protected by CRON_SECRET header (Vercel cron authentication).
 *
 * Schedule: Runs after sync-matches (6:30 UTC daily via vercel.json)
 */

type AutoSettleResult = {
  processed: number;
  settled: number;
  flaggedForReview: number;
  errors: number;
  details: Array<{
    matchedBetId: string;
    action: "settled" | "flagged" | "error";
    outcome?: BetOutcome;
    reason?: string;
  }>;
};

/**
 * Process a single bet for auto-settlement.
 */
async function processBet(
  bet: BetReadyForSettlement
): Promise<AutoSettleResult["details"][0]> {
  const { homeScore, awayScore, homeTeam, awayTeam } = bet.footballMatch;
  const matchResult = `${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`;

  // Use normalized selection if available (more reliable for Match Odds bets)
  // Otherwise fall back to text-based selection parsing
  const outcomeResult = bet.normalizedSelection
    ? resolveOutcomeWithNormalizedSelection(bet.normalizedSelection, {
        homeScore,
        awayScore,
      })
    : resolveOutcome(bet.market, bet.selection, {
        homeScore,
        awayScore,
      });

  // If confidence is low or outcome is unknown, flag for review
  if (
    outcomeResult.confidence === "low" ||
    outcomeResult.outcome === "unknown"
  ) {
    await flagBetForReview({
      matchedBetId: bet.id,
      userId: bet.userId,
      reason: outcomeResult.reason,
    });

    return {
      matchedBetId: bet.id,
      action: "flagged",
      outcome: outcomeResult.outcome,
      reason: outcomeResult.reason,
    };
  }

  // Calculate P&L for high/medium confidence outcomes
  const backOdds = bet.backOdds ? Number.parseFloat(bet.backOdds) : 0;
  const backStake = bet.backStake ? Number.parseFloat(bet.backStake) : 0;
  const layOdds = bet.layOdds ? Number.parseFloat(bet.layOdds) : 0;
  const layStake = bet.layStake ? Number.parseFloat(bet.layStake) : 0;
  // Exchange commission (e.g., 0.05 for 5%) - defaults to 0 if not set
  const exchangeCommission = bet.layAccountCommission ?? 0;

  const matchedFreeBet = await getFreeBetByMatchedBetId({
    matchedBetId: bet.id,
    userId: bet.userId,
  });
  const freeBet = matchedFreeBet ? true : isFreeBetPromoType(bet.promoType);
  const freeBetStakeReturned = matchedFreeBet?.stakeReturned ?? false;
  const { backProfitLoss, layProfitLoss } = calculateMatchedBetProfitLoss(
    outcomeResult.outcome,
    backStake,
    backOdds,
    layStake,
    layOdds,
    freeBet,
    freeBetStakeReturned,
    exchangeCommission
  );

  // Apply the settlement
  await applyAutoSettlement({
    matchedBetId: bet.id,
    userId: bet.userId,
    outcome: outcomeResult.outcome,
    backProfitLoss,
    layProfitLoss,
    backBetId: bet.backBetId,
    layBetId: bet.layBetId,
    backAccountId: bet.backAccountId,
    layAccountId: bet.layAccountId,
    backCurrency: null, // Currency is stored on bet, will default to NOK
    layCurrency: null,
    market: bet.market,
    selection: bet.selection,
    matchResult,
  });

  // Process deposit bonus wagering progress for back bets
  // Only back bets count towards wagering (not lay bets on exchanges)
  if (bet.backAccountId && bet.backBetPlacedAt) {
    await processWageringProgressOnSettle({
      accountId: bet.backAccountId,
      userId: bet.userId,
      backBetId: bet.backBetId,
      matchedBetId: bet.id,
      stake: backStake,
      odds: backOdds,
      placedAt: bet.backBetPlacedAt,
    });

    await processFreeBetWageringProgressOnSettle({
      accountId: bet.backAccountId,
      userId: bet.userId,
      backBetId: bet.backBetId,
      matchedBetId: bet.id,
      stake: backStake,
      odds: backOdds,
      placedAt: bet.backBetPlacedAt,
    });
  }

  if (matchedFreeBet && outcomeResult.outcome === "win") {
    const winAmount = freeBetStakeReturned
      ? backStake * backOdds
      : backStake * (backOdds - 1);
    await activateFreeBetWageringOnWin({
      freeBetId: matchedFreeBet.id,
      userId: bet.userId,
      winAmount,
    });
  }

  return {
    matchedBetId: bet.id,
    action: "settled",
    outcome: outcomeResult.outcome,
    reason: outcomeResult.reason,
  };
}

export async function POST(request: Request) {
  // Validate CRON_SECRET for Vercel cron authentication
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn("[Auto-Settle] Unauthorized cron request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Auto-Settle] Starting auto-settlement run...");

  const result: AutoSettleResult = {
    processed: 0,
    settled: 0,
    flaggedForReview: 0,
    errors: 0,
    details: [],
  };

  try {
    // Fetch all bets ready for auto-settlement
    const bets = await findBetsReadyForAutoSettlement({ limit: 100 });

    console.log(`[Auto-Settle] Found ${bets.length} bets ready for settlement`);

    if (bets.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No bets ready for auto-settlement",
        results: result,
      });
    }

    // Process each bet
    for (const bet of bets) {
      result.processed++;

      try {
        const detail = await processBet(bet);
        result.details.push(detail);

        if (detail.action === "settled") {
          result.settled++;
          console.log(
            `[Auto-Settle] Settled bet ${bet.id}: ${detail.outcome} - ${detail.reason}`
          );
        } else if (detail.action === "flagged") {
          result.flaggedForReview++;
          console.log(
            `[Auto-Settle] Flagged bet ${bet.id} for review: ${detail.reason}`
          );
        }
      } catch (error) {
        result.errors++;
        result.details.push({
          matchedBetId: bet.id,
          action: "error",
          reason: error instanceof Error ? error.message : "Unknown error",
        });
        console.error(`[Auto-Settle] Error processing bet ${bet.id}:`, error);
      }
    }

    console.log(
      `[Auto-Settle] Complete. Processed: ${result.processed}, Settled: ${result.settled}, Flagged: ${result.flaggedForReview}, Errors: ${result.errors}`
    );

    return NextResponse.json({
      success: true,
      message: "Auto-settlement completed",
      results: result,
    });
  } catch (error) {
    console.error("[Auto-Settle] Fatal error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Auto-settlement failed",
        error: error instanceof Error ? error.message : "Unknown error",
        results: result,
      },
      { status: 500 }
    );
  }
}

// Also support GET for manual testing (still requires auth)
export function GET(request: Request) {
  return POST(request);
}
