import { NextResponse } from "next/server";
import { z } from "zod";
import { getTestAwareSession } from "@/lib/auth";
import {
  combineSplitBetLegs,
  computeMatchedNetExposure,
  computeNetExposureInputs,
} from "@/lib/bet-calculations";
import { evaluateNeedsReview, formatNeedsReviewNote } from "@/lib/bet-review";
import { revalidateDashboard } from "@/lib/cache";
import {
  addQualifyingBetsForMatchedBet,
  createAuditEntry,
  createMatchedBetRecord,
  getAccountById,
  getOrCreateAccount,
  getOrCreatePromoByType,
  getPromoById,
  getScreenshotById,
  saveBackBet,
  saveLayBet,
} from "@/lib/db/queries";
import { convertAmountToNok } from "@/lib/fx-rates";
import { isFreeBetPromoType } from "@/lib/settlement";

const betPartSchema = z.object({
  market: z.string().min(1),
  selection: z.string().min(1),
  odds: z.number(),
  stake: z.number(),
  /** For lay bets, the liability shown on exchange (stake × (odds - 1)). If provided, used directly instead of computing. */
  liability: z.number().optional().nullable(),
  exchange: z.string().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  currency: z.string().length(3).optional().nullable(),
  placedAt: z.string().optional().nullable(),
  settledAt: z.string().optional().nullable(),
  profitLoss: z.number().optional().nullable(),
  confidence: z.record(z.string(), z.number()).optional(),
  status: z
    .enum(["draft", "placed", "matched", "settled", "needs_review", "error"])
    .optional(),
});

const payloadSchema = z
  .object({
    backScreenshotId: z.string().uuid().optional(),
    layScreenshotId: z.string().uuid().optional(),
    market: z.string().min(1),
    selection: z.string().min(1),
    matchId: z.string().uuid().optional().nullable(),
    /** Normalized selection for Match Odds (1X2): HOME_TEAM, AWAY_TEAM, DRAW */
    normalizedSelection: z
      .enum(["HOME_TEAM", "AWAY_TEAM", "DRAW"])
      .optional()
      .nullable(),
    promoId: z.string().uuid().optional(),
    promoType: z.string().optional(),
    needsReview: z.boolean().optional(),
    notes: z.string().optional(),
    back: betPartSchema.optional(),
    lay: betPartSchema.optional(),
    backBets: z.array(betPartSchema).optional(),
    layBets: z.array(betPartSchema).optional(),
  })
  .superRefine((value, ctx) => {
    const hasBack = Boolean(value.back || value.backBets?.length);
    const hasLay = Boolean(value.lay || value.layBets?.length);

    if (!hasBack && !hasLay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one bet leg is required",
      });
    }

    if (hasBack && !value.backScreenshotId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Back screenshot is required when back bet is provided",
      });
    }

    if (hasLay && !value.layScreenshotId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Lay screenshot is required when lay bet is provided",
      });
    }
  });

