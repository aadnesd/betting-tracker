import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  combineSplitBetLegs,
  computeMatchedNetExposure,
  computeNetExposureInputs,
} from "@/lib/bet-calculations";
import { revalidateDashboard } from "@/lib/cache";
import {
  addQualifyingBetsForMatchedBet,
  createAuditEntry,
  createManualScreenshot,
  createMatchedBetRecord,
  getAccountByName,
  getFreeBetById,
  getOrCreateAccount,
  getOrCreatePromoByType,
  markFreeBetAsUsed,
  saveBackBet,
  saveLayBet,
} from "@/lib/db/queries";
import type { BetSplitLeg } from "@/lib/db/schema";
import { convertAmountToNok } from "@/lib/fx-rates";
import { isFreeBetPromoType } from "@/lib/settlement";

const splitLegSchema = z.object({
  odds: z.number().positive(),
  stake: z.number().positive(),
  accountName: z.string().optional().nullable(),
});

const quickAddSchema = z.object({
  market: z.string().min(1, "Market is required"),
  selection: z.string().min(1, "Selection is required"),
  matchId: z.string().uuid().optional(),
  unlinkedMatchDate: z.string().datetime({ offset: true }).optional(),
  normalizedSelection: z.enum(["HOME_TEAM", "AWAY_TEAM", "DRAW"]).optional(),
  promoType: z.string().optional(),
  freeBetId: z.string().uuid().optional(),
  back: z.object({
    odds: z.number().positive("Back odds must be positive"),
    stake: z.number().positive("Back stake must be positive"),
    bookmaker: z.string().min(1, "Bookmaker is required"),
    currency: z.string().length(3).default("NOK"),
    legs: z.array(splitLegSchema).optional(),
  }),
  lay: z.object({
    odds: z.number().positive("Lay odds must be positive"),
    stake: z.number().positive("Lay stake must be positive"),
    exchange: z.string().default("bfb247"),
    currency: z.string().length(3).default("NOK"),
    legs: z.array(splitLegSchema).optional(),
  }),
  notes: z.string().optional(),
});

