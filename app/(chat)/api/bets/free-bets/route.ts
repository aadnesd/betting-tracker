import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { createFreeBet, listFreeBetsByUser, getAccountById } from "@/lib/db/queries";

const createFreeBetSchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100),
  value: z.number().positive("Value must be positive"),
  currency: z.string().length(3),
  minOdds: z.number().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
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
    const parsed = createFreeBetSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Verify account belongs to user
    const account = await getAccountById({ id: parsed.data.accountId, userId });
    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    const freeBet = await createFreeBet({
      userId,
      accountId: parsed.data.accountId,
      name: parsed.data.name,
      value: parsed.data.value,
      currency: parsed.data.currency,
      minOdds: parsed.data.minOdds,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      notes: parsed.data.notes || null,
    });

    return NextResponse.json(freeBet, { status: 201 });
  } catch (error) {
    console.error("Error creating free bet:", error);
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
    const status = searchParams.get("status") as "active" | "used" | "expired" | null;

    const freeBets = await listFreeBetsByUser({
      userId,
      status: status || undefined,
    });

    return NextResponse.json(freeBets);
  } catch (error) {
    console.error("Error listing free bets:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
