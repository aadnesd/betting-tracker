import { NextResponse } from "next/server";
import {
  applyAutoSettlement,
  findBetsReadyForAutoSettlement,
  flagBetForReview,
  type BetReadyForSettlement,
} from "@/lib/db/queries";
import {
  calculateMatchedBetProfitLoss,
  resolveOutcome,
  type BetOutcome,
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

interface AutoSettleResult {
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
}

/**
 * Check if promo type indicates a free bet.
 * Free bets don't return stake on win, affecting P&L calculation.
 */
function isFreeBet(promoType: string | null): boolean {
  if (!promoType) return false;
  const normalized = promoType.toLowerCase();
  return normalized.includes("free bet") || normalized.includes("freebet");
}

/**
 * Process a single bet for auto-settlement.
 */
async function processBet(
  bet: BetReadyForSettlement
): Promise<AutoSettleResult["details"][0]> {
  const { homeScore, awayScore, homeTeam, awayTeam } = bet.footballMatch;
  const matchResult = `${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`;

  // Resolve the outcome using settlement logic
  const outcomeResult = resolveOutcome(bet.market, bet.selection, {
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

  const freeBet = isFreeBet(bet.promoType);
  const { backProfitLoss, layProfitLoss } = calculateMatchedBetProfitLoss(
    outcomeResult.outcome,
    backStake,
    backOdds,
    layStake,
    layOdds,
    freeBet
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
export async function GET(request: Request) {
  return POST(request);
}
