import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { computeNetExposureInputs } from "@/lib/bet-calculations";
import { revalidateDashboard } from "@/lib/cache";
import {
  createAccountTransaction,
  createAuditEntry,
  getAccountById,
  getBackBetById,
  getFootballMatchById,
  getFreeBetByMatchedBetId,
  getLayBetById,
  getMatchedBetByLegId,
  updateBackBet,
  updateBackBetDetails,
  updateLayBet,
  updateLayBetDetails,
  updateMatchedBetRecord,
} from "@/lib/db/queries";
import { convertAmountToNok } from "@/lib/fx-rates";
import {
  canUserEditSettledBets,
  deriveSettlementOutcomeFromProfitLoss,
} from "@/lib/settled-bet-edit";
import {
  calculateLayProfitLoss,
  calculateProfitLoss,
  isFreeBetPromoType,
} from "@/lib/settlement";

const updateSchema = z.object({
  betId: z.string().uuid(),
  betKind: z.enum(["back", "lay"]),
  market: z.string().min(1, "Market is required"),
  selection: z.string().min(1, "Selection is required"),
  odds: z.number().positive("Odds must be positive"),
  stake: z.number().positive("Stake must be positive"),
  accountId: z.string().uuid(),
  currency: z.string().length(3),
  matchId: z.string().uuid().optional().nullable(),
  placedAt: z.string().optional().nullable(),
  settlementOutcome: z.enum(["won", "lost", "push"]).optional().nullable(),
  notes: z.string().optional(),
});

