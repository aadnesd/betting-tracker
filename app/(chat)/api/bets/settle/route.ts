import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createAccountTransaction,
  createAuditEntry,
  getAccountById,
  getBackBetById,
  getLayBetById,
  getMatchedBetByLegId,
  updateMatchedBetRecord,
  updateBackBet,
  updateLayBet,
} from "@/lib/db/queries";
import {
  calculateProfitLoss,
  calculateLayProfitLoss,
  isFreeBetPromoType,
} from "@/lib/settlement";

const settleSchema = z.object({
  betId: z.string().uuid(),
  betKind: z.enum(["back", "lay"]),
  outcome: z.enum(["won", "lost", "push"]),
  notes: z.string().optional(),
});

/**
 * Calculate P&L for a bet based on outcome
 * 
 * @param commissionRate - For lay bets, the exchange commission rate as a decimal (e.g., 0.05 for 5%)
 */
function calculateBetProfitLoss(
  kind: "back" | "lay",
  outcome: "won" | "lost" | "push",
  stake: number,
  odds: number,
  isFreeBet = false,
  commissionRate = 0
): number {
  // Convert outcome to settlement outcome type
  const betOutcome = outcome === "won" ? "win" : outcome === "lost" ? "loss" : "push";

  if (kind === "back") {
    return calculateProfitLoss(betOutcome, stake, odds, isFreeBet);
  }
  // For lay bets, the outcome here is from the layer's perspective
  // (layer "won" = selection lost = backer lost)
  // But calculateLayProfitLoss expects outcome from back bet perspective
  // So we need to flip: layer won → back lost, layer lost → back won
  const layOutcomeFromBackPerspective =
    betOutcome === "win" ? "loss" : betOutcome === "loss" ? "win" : "push";
  return calculateLayProfitLoss(layOutcomeFromBackPerspective, stake, odds, commissionRate);
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof settleSchema>;
  try {
    const json = await request.json();
    body = settleSchema.parse(json);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    // Fetch the bet
    const bet =
      body.betKind === "back"
        ? await getBackBetById({ id: body.betId, userId: session.user.id })
        : await getLayBetById({ id: body.betId, userId: session.user.id });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    const matchedBet = await getMatchedBetByLegId({
      betId: body.betId,
      kind: body.betKind,
      userId: session.user.id,
    });

    // Check if already settled
    if (bet.status === "settled") {
      return NextResponse.json(
        { error: "Bet is already settled" },
        { status: 400 }
      );
    }

    // Determine if this bet is part of a free bet promo (affects back bet P&L)
    let isFreeBet = false;
    if (body.betKind === "back") {
      isFreeBet = isFreeBetPromoType(matchedBet?.promoType ?? null);
    }

    // For lay bets, get the exchange account's commission rate
    let commissionRate = 0;
    if (body.betKind === "lay" && bet.accountId) {
      const exchangeAccount = await getAccountById({
        id: bet.accountId,
        userId: session.user.id,
      });
      if (exchangeAccount?.commission) {
        commissionRate = Number.parseFloat(exchangeAccount.commission);
      }
    }

    // Calculate profit/loss
    const stake = Number(bet.stake);
    const odds = Number(bet.odds);
    const profitLoss = calculateBetProfitLoss(
      body.betKind,
      body.outcome,
      stake,
      odds,
      isFreeBet,
      commissionRate
    );

    const now = new Date();
    const currency = bet.currency ?? "NOK";

    // Update the bet
    const updateFn = body.betKind === "back" ? updateBackBet : updateLayBet;
    await updateFn({
      id: body.betId,
      userId: session.user.id,
      status: "settled",
      settledAt: now,
      profitLoss: profitLoss.toString(),
    });

    // Create account balance adjustment if account is linked
    if (bet.accountId) {
      await createAccountTransaction({
        userId: session.user.id,
        accountId: bet.accountId,
        type: "adjustment",
        amount: profitLoss,
        currency,
        occurredAt: now,
        notes: `Settlement: ${body.outcome} - ${bet.market} / ${bet.selection} @ ${odds}`,
      });
    }

    // Create audit entry
    await createAuditEntry({
      userId: session.user.id,
      entityType: body.betKind === "back" ? "back_bet" : "lay_bet",
      entityId: body.betId,
      action: "manual_settle",
      changes: {
        outcome: body.outcome,
        profitLoss,
        settledAt: now.toISOString(),
        previousStatus: bet.status,
      },
      notes:
        body.notes ??
        `Manual settlement: ${body.outcome}. P&L: ${profitLoss.toFixed(2)} ${currency}`,
    });

    if (matchedBet && matchedBet.status !== "settled") {
      const otherBetId =
        body.betKind === "back" ? matchedBet.layBetId : matchedBet.backBetId;

      if (otherBetId) {
        const otherBet =
          body.betKind === "back"
            ? await getLayBetById({ id: otherBetId, userId: session.user.id })
            : await getBackBetById({ id: otherBetId, userId: session.user.id });

        if (otherBet?.status === "settled") {
          await updateMatchedBetRecord({
            id: matchedBet.id,
            userId: session.user.id,
            status: "settled",
          });

          await createAuditEntry({
            userId: session.user.id,
            entityType: "matched_bet",
            entityId: matchedBet.id,
            action: "status_change",
            changes: {
              status: { from: matchedBet.status, to: "settled" },
            },
            notes: "Marked matched bet settled after both legs were manually settled.",
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      bet: {
        id: body.betId,
        kind: body.betKind,
        outcome: body.outcome,
        profitLoss,
        settledAt: now.toISOString(),
        currency,
      },
    });
  } catch (error) {
    console.error("Failed to settle bet", error);
    return NextResponse.json(
      { error: "Failed to settle bet" },
      { status: 500 }
    );
  }
}
