import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  deleteWalletTransaction,
  getWalletById,
  getWalletTransactionById,
  updateWalletTransaction,
} from "@/lib/db/queries";

const updateWalletTransactionSchema = z.object({
  type: z.enum([
    "deposit",
    "withdrawal",
    "transfer_to_account",
    "transfer_from_account",
    "transfer_to_wallet",
    "transfer_from_wallet",
    "fee",
    "adjustment",
  ]),
  amount: z.number().positive("Amount must be positive"),
  currency: z.string().min(1).max(10),
  date: z.string().transform((value) => new Date(value)),
  relatedAccountId: z.string().uuid().nullish(),
  relatedWalletId: z.string().uuid().nullish(),
  externalRef: z.string().nullish(),
  notes: z.string().nullish(),
});

interface RouteParams {
  params: Promise<{ id: string; txId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: walletId, txId } = await params;
    const wallet = await getWalletById(walletId);

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    if (wallet.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await getWalletTransactionById(txId);
    if (!existing || existing.walletId !== walletId) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateWalletTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const updated = await updateWalletTransaction({
      id: txId,
      userId: session.user.id,
      type: parsed.data.type,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      date: parsed.data.date,
      relatedAccountId: parsed.data.relatedAccountId ?? null,
      relatedWalletId: parsed.data.relatedWalletId ?? null,
      externalRef: parsed.data.externalRef ?? null,
      notes: parsed.data.notes ?? null,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, transaction: updated });
  } catch (error) {
    console.error("Error updating wallet transaction:", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: walletId, txId } = await params;
    const wallet = await getWalletById(walletId);

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    if (wallet.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await getWalletTransactionById(txId);
    if (!existing || existing.walletId !== walletId) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    const result = await deleteWalletTransaction({
      id: txId,
      userId: session.user.id,
    });
    if (!result) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting wallet transaction:", error);
    return NextResponse.json(
      { error: "Failed to delete transaction" },
      { status: 500 }
    );
  }
}
