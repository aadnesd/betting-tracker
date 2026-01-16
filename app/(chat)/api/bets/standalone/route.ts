import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createAuditEntry,
  createManualScreenshot,
  getOrCreateAccount,
  saveBackBet,
  saveLayBet,
} from "@/lib/db/queries";

const standaloneBetSchema = z.object({
  kind: z.enum(["back", "lay"]),
  market: z.string().min(1, "Market is required"),
  selection: z.string().min(1, "Selection is required"),
  odds: z.number().positive("Odds must be positive"),
  stake: z.number().positive("Stake must be positive"),
  account: z.string().min(1, "Account is required"),
  currency: z.string().length(3).default("NOK"),
  placedAt: z.string().optional(), // ISO date string
  notes: z.string().optional(),
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
    // Create placeholder screenshot for standalone bet
    const screenshot = await createManualScreenshot({
      userId: session.user.id,
      kind: body.kind,
    });

    // Resolve or create the account
    const account = await getOrCreateAccount({
      userId: session.user.id,
      name: body.account,
      kind: body.kind === "back" ? "bookmaker" : "exchange",
      currency: body.currency,
    });

    const betData = {
      userId: session.user.id,
      screenshotId: screenshot.id,
      market: body.market,
      selection: body.selection,
      odds: body.odds,
      stake: body.stake,
      exchange: body.account, // Stored as exchange field regardless of bet type
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
        account: body.account,
        currency: body.currency,
        source: "standalone",
      },
      notes: body.notes
        ? `[Standalone Bet] ${body.notes}`
        : "[Standalone Bet] Created without matched pair",
    });

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
