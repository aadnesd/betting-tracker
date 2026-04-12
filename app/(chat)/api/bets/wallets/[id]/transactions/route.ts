import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { revalidateDashboard } from "@/lib/cache";
import {
  createTransferBetweenWallets,
  createTransferFromAccount,
  createTransferToAccount,
  createWalletTransaction,
  getWalletById,
  listWalletTransactionsWithDetails,
} from "@/lib/db/queries";

const createTransactionSchema = z.object({
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
  date: z.string().transform((s) => new Date(s)),
  relatedAccountId: z.string().uuid().nullish(),
  relatedWalletId: z.string().uuid().nullish(),
  relatedWalletAmount: z.number().positive().nullish(),
  externalRef: z.string().nullish(),
  notes: z.string().nullish(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const wallet = await getWalletById(id);

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    if (wallet.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const transactions = await listWalletTransactionsWithDetails(id);
    return NextResponse.json(transactions);
  } catch (error) {
    console.error("Error listing wallet transactions:", error);
    return NextResponse.json(
      { error: "Failed to list transactions" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: walletId } = await params;
    const wallet = await getWalletById(walletId);

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    if (wallet.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const {
      type,
      amount,
      currency,
      date,
      relatedAccountId,
      relatedWalletId,
      relatedWalletAmount,
      externalRef,
      notes,
    } = parsed.data;

    let result;

    // Handle linked transactions
    if (type === "transfer_to_account" && relatedAccountId) {
      result = await createTransferToAccount({
        walletId,
        accountId: relatedAccountId,
        amount,
        currency,
        date,
        notes,
        userId: session.user.id,
      });
    } else if (type === "transfer_from_account" && relatedAccountId) {
      result = await createTransferFromAccount({
        walletId,
        accountId: relatedAccountId,
        amount,
        currency,
        date,
        notes,
        userId: session.user.id,
      });
    } else if (type === "transfer_to_wallet" && relatedWalletId) {
      const relatedWallet = await getWalletById(relatedWalletId);
      if (!relatedWallet || relatedWallet.userId !== session.user.id) {
        return NextResponse.json(
          { error: "Related wallet not found" },
          { status: 404 }
        );
      }

      if (
        relatedWallet.currency !== wallet.currency &&
        relatedWalletAmount == null
      ) {
        return NextResponse.json(
          {
            error:
              "Related wallet amount is required for cross-currency transfers",
          },
          { status: 400 }
        );
      }

      result = await createTransferBetweenWallets({
        fromWalletId: walletId,
        toWalletId: relatedWalletId,
        fromAmount: amount,
        fromCurrency: currency,
        toAmount: relatedWalletAmount ?? amount,
        toCurrency: relatedWallet.currency,
        date,
        notes,
      });
    } else if (type === "transfer_from_wallet" && relatedWalletId) {
      const relatedWallet = await getWalletById(relatedWalletId);
      if (!relatedWallet || relatedWallet.userId !== session.user.id) {
        return NextResponse.json(
          { error: "Related wallet not found" },
          { status: 404 }
        );
      }

      if (
        relatedWallet.currency !== wallet.currency &&
        relatedWalletAmount == null
      ) {
        return NextResponse.json(
          {
            error:
              "Related wallet amount is required for cross-currency transfers",
          },
          { status: 400 }
        );
      }

      result = await createTransferBetweenWallets({
        fromWalletId: relatedWalletId,
        toWalletId: walletId,
        fromAmount: relatedWalletAmount ?? amount,
        fromCurrency: relatedWallet.currency,
        toAmount: amount,
        toCurrency: currency,
        date,
        notes,
      });
    } else {
      // Simple transaction
      result = await createWalletTransaction({
        walletId,
        type,
        amount,
        currency,
        date,
        relatedAccountId: relatedAccountId ?? null,
        relatedWalletId: relatedWalletId ?? null,
        externalRef: externalRef ?? null,
        notes: notes ?? null,
      });
    }

    revalidateDashboard(session.user.id);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating wallet transaction:", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
