import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createDepositBonus,
  getAccountById,
  listDepositBonusesByUser,
} from "@/lib/db/queries";

const createDepositBonusSchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100),
  depositAmount: z.number().positive("Deposit amount must be positive"),
  bonusAmount: z.number().positive("Bonus amount must be positive"),
  currency: z.string().length(3),
  wageringMultiplier: z
    .number()
    .min(1, "Wagering multiplier must be at least 1"),
  wageringBase: z.enum(["deposit", "bonus", "deposit_plus_bonus"]),
  minOdds: z.number().min(1.01, "Minimum odds must be at least 1.01"),
  maxBetPercent: z.number().min(1).max(100).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  linkedTransactionId: z.string().uuid().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const body = await request.json();
    const parsed = createDepositBonusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Verify account belongs to user and is a bookmaker
    const account = await getAccountById({ id: parsed.data.accountId, userId });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (account.kind !== "bookmaker") {
      return NextResponse.json(
        { error: "Deposit bonuses can only be added to bookmaker accounts" },
        { status: 400 }
      );
    }

    const bonus = await createDepositBonus({
      userId,
      accountId: parsed.data.accountId,
      name: parsed.data.name,
      depositAmount: parsed.data.depositAmount,
      bonusAmount: parsed.data.bonusAmount,
      currency: parsed.data.currency,
      wageringMultiplier: parsed.data.wageringMultiplier,
      wageringBase: parsed.data.wageringBase,
      minOdds: parsed.data.minOdds,
      maxBetPercent: parsed.data.maxBetPercent,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      linkedTransactionId: parsed.data.linkedTransactionId,
      notes: parsed.data.notes || null,
    });

    return NextResponse.json(bonus, { status: 201 });
  } catch (error) {
    console.error("Error creating deposit bonus:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as
      | "active"
      | "cleared"
      | "completed_early"
      | "forfeited"
      | "expired"
      | null;

    const bonuses = await listDepositBonusesByUser({
      userId,
      status: status || undefined,
    });

    return NextResponse.json(bonuses);
  } catch (error) {
    console.error("Error listing deposit bonuses:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
