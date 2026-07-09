import {
  ArrowLeft,
  Building2,
  CreditCard,
  Pencil,
  Plus,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccountBetHistory } from "@/components/bets/account-bet-history";
import { AccountEditForm } from "@/components/bets/account-edit-form";
import {
  type AccountTransactionItem,
  AccountTransactionTable,
} from "@/components/bets/account-transaction-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCachedSession } from "@/lib/auth";
import {
  getAccountBalance,
  getAccountById,
  getUserSettings,
  listMatchedBetsForList,
  listTransactionsByAccount,
} from "@/lib/db/queries";

export const metadata = {
  title: "Account Details",
};

function getTransactionBalanceImpact({
  amount,
  type,
}: {
  amount: string;
  type: string;
}) {
  const value = Number.parseFloat(amount);

  if (type === "withdrawal") {
    return -value;
  }

  if (type === "adjustment") {
    return value;
  }

  return value;
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCachedSession();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  const account = await getAccountById({
    id,
    userId: session.user.id,
  });

  if (!account) {
    notFound();
  }

  const [balance, transactions, matchedBets, settings] = await Promise.all([
    getAccountBalance({
      userId: session.user.id,
      accountId: id,
    }),
    listTransactionsByAccount({
      userId: session.user.id,
      accountId: id,
      limit: 200,
    }),
    listMatchedBetsForList({
      userId: session.user.id,
      accountId: id,
      limit: 50,
    }),
    getUserSettings({ userId: session.user.id }),
  ]);
  let balanceCursor = balance;
  const transactionsWithRunningBalance: AccountTransactionItem[] =
    transactions.map((tx) => {
      const runningBalance = balanceCursor;
      balanceCursor -= getTransactionBalanceImpact({
        amount: tx.amount,
        type: tx.type,
      });

      return {
        id: tx.id,
        type: tx.type as AccountTransactionItem["type"],
        amount: tx.amount,
        currency: tx.currency,
        occurredAt: tx.occurredAt.toISOString(),
        createdAt: tx.createdAt.toISOString(),
        notes: tx.notes,
        amountNok: tx.amountNok,
        bonusSubcategory: tx.bonusSubcategory,
        linkedWalletTransactionId: tx.linkedWalletTransactionId,
        runningBalance,
        runningBalanceCurrency: account.currency ?? tx.currency,
      };
    });

  const commission = account.commission
    ? Number.parseFloat(account.commission) * 100
    : null;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link
          className="inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
          href="/bets/settings/accounts"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Accounts
        </Link>
      </div>

      {/* Account Summary Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {account.kind === "exchange" ? (
                <div className="rounded-lg bg-blue-100 p-2">
                  <CreditCard className="h-6 w-6 text-blue-700" />
                </div>
              ) : (
                <div className="rounded-lg bg-green-100 p-2">
                  <Building2 className="h-6 w-6 text-green-700" />
                </div>
              )}
              <div>
                <CardTitle className="flex items-center gap-2">
                  {account.name}
                  {account.status === "archived" && (
                    <Badge variant="secondary">Archived</Badge>
                  )}
                  {account.id === settings?.defaultLayExchangeAccountId && (
                    <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">
                      Default exchange
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-muted-foreground text-sm capitalize">
                  {account.kind}
                  {account.currency && ` • ${account.currency}`}
                  {commission !== null &&
                    ` • ${commission.toFixed(1)}% commission`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-2xl">
                {account.currency ?? "NOK"} {balance.toFixed(2)}
              </p>
              <p className="text-muted-foreground text-xs">Current balance</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Bet History */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Bet History
            </CardTitle>
            <Badge variant="outline">{matchedBets.length} bets</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <AccountBetHistory accountId={id} bets={matchedBets} />
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Transaction History</CardTitle>
            <Button asChild size="sm">
              <Link href={`/bets/settings/accounts/${id}/transactions/new`}>
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <AccountTransactionTable
            accountId={id}
            transactions={transactionsWithRunningBalance}
          />
        </CardContent>
      </Card>

      {/* Edit Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AccountEditForm
            account={{
              id: account.id,
              name: account.name,
              kind: account.kind as "bookmaker" | "exchange",
              currency: account.currency,
              commission,
              status: account.status as "active" | "archived",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
