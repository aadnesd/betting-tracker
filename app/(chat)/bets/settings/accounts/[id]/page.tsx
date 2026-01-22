import {
  ArrowLeft,
  Building2,
  CreditCard,
  Pencil,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { AccountEditForm } from "@/components/bets/account-edit-form";
import { TransactionRow } from "@/components/bets/transaction-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAccountBalance,
  getAccountById,
  listTransactionsByAccount,
} from "@/lib/db/queries";

export const metadata = {
  title: "Account Details",
};

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
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

  const commission = account.commission
    ? Number.parseFloat(account.commission) * 100
    : null;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/bets/settings/accounts"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
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
                <p className="text-sm text-muted-foreground capitalize">
                  {account.kind}
                  {account.currency && ` • ${account.currency}`}
                  {commission !== null && ` • ${commission.toFixed(1)}% commission`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">
                {account.currency ?? "NOK"} {balance.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">Current balance</p>
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
              {transactions.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={{
                    id: tx.id,
                    type: tx.type as "deposit" | "withdrawal" | "bonus" | "adjustment",
                    amount: tx.amount,
                    currency: tx.currency,
                    occurredAt: tx.occurredAt.toISOString(),
                    notes: tx.notes,
                  }}
                  accountId={id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
