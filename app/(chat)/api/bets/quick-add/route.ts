import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createAuditEntry,
  createMatchedBetRecord,
  createManualScreenshot,
  getOrCreateAccount,
  getOrCreatePromoByType,
  markFreeBetAsUsed,
  saveBackBet,
  saveLayBet,
} from "@/lib/db/queries";
import { convertAmountToNok } from "@/lib/fx-rates";

const quickAddSchema = z.object({
  market: z.string().min(1, "Market is required"),
  selection: z.string().min(1, "Selection is required"),
  matchId: z.string().uuid().optional(),
  promoType: z.string().optional(),
  freeBetId: z.string().uuid().optional(),
  back: z.object({
    odds: z.number().positive("Back odds must be positive"),
    stake: z.number().positive("Back stake must be positive"),
    bookmaker: z.string().min(1, "Bookmaker is required"),
    currency: z.string().length(3).default("NOK"),
  }),
  lay: z.object({
    odds: z.number().positive("Lay odds must be positive"),
    stake: z.number().positive("Lay stake must be positive"),
    exchange: z.string().default("bfb247"),
    currency: z.string().length(3).default("NOK"),
  }),
  notes: z.string().optional(),
});

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
    const [backAccount, layAccount] = await Promise.all([
      getOrCreateAccount({
        userId: session.user.id,
        name: body.back.bookmaker,
        kind: "bookmaker",
        currency: body.back.currency,
      }),
      getOrCreateAccount({
        userId: session.user.id,
        name: body.lay.exchange,
        kind: "exchange",
        currency: body.lay.currency,
      }),
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
        odds: body.back.odds,
        stake: body.back.stake,
        exchange: body.back.bookmaker,
        matchId: body.matchId ?? null,
        accountId: backAccount.id,
        currency: body.back.currency,
        placedAt: new Date(),
        settledAt: null,
        profitLoss: null,
        confidence: null,
        status: "matched",
      }),
      saveLayBet({
        userId: session.user.id,
        screenshotId: layScreenshot.id,
        market: body.market,
        selection: body.selection,
        odds: body.lay.odds,
        stake: body.lay.stake,
        exchange: body.lay.exchange,
        matchId: body.matchId ?? null,
        accountId: layAccount.id,
        currency: body.lay.currency,
        placedAt: new Date(),
        settledAt: null,
        profitLoss: null,
        confidence: null,
        status: "matched",
      }),
    ]);

    // Calculate net exposure in NOK
    const { backProfit, layLiability } = computeNetExposure({
      backStake: body.back.stake,
      backOdds: body.back.odds,
      layStake: body.lay.stake,
      layOdds: body.lay.odds,
    });

    const [backProfitNok, layLiabilityNok] = await Promise.all([
      convertAmountToNok(backProfit, body.back.currency),
      convertAmountToNok(layLiability, body.lay.currency),
    ]);

    const netExposure = layLiabilityNok - backProfitNok;

    // Create the matched bet record
    const matched = await createMatchedBetRecord({
      userId: session.user.id,
      backBetId: backBetRow.id,
      layBetId: layBetRow.id,
      matchId: body.matchId ?? null,
      market: body.market,
      selection: body.selection,
      promoId: promo?.id ?? null,
      promoType: body.promoType ?? null,
      status: "matched",
      netExposure,
      notes: body.notes
        ? `[Manual Entry] ${body.notes}`
        : "[Manual Entry]",
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
          odds: body.back.odds,
          stake: body.back.stake,
          bookmaker: body.back.bookmaker,
          currency: body.back.currency,
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
          odds: body.lay.odds,
          stake: body.lay.stake,
          exchange: body.lay.exchange,
          currency: body.lay.currency,
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
          source: "quick_add",
          freeBetId: body.freeBetId ?? null,
        },
        notes: body.freeBetId 
          ? `Created via Quick Add with free bet ${body.freeBetId}`
          : (body.notes ?? "Created via Quick Add"),
      }),
    ]);

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