function safeDate(value?: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function computeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>
) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  Object.keys(after).forEach((key) => {
    if (before[key] !== after[key]) {
      changes[key] = { from: before[key], to: after[key] };
    }
  });
  return Object.keys(changes).length > 0 ? changes : null;
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof updateSchema>;
  try {
    payload = updateSchema.parse(await request.json());
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
    const userId = session.user.id;
    const bet =
      payload.betKind === "back"
        ? await getBackBetById({ id: payload.betId, userId })
        : await getLayBetById({ id: payload.betId, userId });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    const isSettled = bet.status === "settled";
    const canEditSettled = canUserEditSettledBets({
      userId,
      email: session.user.email,
    });

    if (isSettled && !canEditSettled) {
      return NextResponse.json(
        {
          error:
            "Settled bets can only be edited by authorized users. Contact an administrator.",
        },
        { status: 403 }
      );
    }

    if (isSettled && !payload.notes?.trim()) {
      return NextResponse.json(
        { error: "Correction reason is required when editing a settled bet" },
        { status: 400 }
      );
    }

    const account = await getAccountById({
      id: payload.accountId,
      userId,
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const expectedKind = payload.betKind === "back" ? "bookmaker" : "exchange";
    if (account.kind !== expectedKind) {
      return NextResponse.json(
        { error: "Account type does not match bet kind" },
        { status: 400 }
      );
    }

    if (payload.matchId !== undefined && payload.matchId !== null) {
      const match = await getFootballMatchById({ id: payload.matchId });
      if (!match) {
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
      }
    }

    const beforeState = {
      market: bet.market,
      selection: bet.selection,
      odds: bet.odds,
      stake: bet.stake,
      matchId: bet.matchId ?? null,
      accountId: bet.accountId,
      currency: bet.currency,
      placedAt: bet.placedAt,
    };

    const matchIdForUpdate =
      payload.matchId === undefined ? (bet.matchId ?? null) : payload.matchId;

    if (isSettled) {
      const immutableFieldErrors: string[] = [];
      if (Number(bet.odds) !== payload.odds) {
        immutableFieldErrors.push("odds");
      }
      if (Number(bet.stake) !== payload.stake) {
        immutableFieldErrors.push("stake");
      }
      if ((bet.accountId ?? null) !== payload.accountId) {
        immutableFieldErrors.push("accountId");
      }
      if ((bet.currency ?? null) !== payload.currency) {
        immutableFieldErrors.push("currency");
      }

      if (immutableFieldErrors.length > 0) {
        return NextResponse.json(
          {
            error: `Cannot change ${immutableFieldErrors.join(", ")} on settled bets`,
          },
          { status: 400 }
        );
      }
    }

    const updated =
      payload.betKind === "back"
        ? await updateBackBetDetails({
            id: payload.betId,
            userId,
            market: payload.market,
            selection: payload.selection,
            odds: payload.odds,
            stake: payload.stake,
            exchange: account.name,
            matchId: matchIdForUpdate,
            accountId: account.id,
            currency: payload.currency,
            placedAt: safeDate(payload.placedAt),
          })
        : await updateLayBetDetails({
            id: payload.betId,
            userId,
            market: payload.market,
            selection: payload.selection,
            odds: payload.odds,
            stake: payload.stake,
            exchange: account.name,
            matchId: matchIdForUpdate,
            accountId: account.id,
            currency: payload.currency,
            placedAt: safeDate(payload.placedAt),
          });

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to update bet" },
        { status: 500 }
      );
    }

    const afterState = {
      market: updated.market,
      selection: updated.selection,
      odds: updated.odds,
      stake: updated.stake,
      matchId: updated.matchId ?? null,
      accountId: updated.accountId,
      currency: updated.currency,
      placedAt: updated.placedAt,
    };

    const changes = computeChanges(beforeState, afterState);

    let settlementCorrection: {
      fromOutcome: string | null;
      toOutcome: string;
      fromProfitLoss: number;
      toProfitLoss: number;
      deltaProfitLoss: number;
    } | null = null;

    if (isSettled && payload.settlementOutcome) {
      const oldProfitLoss = Number(bet.profitLoss ?? 0);
      const oldOutcome = deriveSettlementOutcomeFromProfitLoss({
        kind: payload.betKind,
        profitLoss: oldProfitLoss,
      });

      const matchedBet = await getMatchedBetByLegId({
        betId: updated.id,
        kind: payload.betKind,
        userId,
      });

      let isFreeBet = false;
      let freeBetStakeReturned = false;
      if (payload.betKind === "back") {
        const freeBet = matchedBet?.id
          ? await getFreeBetByMatchedBetId({
              matchedBetId: matchedBet.id,
              userId,
            })
          : null;

        freeBetStakeReturned = freeBet?.stakeReturned ?? false;
        isFreeBet = freeBet
          ? true
          : isFreeBetPromoType(matchedBet?.promoType ?? null);
      }

      let commissionRate = 0;
      if (payload.betKind === "lay" && updated.accountId) {
        const exchangeAccount = await getAccountById({
          id: updated.accountId,
          userId,
        });
        if (exchangeAccount?.commission) {
          commissionRate = Number.parseFloat(exchangeAccount.commission);
        }
      }

      const stake = Number(updated.stake);
      const odds = Number(updated.odds);
      const newProfitLoss =
        payload.betKind === "back"
          ? calculateProfitLoss(
              payload.settlementOutcome === "won"
                ? "win"
                : payload.settlementOutcome === "lost"
                  ? "loss"
                  : "push",
              stake,
              odds,
              isFreeBet,
              freeBetStakeReturned
            )
          : calculateLayProfitLoss(
              payload.settlementOutcome === "won"
                ? "loss"
                : payload.settlementOutcome === "lost"
                  ? "win"
                  : "push",
              stake,
              odds,
              commissionRate
            );

      const deltaProfitLoss = Number(
        (newProfitLoss - oldProfitLoss).toFixed(2)
      );

      if (deltaProfitLoss !== 0 || oldOutcome !== payload.settlementOutcome) {
        const currency = updated.currency ?? "NOK";
        const profitLossNok = await convertAmountToNok(newProfitLoss, currency);

        if (payload.betKind === "back") {
          await updateBackBet({
            id: updated.id,
            userId,
            profitLoss: newProfitLoss.toFixed(2),
            profitLossNok: profitLossNok.toFixed(2),
          });
        } else {
          await updateLayBet({
            id: updated.id,
            userId,
            profitLoss: newProfitLoss.toFixed(2),
            profitLossNok: profitLossNok.toFixed(2),
          });
        }

        if (deltaProfitLoss !== 0 && updated.accountId) {
          await createAccountTransaction({
            userId,
            accountId: updated.accountId,
            type: "adjustment",
            amount: deltaProfitLoss,
            currency,
            occurredAt: new Date(),
            notes: `Settlement correction delta: ${payload.settlementOutcome} - ${updated.market} / ${updated.selection} @ ${odds}`,
            linkedBackBetId: payload.betKind === "back" ? updated.id : null,
            linkedLayBetId: payload.betKind === "lay" ? updated.id : null,
          });
        }
      }

      settlementCorrection = {
        fromOutcome: oldOutcome,
        toOutcome: payload.settlementOutcome,
        fromProfitLoss: oldProfitLoss,
        toProfitLoss: newProfitLoss,
        deltaProfitLoss,
      };
    }

    await createAuditEntry({
      userId,
      entityType: payload.betKind === "back" ? "back_bet" : "lay_bet",
      entityId: updated.id,
      action: "update",
      changes:
        settlementCorrection || isSettled
          ? {
              ...(changes ?? {}),
              settledBetEdit: isSettled,
              ...(settlementCorrection ? { settlementCorrection } : {}),
            }
          : changes,
      notes: isSettled
        ? `[Settled Bet Correction] ${payload.notes?.trim()}`
        : payload.notes
          ? `[Edit Bet] ${payload.notes}`
          : "Updated bet details",
    });

    const matchedBet = await getMatchedBetByLegId({
      betId: updated.id,
      kind: payload.betKind,
      userId,
    });

    if (matchedBet) {
      if (payload.matchId !== undefined) {
        const nextMatchId = payload.matchId ?? null;
        if (matchedBet.matchId !== nextMatchId) {
          await updateMatchedBetRecord({
            id: matchedBet.id,
            userId,
            matchId: nextMatchId,
          });

          await createAuditEntry({
            userId,
            entityType: "matched_bet",
            entityId: matchedBet.id,
            action: "update",
            changes: {
              matchId: { from: matchedBet.matchId ?? null, to: nextMatchId },
              reason: "leg_match_update",
            },
            notes: "Updated match link from individual bet edit",
          });
        }
      }

      const back =
        payload.betKind === "back"
          ? updated
          : matchedBet.backBetId
            ? await getBackBetById({ id: matchedBet.backBetId, userId })
            : null;
      const lay =
        payload.betKind === "lay"
          ? updated
          : matchedBet.layBetId
            ? await getLayBetById({ id: matchedBet.layBetId, userId })
            : null;

      let nextNetExposure: number | null = null;

      if (back && lay) {
        const { backProfit, layLiability } = computeNetExposureInputs({
          backStake: Number(back.stake),
          backOdds: Number(back.odds),
          layStake: Number(lay.stake),
          layOdds: Number(lay.odds),
        });

        const [backProfitNok, layLiabilityNok] = await Promise.all([
          convertAmountToNok(backProfit, back.currency ?? "NOK"),
          convertAmountToNok(layLiability, lay.currency ?? "NOK"),
        ]);

        nextNetExposure = Number((backProfitNok - layLiabilityNok).toFixed(2));
      }

      const currentExposure =
        matchedBet.netExposure === null
          ? null
          : Number.parseFloat(matchedBet.netExposure);

      if (
        (currentExposure === null && nextNetExposure !== null) ||
        (currentExposure !== null && nextNetExposure === null) ||
        (currentExposure !== null &&
          nextNetExposure !== null &&
          currentExposure !== nextNetExposure)
      ) {
        await updateMatchedBetRecord({
          id: matchedBet.id,
          userId,
          netExposure: nextNetExposure,
        });

        await createAuditEntry({
          userId,
          entityType: "matched_bet",
          entityId: matchedBet.id,
          action: "update",
          changes: {
            netExposure: { from: currentExposure, to: nextNetExposure },
            reason: "leg_update",
          },
          notes: "Updated net exposure after bet edit",
        });
      }
    }

    revalidateDashboard(userId);

    return NextResponse.json({
      success: true,
      bet: {
        id: updated.id,
        kind: payload.betKind,
        market: updated.market,
        selection: updated.selection,
        odds: Number(updated.odds),
        stake: Number(updated.stake),
        status: updated.status,
        currency: updated.currency,
        placedAt: updated.placedAt,
        accountId: updated.accountId,
        settlementCorrection,
      },
    });
  } catch (error) {
    console.error("Failed to update bet", error);
    return NextResponse.json(
      { error: "Failed to update bet" },
      { status: 500 }
    );
  }
}