function safeDate(value?: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function resolveAccountId({
  userId,
  accountId,
  exchange,
  kind,
  currency,
}: {
  userId: string;
  accountId?: string | null;
  exchange: string;
  kind: "bookmaker" | "exchange";
  currency?: string | null;
}): Promise<{ id: string | null; currencyMismatch?: string }> {
  if (accountId) {
    const existing = await getAccountById({ id: accountId, userId });
    if (!existing) {
      return { id: null };
    }
    // Validate currency matches if both are specified
    if (
      currency &&
      existing.currency &&
      currency.toUpperCase() !== existing.currency.toUpperCase()
    ) {
      return {
        id: null,
        currencyMismatch: `Bet currency ${currency} does not match account "${existing.name}" currency ${existing.currency}`,
      };
    }
    return { id: existing.id };
  }

  const account = await getOrCreateAccount({
    userId,
    name: exchange,
    kind,
    currency,
  });

  return { id: account.id };
}

async function resolvePromoId({
  userId,
  promoId,
  promoType,
}: {
  userId: string;
  promoId?: string;
  promoType?: string;
}) {
  if (promoId) {
    const existing = await getPromoById({ id: promoId, userId });
    return existing?.id ?? null;
  }

  if (promoType) {
    const promo = await getOrCreatePromoByType({ userId, type: promoType });
    return promo.id;
  }

  return null;
}

function combineBetParts(
  parts: z.infer<typeof betPartSchema>[],
  kind: "back" | "lay"
) {
  if (parts.length === 0) {
    return null;
  }

  const [first] = parts;
  const combined = combineSplitBetLegs(parts, kind);

  return {
    ...first,
    odds: combined.odds,
    stake: combined.stake,
    liability: kind === "lay" ? combined.liability : first.liability,
    splitLegs: combined.legs,
  };
}

function formatSplitLegNotes({
  label,
  legs,
  currency,
}: {
  label: string;
  legs: { odds: number; stake: number }[];
  currency?: string | null;
}) {
  if (legs.length <= 1) {
    return null;
  }

  const prefix = currency ? `${currency} ` : "";
  return `${label} splits: ${legs
    .map((leg) => `${prefix}${leg.stake.toFixed(2)} @ ${leg.odds.toFixed(4)}`)
    .join(", ")}`;
}

export async function POST(request: Request) {
  const session = await getTestAwareSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof payloadSchema>;
  try {
    const json = await request.json();
    body = payloadSchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const backParts = body.backBets?.length
      ? body.backBets
      : body.back
        ? [body.back]
        : [];
    const layParts = body.layBets?.length
      ? body.layBets
      : body.lay
        ? [body.lay]
        : [];
    const backPart = combineBetParts(backParts, "back");
    const layPart = combineBetParts(layParts, "lay");
    const hasBack = Boolean(backPart);
    const hasLay = Boolean(layPart);
    const reviewInfo = evaluateNeedsReview({
      explicitFlag: body.needsReview,
      backConfidence: backPart?.confidence,
      layConfidence: layPart?.confidence,
    });
    const needsReview = reviewInfo.needsReview;
    const missingLeg = !hasBack || !hasLay;

    const [backShot, layShot] = await Promise.all([
      hasBack && body.backScreenshotId
        ? getScreenshotById({
            id: body.backScreenshotId,
            userId: session.user.id,
          })
        : Promise.resolve(null),
      hasLay && body.layScreenshotId
        ? getScreenshotById({
            id: body.layScreenshotId,
            userId: session.user.id,
          })
        : Promise.resolve(null),
    ]);

    if (hasBack && !backShot) {
      return NextResponse.json(
        { error: "Back screenshot not found" },
        { status: 404 }
      );
    }

    if (hasLay && !layShot) {
      return NextResponse.json(
        { error: "Lay screenshot not found" },
        { status: 404 }
      );
    }

    const layExchange = layPart?.exchange?.trim() || "bfb247";
    const layCurrency =
      layPart?.currency?.toUpperCase() ?? (hasLay ? "NOK" : undefined);
    const betStatusFallback = needsReview
      ? "needs_review"
      : missingLeg
        ? "draft"
        : "matched";

    const backCurrency =
      backPart?.currency?.toUpperCase() ?? (hasBack ? "NOK" : undefined);

    const backExchange = backPart?.exchange?.trim() || "Unknown";
    const [backAccountResult, layAccountResult] = await Promise.all([
      hasBack && backPart
        ? resolveAccountId({
            userId: session.user.id,
            accountId: backPart.accountId,
            exchange: backExchange,
            kind: "bookmaker",
            currency: backCurrency ?? null,
          })
        : Promise.resolve(null),
      hasLay && layPart
        ? resolveAccountId({
            userId: session.user.id,
            accountId: layPart.accountId,
            exchange: layExchange,
            kind: "exchange",
            currency: layCurrency ?? "NOK",
          })
        : Promise.resolve(null),
    ]);

    // Check for currency mismatches
    if (backAccountResult?.currencyMismatch) {
      return NextResponse.json(
        { error: backAccountResult.currencyMismatch },
        { status: 400 }
      );
    }
    if (layAccountResult?.currencyMismatch) {
      return NextResponse.json(
        { error: layAccountResult.currencyMismatch },
        { status: 400 }
      );
    }

    const backAccountId = backAccountResult?.id ?? null;
    const layAccountId = layAccountResult?.id ?? null;

    if (hasBack && backPart?.accountId && !backAccountId) {
      return NextResponse.json(
        { error: "Back account not found" },
        { status: 404 }
      );
    }

    if (hasLay && layPart?.accountId && !layAccountId) {
      return NextResponse.json(
        { error: "Lay account not found" },
        { status: 404 }
      );
    }

    const promoId = await resolvePromoId({
      userId: session.user.id,
      promoId: body.promoId,
      promoType: body.promoType,
    });

    if (body.promoId && !promoId) {
      return NextResponse.json({ error: "Promo not found" }, { status: 404 });
    }

    const backBetRow =
      hasBack && backPart && backShot
        ? await saveBackBet({
            userId: session.user.id,
            screenshotId: backShot.id,
            market: backPart.market,
            selection: backPart.selection,
            normalizedSelection: body.normalizedSelection ?? null,
            odds: backPart.odds,
            stake: backPart.stake,
            exchange: backExchange,
            matchId: body.matchId ?? null,
            accountId: backAccountId,
            currency: backCurrency ?? null,
            placedAt: safeDate(backPart.placedAt),
            settledAt: safeDate(backPart.settledAt),
            profitLoss: backPart.profitLoss ?? null,
            confidence: backPart.confidence ?? null,
            status: backPart.status ?? betStatusFallback,
          })
        : null;

    const layBetRow =
      hasLay && layPart && layShot
        ? await saveLayBet({
            userId: session.user.id,
            screenshotId: layShot.id,
            market: layPart.market,
            selection: layPart.selection,
            normalizedSelection: body.normalizedSelection ?? null,
            odds: layPart.odds,
            stake: layPart.stake,
            exchange: layExchange,
            matchId: body.matchId ?? null,
            accountId: layAccountId,
            currency: layCurrency ?? "NOK",
            placedAt: safeDate(layPart.placedAt),
            settledAt: safeDate(layPart.settledAt),
            profitLoss: layPart.profitLoss ?? null,
            confidence: layPart.confidence ?? null,
            status: layPart.status ?? betStatusFallback,
          })
        : null;

    let netExposure: number | null = null;

    if (hasBack && hasLay && backPart && layPart) {
      console.log(
        `[NET EXPOSURE] Input values: backStake=${backPart.stake}, backOdds=${backPart.odds}, layStake=${layPart.stake}, layOdds=${layPart.odds}, layLiability=${layPart.liability}`
      );

      const { backProfit, layLiability } = computeNetExposureInputs({
        backStake: backPart.stake,
        backOdds: backPart.odds,
        layStake: layPart.stake,
        layOdds: layPart.odds,
        layLiabilityProvided: layPart.liability,
      });

      console.log(
        `[NET EXPOSURE] Computing with backCurrency=${backCurrency}, layCurrency=${layCurrency}`
      );
      console.log(
        `[NET EXPOSURE] backProfit=${backProfit}, layLiability=${layLiability}`
      );

      const [backStakeNok, backProfitNok, layStakeNok, layLiabilityNok] =
        await Promise.all([
          convertAmountToNok(backPart.stake, backCurrency ?? "NOK"),
          convertAmountToNok(backProfit, backCurrency ?? "NOK"),
          convertAmountToNok(layPart.stake, layCurrency ?? "NOK"),
          convertAmountToNok(layLiability, layCurrency ?? "NOK"),
        ]);

      const layAccount = layAccountId
        ? await getAccountById({ id: layAccountId, userId: session.user.id })
        : null;

      const outcomes = computeMatchedNetExposure({
        backStake: backStakeNok,
        backProfit: backProfitNok,
        layStake: layStakeNok,
        layLiability: layLiabilityNok,
        isFreeBet: isFreeBetPromoType(body.promoType ?? null),
        commissionRate: layAccount?.commission
          ? Number.parseFloat(layAccount.commission)
          : 0,
      });

      console.log(
        `[NET EXPOSURE] backProfitNok=${backProfitNok}, layLiabilityNok=${layLiabilityNok}`
      );
      netExposure = outcomes.netExposure;
      console.log(`[NET EXPOSURE] Final netExposure=${netExposure}`);
    }

    const auditNote = formatNeedsReviewNote(reviewInfo);
    const splitNotes = [
      backPart
        ? formatSplitLegNotes({
            label: "Back",
            legs: backPart.splitLegs,
            currency: backCurrency,
          })
        : null,
      layPart
        ? formatSplitLegNotes({
            label: "Lay",
            legs: layPart.splitLegs,
            currency: layCurrency,
          })
        : null,
    ]
      .filter(Boolean)
      .join("\n");
    const mergedNotes = [body.notes?.trim(), splitNotes, auditNote]
      .filter(Boolean)
      .join("\n\n");

    const matched = await createMatchedBetRecord({
      userId: session.user.id,
      backBetId: backBetRow?.id ?? null,
      layBetId: layBetRow?.id ?? null,
      matchId: body.matchId ?? null,
      market: body.market,
      selection: body.selection,
      normalizedSelection: body.normalizedSelection ?? null,
      promoId,
      promoType: body.promoType ?? null,
      status: missingLeg ? "draft" : needsReview ? "needs_review" : "matched",
      netExposure,
      notes: mergedNotes || null,
    });

    if (backBetRow && backAccountId && backPart) {
      await addQualifyingBetsForMatchedBet({
        userId: session.user.id,
        accountId: backAccountId,
        matchedBetId: matched.id,
        stake: backPart?.stake ?? 0,
        odds: backPart?.odds ?? 0,
      });
    }

    // Create audit entries for each created entity
    const auditPromises: Promise<unknown>[] = [];

    if (backBetRow) {
      auditPromises.push(
        createAuditEntry({
          userId: session.user.id,
          entityType: "back_bet",
          entityId: backBetRow.id,
          action: "create",
          changes: {
            market: backPart?.market,
            selection: backPart?.selection,
            odds: backPart?.odds,
            stake: backPart?.stake,
            splitCount: backPart?.splitLegs.length ?? 1,
            exchange: backExchange,
            currency: backCurrency,
            status: backPart?.status ?? betStatusFallback,
          },
          notes: needsReview ? auditNote : null,
        })
      );
    }

    if (layBetRow) {
      auditPromises.push(
        createAuditEntry({
          userId: session.user.id,
          entityType: "lay_bet",
          entityId: layBetRow.id,
          action: "create",
          changes: {
            market: layPart?.market,
            selection: layPart?.selection,
            odds: layPart?.odds,
            stake: layPart?.stake,
            splitCount: layPart?.splitLegs.length ?? 1,
            exchange: layExchange,
            currency: layCurrency,
            status: layPart?.status ?? betStatusFallback,
          },
          notes: needsReview ? auditNote : null,
        })
      );
    }

    auditPromises.push(
      createAuditEntry({
        userId: session.user.id,
        entityType: "matched_bet",
        entityId: matched.id,
        action: "create",
        changes: {
          market: body.market,
          selection: body.selection,
          promoType: body.promoType ?? null,
          status: matched.status,
          netExposure,
          backBetId: backBetRow?.id ?? null,
          layBetId: layBetRow?.id ?? null,
        },
        notes: mergedNotes || null,
      })
    );

    // Run all audit entries in parallel; failures are logged but don't fail the request
    await Promise.allSettled(auditPromises);

    revalidateDashboard(session.user.id);

    return NextResponse.json({
      matched,
      back: backBetRow,
      lay: layBetRow,
    });
  } catch (error) {
    console.error("Failed to create matched bet", error);
    return NextResponse.json(
      { error: "Failed to create matched bet" },
      { status: 500 }
    );
  }
}
