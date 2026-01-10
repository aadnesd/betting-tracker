import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createAccountTransaction,
  createAuditEntry,
  getAccountById,
  listTransactionsByAccount,
} from "@/lib/db/queries";

const createTransactionSchema = z.object({
  type: z.enum(["deposit", "withdrawal", "bonus", "adjustment"]),
  amount: z.number().positive("Amount must be positive"),
  currency: z.string().length(3, "Currency must be 3 characters"),
  occurredAt: z.string().transform((val) => new Date(val)),
  notes: z.string().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: accountId } = await params;

  // Verify account exists and belongs to user
  const account = await getAccountById({
    id: accountId,
    userId: session.user.id,
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  let body: z.infer<typeof createTransactionSchema>;
  try {
    const json = await request.json();
    body = createTransactionSchema.parse(json);
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
    const transaction = await createAccountTransaction({
      userId: session.user.id,
      accountId,
      type: body.type,
      amount: body.amount,
      currency: body.currency,
      occurredAt: body.occurredAt,
      notes: body.notes ?? null,
    });

    // Create audit entry
    await createAuditEntry({
      userId: session.user.id,
      entityType: "account",
      entityId: accountId,
      action: "update",
      changes: {
        transaction: {
          id: transaction.id,
          type: body.type,
          amount: body.amount,
          currency: body.currency,
        },
      },
      notes: `Recorded ${body.type}: ${body.currency} ${body.amount.toFixed(2)}`,
    });

    return NextResponse.json({
      success: true,
      transaction,
    });
  } catch (error) {
    console.error("Failed to create transaction", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: accountId } = await params;

  // Verify account exists and belongs to user
  const account = await getAccountById({
    id: accountId,
    userId: session.user.id,
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Number.parseInt(limitParam, 10), 500) : 100;

  try {
    const transactions = await listTransactionsByAccount({
      userId: session.user.id,
      accountId,
      limit,
    });

    return NextResponse.json({
      transactions,
      count: transactions.length,
    });
  } catch (error) {
    console.error("Failed to list transactions", error);
    return NextResponse.json(
      { error: "Failed to list transactions" },
      { status: 500 }
    );
  }
}
