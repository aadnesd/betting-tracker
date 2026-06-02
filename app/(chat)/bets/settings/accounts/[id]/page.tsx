import { ArrowLeft, Building2, CreditCard, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccountEditForm } from "@/components/bets/account-edit-form";
import { MonthDivider, monthKey } from "@/components/bets/month-divider";
import { TransactionRow } from "@/components/bets/transaction-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCachedSession } from "@/lib/auth";
import {
  getAccountBalance,
  getAccountById,
  listTransactionsByAccount,
} from "@/lib/db/queries";

export const metadata = {
  title: "Account Details",
};

type AccountTransactionType = "deposit" | "withdrawal" | "bonus" | "adjustment";

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

  const balance = await getAccountBalance({
    userId: session.user.id,
    accountId: id,
  });

  const transactions = await listTransactionsByAccount({
    userId: session.user.id,
    accountId: id,
    limit: 50,
  });
  let balanceCursor = balance;
  const transactionsWithRunningBalance = transactions.map((tx) => {
    const runningBalance = balanceCursor;
    balanceCursor -= getTransactionBalanceImpact({
      amount: tx.amount,
      type: tx.type,
    });

    return { ...tx, runningBalance };
  });

  const commission = account.commission
    ? Number.parseFloat(account.commission) * 100
    : null;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
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

      {/* Edit Form */}
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

      {/* Transactions Section - Placeholder for future */}
      <Card className="mt-6">
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
          {transactions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <p className="mb-2">No transactions recorded yet</p>
              <p className="text-sm">
                Record deposits, withdrawals, and bonuses to track your balance.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="hidden grid-cols-[minmax(0,1fr)_8rem_8rem_auto] gap-3 px-3 text-muted-foreground text-xs sm:grid">
                <span>Transaction</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Balance</span>
                <span className="w-16" />
              </div>
              {transactionsWithRunningBalance.map((tx, idx) => {
                const iso = tx.occurredAt.toISOString();
                const month = monthKey(iso);
                const prevMonth =
                  idx > 0
                    ? monthKey(
                        transactionsWithRunningBalance[
                          idx - 1
                        ].occurredAt.toISOString()
                      )
                    : null;
                const showDivider = idx === 0 || month !== prevMonth;

                return (
                  <div key={tx.id}>
                    {showDivider && <MonthDivider label={month} />}
                    <TransactionRow
                      accountId={id}
                      transaction={{
                        id: tx.id,
                        type: tx.type as AccountTransactionType,
                        amount: tx.amount,
                        currency: tx.currency,
                        occurredAt: iso,
                        notes: tx.notes,
                        runningBalance: tx.runningBalance,
                        runningBalanceCurrency: account.currency ?? tx.currency,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
