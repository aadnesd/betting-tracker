import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { revalidateDashboard } from "@/lib/cache";
import {
  createAuditEntry,
  createManualScreenshot,
  createMatchedBetRecord,
  getAccountById,
  getFootballMatchById,
  getOrCreateAccount,
  getOrCreatePromoByType,
  markFreeBetAsUsed,
  saveBackBet,
  saveLayBet,
} from "@/lib/db/queries";

const standaloneBetSchema = z
  .object({
    kind: z.enum(["back", "lay"]),
    market: z.string().min(1, "Market is required"),
    selection: z.string().min(1, "Selection is required"),
    odds: z.number().positive("Odds must be positive"),
    stake: z.number().positive("Stake must be positive"),
    accountId: z.string().uuid().optional(),
    account: z.string().min(1, "Account is required").optional(),
    currency: z.string().length(3).default("NOK"),
    matchId: z.string().uuid().optional().nullable(),
    promoType: z.string().optional(),
    freeBetId: z.string().uuid().optional(),
    placedAt: z.string().optional(), // ISO date string
    notes: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.accountId && !value.account) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Account is required",
        path: ["account"],
      });
    }

    if (value.kind === "lay" && (value.promoType || value.freeBetId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Promo metadata is only supported for standalone back bets",
        path: value.freeBetId ? ["freeBetId"] : ["promoType"],
      });
    }
  });

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof standaloneBetSchema>;
  try {
    const json = await request.json();
    body = standaloneBetSchema.parse(json);
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
    const effectivePromoType =
      body.kind === "back"
        ? (body.promoType ?? (body.freeBetId ? "Free Bet" : undefined))
        : undefined;

    // Create placeholder screenshot for standalone bet
    const screenshot = await createManualScreenshot({
      userId: session.user.id,
      kind: body.kind,
    });

    // Resolve or create the account
    const expectedKind = body.kind === "back" ? "bookmaker" : "exchange";
    let account: {
      id: string;
      name: string | null;
      kind: "bookmaker" | "exchange";
    } | null = null;

    if (body.accountId) {
      account = await getAccountById({
        id: body.accountId,
        userId: session.user.id,
      });

      if (!account) {
        return NextResponse.json(
          { error: "Account not found" },
          { status: 404 }
        );
      }

      if (account.kind !== expectedKind) {
        return NextResponse.json(
          { error: "Account type does not match bet kind" },
          { status: 400 }
        );
      }
    }

    if (!account) {
      account = await getOrCreateAccount({
        userId: session.user.id,
        name: body.account ?? "",
        kind: expectedKind,
        currency: body.currency,
      });
    }

    if (body.matchId) {
      const match = await getFootballMatchById({ id: body.matchId });
      if (!match) {
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
      }
    }

    const promo = effectivePromoType
      ? await getOrCreatePromoByType({
          userId: session.user.id,
          type: effectivePromoType,
        })
      : null;

    const betData = {
      userId: session.user.id,
      screenshotId: screenshot.id,
      market: body.market,
      selection: body.selection,
      odds: body.odds,
      stake: body.stake,
      exchange: account.name ?? body.account ?? "", // Stored as exchange field regardless of bet type
      matchId: body.matchId ?? null,
      accountId: account.id,
      currency: body.currency,
      placedAt: body.placedAt ? new Date(body.placedAt) : new Date(),
      settledAt: null,
      profitLoss: null,
      confidence: null,
      status: "placed" as const,
    };

    // Save the bet based on type
    const bet =
      body.kind === "back"
        ? await saveBackBet(betData)
        : await saveLayBet(betData);

    let standalonePromoWrapperId: string | null = null;
    if (body.kind === "back" && effectivePromoType) {
      const matchedBet = await createMatchedBetRecord({
        userId: session.user.id,
        backBetId: bet.id,
        layBetId: null,
        matchId: body.matchId ?? null,
        market: body.market,
        selection: body.selection,
        promoId: promo?.id ?? null,
        promoType: effectivePromoType,
        status: "draft",
        notes: body.notes
          ? `[Standalone Bet] Promo wrapper for single-leg bet. ${body.notes}`
          : "[Standalone Bet] Promo wrapper for single-leg bet",
      });
      standalonePromoWrapperId = matchedBet.id;

      if (body.freeBetId) {
        await markFreeBetAsUsed({
          id: body.freeBetId,
          userId: session.user.id,
          matchedBetId: matchedBet.id,
        });
      }
    }

    // Create audit entry
    await createAuditEntry({
      userId: session.user.id,
      entityType: body.kind === "back" ? "back_bet" : "lay_bet",
      entityId: bet.id,
      action: "create",
      changes: {
        market: body.market,
        selection: body.selection,
        odds: body.odds,
        stake: body.stake,
        account: account.name ?? body.account,
        currency: body.currency,
        source: "standalone",
        promoType: effectivePromoType ?? null,
        freeBetId: body.freeBetId ?? null,
        matchedBetId: standalonePromoWrapperId,
      },
      notes: body.notes
        ? `[Standalone Bet] ${body.notes}`
        : effectivePromoType
          ? "[Standalone Bet] Created with promo metadata"
          : "[Standalone Bet] Created without matched pair",
    });

    revalidateDashboard(session.user.id);

    return NextResponse.json({
      success: true,
      bet: {
        id: bet.id,
        kind: body.kind,
        market: bet.market,
        selection: bet.selection,
        odds: Number(bet.odds),
        stake: Number(bet.stake),
        status: bet.status,
        currency: bet.currency,
        matchId: bet.matchId ?? null,
        placedAt: bet.placedAt,
        createdAt: bet.createdAt,
        accountId: bet.accountId,
      },
    });
  } catch (error) {
    console.error("Failed to create standalone bet", error);
    return NextResponse.json(
      { error: "Failed to create standalone bet" },
      { status: 500 }
    );
  }
}
