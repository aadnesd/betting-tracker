import { NextResponse } from "next/server";
import { z } from "zod";
import { getTestAwareSession } from "@/lib/auth";
import {
  evaluateNeedsReview,
  formatNeedsReviewNote,
} from "@/lib/bet-review";
import {
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
import { computeNetExposureInputs } from "@/lib/bet-calculations";
import { convertAmountToNok } from "@/lib/fx-rates";
import type { NormalizedSelection } from "@/lib/db/schema";

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
    normalizedSelection: z.enum(["HOME_TEAM", "AWAY_TEAM", "DRAW"]).optional().nullable(),
    promoId: z.string().uuid().optional(),
    promoType: z.string().optional(),
    needsReview: z.boolean().optional(),
    notes: z.string().optional(),
    back: betPartSchema.optional(),
    lay: betPartSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.back && !value.lay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one bet leg is required",
      });
    }

    if (value.back && !value.backScreenshotId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Back screenshot is required when back bet is provided",
      });
    }

    if (value.lay && !value.layScreenshotId) {
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
    const hasBack = Boolean(body.back);
    const hasLay = Boolean(body.lay);
    const reviewInfo = evaluateNeedsReview({
      explicitFlag: body.needsReview,
      backConfidence: body.back?.confidence,
      layConfidence: body.lay?.confidence,
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

    const layExchange = body.lay?.exchange?.trim() || "bfb247";
    const layCurrency =
      body.lay?.currency?.toUpperCase() ?? (hasLay ? "NOK" : undefined);
    const betStatusFallback = needsReview
      ? "needs_review"
      : missingLeg
        ? "draft"
        : "matched";

    const backCurrency =
      body.back?.currency?.toUpperCase() ??
      (hasBack ? "NOK" : undefined);

    const backExchange = body.back?.exchange?.trim() || "Unknown";
    const [backAccountResult, layAccountResult] = await Promise.all([
      hasBack && body.back
        ? resolveAccountId({
            userId: session.user.id,
            accountId: body.back.accountId,
            exchange: backExchange,
            kind: "bookmaker",
            currency: backCurrency ?? null,
          })
        : Promise.resolve(null),
      hasLay && body.lay
        ? resolveAccountId({
            userId: session.user.id,
            accountId: body.lay.accountId,
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

    if (hasBack && body.back?.accountId && !backAccountId) {
      return NextResponse.json(
        { error: "Back account not found" },
        { status: 404 }
      );
    }

    if (hasLay && body.lay?.accountId && !layAccountId) {
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
      return NextResponse.json(
        { error: "Promo not found" },
        { status: 404 }
      );
    }

    const backBetRow = hasBack && body.back
      ? await saveBackBet({
          userId: session.user.id,
          screenshotId: backShot!.id,
          market: body.back.market,
          selection: body.back.selection,
          normalizedSelection: body.normalizedSelection ?? null,
          odds: body.back.odds,
          stake: body.back.stake,
          exchange: backExchange,
          matchId: body.matchId ?? null,
          accountId: backAccountId,
          currency: backCurrency ?? null,
          placedAt: safeDate(body.back.placedAt),
          settledAt: safeDate(body.back.settledAt),
          profitLoss: body.back.profitLoss ?? null,
          confidence: body.back.confidence ?? null,
          status: body.back.status ?? betStatusFallback,
        })
      : null;

    const layBetRow = hasLay && body.lay
      ? await saveLayBet({
          userId: session.user.id,
          screenshotId: layShot!.id,
          market: body.lay.market,
          selection: body.lay.selection,
          normalizedSelection: body.normalizedSelection ?? null,
          odds: body.lay.odds,
          stake: body.lay.stake,
          exchange: layExchange,
          matchId: body.matchId ?? null,
          accountId: layAccountId,
          currency: layCurrency ?? "NOK",
          placedAt: safeDate(body.lay.placedAt),
          settledAt: safeDate(body.lay.settledAt),
          profitLoss: body.lay.profitLoss ?? null,
          confidence: body.lay.confidence ?? null,
          status: body.lay.status ?? betStatusFallback,
        })
      : null;

    let netExposure: number | null = null;

    if (hasBack && hasLay && body.back && body.lay) {
      console.log(`[NET EXPOSURE] Input values: backStake=${body.back.stake}, backOdds=${body.back.odds}, layStake=${body.lay.stake}, layOdds=${body.lay.odds}, layLiability=${body.lay.liability}`);
      
      const { backProfit, layLiability } = computeNetExposureInputs({
        backStake: body.back.stake,
        backOdds: body.back.odds,
        layStake: body.lay.stake,
        layOdds: body.lay.odds,
        layLiabilityProvided: body.lay.liability,
      });

      console.log(`[NET EXPOSURE] Computing with backCurrency=${backCurrency}, layCurrency=${layCurrency}`);
      console.log(`[NET EXPOSURE] backProfit=${backProfit}, layLiability=${layLiability}`);

      const [backProfitNok, layLiabilityNok] = await Promise.all([
        convertAmountToNok(backProfit, backCurrency ?? "NOK"),
        convertAmountToNok(layLiability, layCurrency ?? "NOK"),
      ]);

      console.log(`[NET EXPOSURE] backProfitNok=${backProfitNok}, layLiabilityNok=${layLiabilityNok}`);
      netExposure = backProfitNok - layLiabilityNok;
      console.log(`[NET EXPOSURE] Final netExposure=${netExposure}`);
    }

    const auditNote = formatNeedsReviewNote(reviewInfo);
    const mergedNotes = [body.notes?.trim(), auditNote]
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
            market: body.back?.market,
            selection: body.back?.selection,
            odds: body.back?.odds,
            stake: body.back?.stake,
            exchange: backExchange,
            currency: backCurrency,
            status: body.back?.status ?? betStatusFallback,
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
            market: body.lay?.market,
            selection: body.lay?.selection,
            odds: body.lay?.odds,
            stake: body.lay?.stake,
            exchange: layExchange,
            currency: layCurrency,
            status: body.lay?.status ?? betStatusFallback,
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
