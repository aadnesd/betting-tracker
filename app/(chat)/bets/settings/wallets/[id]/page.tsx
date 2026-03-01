import {
  Banknote,
  Bitcoin,
  CreditCard,
  Plus,
  Settings,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { WalletActions } from "@/components/bets/wallet-actions";
import { WalletTransactionForm } from "@/components/bets/wallet-transaction-form";
import { WalletTransactionRow } from "@/components/bets/wallet-transaction-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  calculateWalletBalance,
  getWalletById,
  listWalletTransactionsWithDetails,
} from "@/lib/db/queries";
import type { WalletTransactionType, WalletType } from "@/lib/db/schema";

export const metadata = {
  title: "Wallet Details",
};

function formatCurrency(value: number, currency: string): string {
  const decimals = [
    "BTC",
    "ETH",
    "LTC",
    "SOL",
    "DOT",
    "AVAX",
    "MATIC",
    "ADA",
    "BNB",
    "XRP",
  ].includes(currency)
    ? value < 0.01
      ? 8
      : 4
    : 2;
  return `${currency} ${value.toFixed(decimals)}`;
}

function WalletTypeBadge({ type }: { type: WalletType }) {
  switch (type) {
    case "crypto":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-orange-800 text-xs">
          <Bitcoin className="h-3 w-3" />
          Crypto
        </span>
      );
    case "hybrid":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-purple-800 text-xs">
          <CreditCard className="h-3 w-3" />
          Hybrid
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-green-800 text-xs">
          <Banknote className="h-3 w-3" />
          Fiat
        </span>
      );
  }
}

export default async function WalletDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const wallet = await getWalletById(id);

  if (!wallet) {
    notFound();
  }

  if (wallet.userId !== session.user.id) {
    redirect("/bets/settings/wallets");
  }

  const [balance, transactions] = await Promise.all([
    calculateWalletBalance(id),
    listWalletTransactionsWithDetails(id),
  ]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Wallet Settings
          </p>
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-2xl">{wallet.name}</h1>
            <WalletTypeBadge type={wallet.type as WalletType} />
            {wallet.status === "archived" && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-600 text-xs">
                Archived
              </span>
            )}
          </div>
          {wallet.notes && (
            <p className="text-muted-foreground text-sm">{wallet.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/bets/settings/wallets">← Back to wallets</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/bets/settings/wallets/${id}/edit`}>
              <Settings className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <WalletActions walletId={id} walletName={wallet.name} />
        </div>
      </div>

      {/* Balance Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-medium text-muted-foreground text-sm">
            Current Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-bold text-3xl">
            {formatCurrency(balance, wallet.currency)}
          </p>
        </CardContent>
      </Card>

      {/* Add Transaction */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Transaction
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WalletTransactionForm
            walletCurrency={wallet.currency}
            walletId={id}
          />
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {transactions.length === 0 && (
            <div className="py-8 text-center">
              <Wallet className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="mb-2 font-medium">No transactions yet</p>
              <p className="text-muted-foreground text-sm">
                Add your first transaction to start tracking.
              </p>
            </div>
          )}

          {transactions.map((tx) => (
            <WalletTransactionRow
              key={tx.id}
              transaction={{
                id: tx.id,
                type: tx.type as WalletTransactionType,
                amount: tx.amount,
                currency: tx.currency,
                date: tx.date.toISOString(),
                notes: tx.notes,
                externalRef: tx.externalRef,
                relatedAccountId: tx.relatedAccountId,
                relatedWalletId: tx.relatedWalletId,
                relatedAccountName: tx.relatedAccountName,
                relatedWalletName: tx.relatedWalletName,
              }}
              walletId={id}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
