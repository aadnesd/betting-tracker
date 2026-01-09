import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  evaluateNeedsReview,
  formatNeedsReviewNote,
} from "@/lib/bet-review";
import {
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

const betPartSchema = z.object({
  market: z.string().min(1),
  selection: z.string().min(1),
  odds: z.number(),
  stake: z.number(),
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

function computeNetExposure({
  backStake,
  backOdds,
  layStake,
  layOdds,
}: {
  backStake: number;
  backOdds: number;
  layStake: number;
  layOdds: number;
}) {
  const backProfit = backStake * (backOdds - 1);
  const layLiability = layStake * (layOdds - 1);
  return { backProfit, layLiability };
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
}) {
  if (accountId) {
    const existing = await getAccountById({ id: accountId, userId });
    return existing?.id ?? null;
  }

  const account = await getOrCreateAccount({
    userId,
    name: exchange,
    kind,
    currency,
  });

  return account.id;
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
  const session = await auth();

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
    const layCurrency = "NOK";
    const betStatusFallback = needsReview
      ? "needs_review"
      : missingLeg
        ? "draft"
        : "matched";

    const backCurrency =
      body.back?.currency?.toUpperCase() ??
      (hasBack ? "NOK" : undefined);

    const backExchange = body.back?.exchange?.trim() || "Unknown";
    const [backAccountId, layAccountId] = await Promise.all([
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
            currency: layCurrency,
          })
        : Promise.resolve(null),
    ]);

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
          odds: body.back.odds,
          stake: body.back.stake,
          exchange: backExchange,
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
          odds: body.lay.odds,
          stake: body.lay.stake,
          exchange: layExchange,
          accountId: layAccountId,
          currency: layCurrency,
          placedAt: safeDate(body.lay.placedAt),
          settledAt: safeDate(body.lay.settledAt),
          profitLoss: body.lay.profitLoss ?? null,
          confidence: body.lay.confidence ?? null,
          status: body.lay.status ?? betStatusFallback,
        })
      : null;

    let netExposure: number | null = null;

    if (hasBack && hasLay && body.back && body.lay) {
      const { backProfit, layLiability } = computeNetExposure({
        backStake: body.back.stake,
        backOdds: body.back.odds,
        layStake: body.lay.stake,
        layOdds: body.lay.odds,
      });

      const [backProfitNok, layLiabilityNok] = await Promise.all([
        convertAmountToNok(backProfit, backCurrency ?? "NOK"),
        convertAmountToNok(layLiability, layCurrency),
      ]);

      netExposure = layLiabilityNok - backProfitNok;
    }

    const auditNote = formatNeedsReviewNote(reviewInfo);
    const mergedNotes = [body.notes?.trim(), auditNote]
      .filter(Boolean)
      .join("\n\n");

    const matched = await createMatchedBetRecord({
      userId: session.user.id,
      backBetId: backBetRow?.id ?? null,
      layBetId: layBetRow?.id ?? null,
      market: body.market,
      selection: body.selection,
      promoId,
      promoType: body.promoType ?? null,
      status: missingLeg ? "draft" : needsReview ? "needs_review" : "matched",
      netExposure,
      notes: mergedNotes || null,
    });

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
