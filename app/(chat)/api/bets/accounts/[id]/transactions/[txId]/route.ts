import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { revalidateDashboard } from "@/lib/cache";
import {
  autoCompleteDepositBonusesIfEligible,
  deleteAccountTransaction,
  getAccountById,
  updateAccountTransaction,
} from "@/lib/db/queries";

interface RouteParams {
  params: Promise<{ id: string; txId: string }>;
}

const updateTransactionSchema = z.object({
  type: z.enum(["deposit", "withdrawal", "bonus", "adjustment"]),
  amount: z.number().positive("Amount must be positive"),
  currency: z.string().length(3, "Currency must be 3 characters"),
  occurredAt: z.string().transform((val) => new Date(val)),
  notes: z.string().nullable().optional(),
});

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: accountId, txId } = await params;

  let body: z.infer<typeof updateTransactionSchema>;
  try {
    const json = await request.json();
    body = updateTransactionSchema.parse(json);
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
    // Verify account exists and belongs to user
    const account = await getAccountById({
      id: accountId,
      userId: session.user.id,
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const updated = await updateAccountTransaction({
      id: txId,
      userId: session.user.id,
      type: body.type,
      amount: body.amount,
      currency: body.currency,
      occurredAt: body.occurredAt,
      notes: body.notes ?? null,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    try {
      await autoCompleteDepositBonusesIfEligible({
        userId: session.user.id,
        accountId,
      });
    } catch (error) {
      console.error(
        "[accounts/transactions/patch] Failed to evaluate deposit bonus auto-completion",
        error
      );
    }

    revalidateDashboard(session.user.id);

    return NextResponse.json({ success: true, transaction: updated });
  } catch (error) {
    console.error("Error updating transaction:", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: accountId, txId } = await params;

  try {
    // Verify account exists and belongs to user
    const account = await getAccountById({
      id: accountId,
      userId: session.user.id,
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const result = await deleteAccountTransaction({
      id: txId,
      userId: session.user.id,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    try {
      await autoCompleteDepositBonusesIfEligible({
        userId: session.user.id,
        accountId,
      });
    } catch (error) {
      console.error(
        "[accounts/transactions/delete] Failed to evaluate deposit bonus auto-completion",
        error
      );
    }

    revalidateDashboard(session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    return NextResponse.json(
      { error: "Failed to delete transaction" },
      { status: 500 }
    );
  }
}
