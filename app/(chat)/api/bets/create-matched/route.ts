import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createMatchedBetRecord,
  getScreenshotById,
  saveBackBet,
  saveLayBet,
} from "@/lib/db/queries";

const betPartSchema = z.object({
  market: z.string().min(1),
  selection: z.string().min(1),
  odds: z.number(),
  stake: z.number(),
  exchange: z.string().min(1),
  potentialReturn: z.number().optional().nullable(),
  betReference: z.string().optional().nullable(),
  placedAt: z.string().optional().nullable(),
  confidence: z.record(z.string(), z.number()).optional(),
  status: z.enum(["parsed", "needs_review", "error", "saved"]).optional(),
});

const payloadSchema = z.object({
  backScreenshotId: z.string().uuid(),
  layScreenshotId: z.string().uuid(),
  market: z.string().min(1),
  selection: z.string().min(1),
  needsReview: z.boolean().optional(),
  notes: z.string().optional(),
  back: betPartSchema,
  lay: betPartSchema,
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
  return layLiability - backProfit;
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
    const [backShot, layShot] = await Promise.all([
      getScreenshotById({
        id: body.backScreenshotId,
        userId: session.user.id,
      }),
      getScreenshotById({
        id: body.layScreenshotId,
        userId: session.user.id,
      }),
    ]);

    if (!backShot || !layShot) {
      return NextResponse.json(
        { error: "Screenshots not found" },
        { status: 404 }
      );
    }

    const backBetRow = await saveBackBet({
      userId: session.user.id,
      screenshotId: backShot.id,
      market: body.back.market,
      selection: body.back.selection,
      odds: body.back.odds,
      stake: body.back.stake,
      exchange: body.back.exchange,
      potentialReturn: body.back.potentialReturn ?? null,
      betReference: body.back.betReference ?? null,
      placedAt: safeDate(body.back.placedAt),
      confidence: body.back.confidence ?? null,
      status: body.back.status ?? (body.needsReview ? "needs_review" : "saved"),
    });

    const layBetRow = await saveLayBet({
      userId: session.user.id,
      screenshotId: layShot.id,
      market: body.lay.market,
      selection: body.lay.selection,
      odds: body.lay.odds,
      stake: body.lay.stake,
      exchange: body.lay.exchange,
      potentialReturn: body.lay.potentialReturn ?? null,
      betReference: body.lay.betReference ?? null,
      placedAt: safeDate(body.lay.placedAt),
      confidence: body.lay.confidence ?? null,
      status: body.lay.status ?? (body.needsReview ? "needs_review" : "saved"),
    });

    const netExposure = computeNetExposure({
      backStake: body.back.stake,
      backOdds: body.back.odds,
      layStake: body.lay.stake,
      layOdds: body.lay.odds,
    });

    const matched = await createMatchedBetRecord({
      userId: session.user.id,
      backBetId: backBetRow.id,
      layBetId: layBetRow.id,
      market: body.market,
      selection: body.selection,
      status: body.needsReview ? "needs_review" : "matched",
      netExposure,
      notes: body.notes ?? null,
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