function formatSplitLegNotes({
  label,
  legs,
  currency,
}: {
  label: string;
  legs: { odds: number; stake: number }[];
  currency: string;
}) {
  if (legs.length <= 1) {
    return null;
  }

  return `${label} splits: ${legs
    .map(
      (leg) => `${currency} ${leg.stake.toFixed(2)} @ ${leg.odds.toFixed(4)}`
    )
    .join(", ")}`;
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof quickAddSchema>;
  try {
    const json = await request.json();
    body = quickAddSchema.parse(json);
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
    const backLegs =
      body.back.legs && body.back.legs.length > 0
        ? body.back.legs
        : [{ odds: body.back.odds, stake: body.back.stake }];
    const layLegs =
      body.lay.legs && body.lay.legs.length > 0
        ? body.lay.legs
        : [{ odds: body.lay.odds, stake: body.lay.stake }];
    const combinedBack = combineSplitBetLegs(backLegs, "back");
    const combinedLay = combineSplitBetLegs(layLegs, "lay");

    // Create placeholder screenshots for manual entry
    const [backScreenshot, layScreenshot] = await Promise.all([
      createManualScreenshot({
        userId: session.user.id,
        kind: "back",
      }),
      createManualScreenshot({
        userId: session.user.id,
        kind: "lay",
      }),
    ]);

    // Resolve or create accounts
    // Back bets can be placed at bookmakers or exchanges. Look up by name
    // in both kinds before falling back to creating a new bookmaker.
    const [backAsBookmaker, backAsExchange] = await Promise.all([
      getAccountByName({
        userId: session.user.id,
        name: body.back.bookmaker,
        kind: "bookmaker",
      }),
      getAccountByName({
        userId: session.user.id,
        name: body.back.bookmaker,
        kind: "exchange",
      }),
    ]);
    const backAccount =
      backAsBookmaker ??
      backAsExchange ??
      (await getOrCreateAccount({
        userId: session.user.id,
        name: body.back.bookmaker,
        kind: "bookmaker",
        currency: body.back.currency,
      }));
    const layAccount = await getOrCreateAccount({
      userId: session.user.id,
      name: body.lay.exchange,
      kind: "exchange",
      currency: body.lay.currency,
    });

    // Resolve the account each split leg was placed on so settlement can deduct
    // the correct amount from every account. Legs default to their section's
    // primary account when no per-leg account was chosen.
    const resolveLegAccountId = async (
      name: string | null | undefined,
      fallbackId: string,
      currency: string
    ): Promise<string> => {
      const trimmed = name?.trim();
      if (!trimmed) {
        return fallbackId;
      }
      const [asBookmaker, asExchange] = await Promise.all([
        getAccountByName({
          userId: session.user.id,
          name: trimmed,
          kind: "bookmaker",
        }),
        getAccountByName({
          userId: session.user.id,
          name: trimmed,
          kind: "exchange",
        }),
      ]);
      const resolved =
        asBookmaker ??
        asExchange ??
        (await getOrCreateAccount({
          userId: session.user.id,
          name: trimmed,
          kind: "bookmaker",
          currency,
        }));
      return resolved.id;
    };

    const buildSplitLegs = async (
      legs: { odds: number; stake: number; accountName?: string | null }[],
      fallbackId: string,
      currency: string
    ): Promise<BetSplitLeg[] | null> => {
      if (legs.length <= 1) {
        return null;
      }
      const accountIds = await Promise.all(
        legs.map((leg) =>
          resolveLegAccountId(leg.accountName, fallbackId, currency)
        )
      );
      return legs.map((leg, index) => ({
        accountId: accountIds[index],
        stake: leg.stake,
        odds: leg.odds,
        currency,
      }));
    };

    const [backSplitLegs, laySplitLegs] = await Promise.all([
      buildSplitLegs(backLegs, backAccount.id, body.back.currency),
      buildSplitLegs(layLegs, layAccount.id, body.lay.currency),
    ]);

    // Resolve promo if provided
    const promo = body.promoType
      ? await getOrCreatePromoByType({
          userId: session.user.id,
          type: body.promoType,
        })
      : null;

    // Save both bet legs
    const [backBetRow, layBetRow] = await Promise.all([
      saveBackBet({
        userId: session.user.id,
        screenshotId: backScreenshot.id,
        market: body.market,
        selection: body.selection,
        normalizedSelection: body.normalizedSelection ?? null,
        odds: combinedBack.odds,
        stake: combinedBack.stake,
        exchange: body.back.bookmaker,
        matchId: body.matchId ?? null,
        accountId: backAccount.id,
        currency: body.back.currency,
        placedAt: new Date(),
        settledAt: null,
        profitLoss: null,
        confidence: null,
        status: "matched",
        splitLegs: backSplitLegs,
      }),
      saveLayBet({
        userId: session.user.id,
        screenshotId: layScreenshot.id,
        market: body.market,
        selection: body.selection,
        normalizedSelection: body.normalizedSelection ?? null,
        odds: combinedLay.odds,
        stake: combinedLay.stake,
        exchange: body.lay.exchange,
        matchId: body.matchId ?? null,
        accountId: layAccount.id,
        currency: body.lay.currency,
        placedAt: new Date(),
        settledAt: null,
        profitLoss: null,
        confidence: null,
        status: "matched",
        splitLegs: laySplitLegs,
      }),
    ]);

    // Calculate net exposure in NOK
    const { backProfit, layLiability } = computeNetExposureInputs({
      backStake: combinedBack.stake,
      backOdds: combinedBack.odds,
      layStake: combinedLay.stake,
      layOdds: combinedLay.odds,
      layLiabilityProvided: combinedLay.liability,
    });

    const [backStakeNok, backProfitNok, layStakeNok, layLiabilityNok] =
      await Promise.all([
        convertAmountToNok(combinedBack.stake, body.back.currency),
        convertAmountToNok(backProfit, body.back.currency),
        convertAmountToNok(combinedLay.stake, body.lay.currency),
        convertAmountToNok(layLiability, body.lay.currency),
      ]);

    const selectedFreeBet = body.freeBetId
      ? await getFreeBetById({
          id: body.freeBetId,
          userId: session.user.id,
        })
      : null;

    const unlinkedMatchDate =
      body.matchId || !body.unlinkedMatchDate
        ? null
        : new Date(body.unlinkedMatchDate);

    const { netExposure } = computeMatchedNetExposure({
      backStake: backStakeNok,
      backProfit: backProfitNok,
      layStake: layStakeNok,
      layLiability: layLiabilityNok,
      isFreeBet:
        !!selectedFreeBet || isFreeBetPromoType(body.promoType ?? null),
      freeBetStakeReturned: selectedFreeBet?.stakeReturned ?? false,
      commissionRate: layAccount.commission
        ? Number.parseFloat(layAccount.commission)
        : 0,
    });

    const splitNotes = [
      formatSplitLegNotes({
        label: "Back",
        legs: combinedBack.legs,
        currency: body.back.currency,
      }),
      formatSplitLegNotes({
        label: "Lay",
        legs: combinedLay.legs,
        currency: body.lay.currency,
      }),
    ]
      .filter(Boolean)
      .join("\n");
    const notes = [body.notes, splitNotes].filter(Boolean).join("\n\n");

    // Create the matched bet record
    const matched = await createMatchedBetRecord({
      userId: session.user.id,
      backBetId: backBetRow.id,
      layBetId: layBetRow.id,
      matchId: body.matchId ?? null,
      unlinkedMatchDate,
      market: body.market,
      selection: body.selection,
      normalizedSelection: body.normalizedSelection ?? null,
      promoId: promo?.id ?? null,
      promoType: body.promoType ?? null,
      status: "matched",
      netExposure,
      notes: notes ? `[Manual Entry] ${notes}` : "[Manual Entry]",
    });

    await addQualifyingBetsForMatchedBet({
      userId: session.user.id,
      accountId: backAccount.id,
      matchedBetId: matched.id,
      stake: combinedBack.stake,
      odds: combinedBack.odds,
    });

    // Mark free bet as used if one was selected
    if (body.freeBetId) {
      await markFreeBetAsUsed({
        id: body.freeBetId,
        userId: session.user.id,
        matchedBetId: matched.id,
      });
    }

    // Create audit entries
    await Promise.allSettled([
      createAuditEntry({
        userId: session.user.id,
        entityType: "back_bet",
        entityId: backBetRow.id,
        action: "create",
        changes: {
          market: body.market,
          selection: body.selection,
          odds: combinedBack.odds,
          stake: combinedBack.stake,
          bookmaker: body.back.bookmaker,
          currency: body.back.currency,
          splitCount: combinedBack.legs.length,
          source: "quick_add",
        },
        notes: "Created via Quick Add",
      }),
      createAuditEntry({
        userId: session.user.id,
        entityType: "lay_bet",
        entityId: layBetRow.id,
        action: "create",
        changes: {
          market: body.market,
          selection: body.selection,
          odds: combinedLay.odds,
          stake: combinedLay.stake,
          exchange: body.lay.exchange,
          currency: body.lay.currency,
          splitCount: combinedLay.legs.length,
          source: "quick_add",
        },
        notes: "Created via Quick Add",
      }),
      createAuditEntry({
        userId: session.user.id,
        entityType: "matched_bet",
        entityId: matched.id,
        action: "create",
        changes: {
          market: body.market,
          selection: body.selection,
          promoType: body.promoType ?? null,
          status: "matched",
          netExposure,
          unlinkedMatchDate: unlinkedMatchDate?.toISOString() ?? null,
          source: "quick_add",
          freeBetId: body.freeBetId ?? null,
        },
        notes: body.freeBetId
          ? `Created via Quick Add with free bet ${body.freeBetId}`
          : (body.notes ?? "Created via Quick Add"),
      }),
    ]);

    revalidateDashboard(session.user.id);

    return NextResponse.json({
      success: true,
      matched,
      back: backBetRow,
      lay: layBetRow,
      freeBetUsed: !!body.freeBetId,
    });
  } catch (error) {
    console.error("Failed to create quick add bet", error);
    return NextResponse.json(
      { error: "Failed to create matched bet" },
      { status: 500 }
    );
  }
}
