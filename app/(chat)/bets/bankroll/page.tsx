import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Building2,
  Gift,
  PiggyBank,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { BankrollTransactionChart } from "@/components/bets/bankroll-transaction-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getBankrollSummary,
  getTransactionTrends,
  listAccountsWithBalances,
} from "@/lib/db/queries";
import { formatCurrency, formatNOK } from "@/lib/reporting";

export const metadata = {
  title: "Bankroll",
};

export default async function BankrollPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;

  // Fetch all data in parallel
  const [summary, accounts, trends30, trends90] = await Promise.all([
    getBankrollSummary({ userId }),
    listAccountsWithBalances({ userId, status: "active" }),
    getTransactionTrends({
      userId,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      groupBy: "day",
    }),
    getTransactionTrends({
      userId,
      startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      groupBy: "week",
    }),
  ]);

  const bookmakers = accounts.filter((a) => a.kind === "bookmaker");
  const exchanges = accounts.filter((a) => a.kind === "exchange");

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Matched betting
          </p>
          <h1 className="font-semibold text-2xl">Bankroll</h1>
          <p className="text-muted-foreground text-sm">
            Track your total capital across all accounts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/bets">← Dashboard</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/bets/settings/accounts">Manage Accounts</Link>
          </Button>
        </div>
      </div>

      {/* Main Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Total Capital
            </CardTitle>
            <PiggyBank className="h-5 w-5 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                summary.totalCapital >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {formatNOK(summary.totalCapital)}
            </p>
            <p className="text-muted-foreground text-xs">
              Across {summary.activeAccountCount} active account
              {summary.activeAccountCount !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Bookmaker Balance
            </CardTitle>
            <Building2 className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                summary.bookmakerBalance >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}
            >
              {formatNOK(summary.bookmakerBalance)}
            </p>
            <p className="text-muted-foreground text-xs">
              {bookmakers.length} bookmaker{bookmakers.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Exchange Balance
            </CardTitle>
            <RefreshCw className="h-5 w-5 text-purple-600" />
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                summary.exchangeBalance >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}
            >
              {formatNOK(summary.exchangeBalance)}
            </p>
            <p className="text-muted-foreground text-xs">
              {exchanges.length} exchange{exchanges.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Net Deposits
            </CardTitle>
            <Wallet className="h-5 w-5 text-amber-600" />
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                summary.netDeposits >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {formatNOK(summary.netDeposits)}
            </p>
            <p className="text-muted-foreground text-xs">
              Deposits minus withdrawals
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Flow Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Total Deposited
            </CardTitle>
            <ArrowDownRight className="h-5 w-5 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-emerald-600">
              {formatNOK(summary.totalDeposits)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Total Withdrawn
            </CardTitle>
            <ArrowUpRight className="h-5 w-5 text-red-600" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-red-600">
              {formatNOK(summary.totalWithdrawals)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Bonuses Received
            </CardTitle>
            <Gift className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-blue-600">
              {formatNOK(summary.totalBonuses)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Trend Chart */}
      <BankrollTransactionChart
        data30={trends30}
        data90={trends90}
      />

      {/* Account Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bookmakers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              Bookmakers ({bookmakers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bookmakers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No bookmaker accounts yet.{" "}
                <Link
                  href="/bets/settings/accounts/new"
                  className="text-primary hover:underline"
                >
                  Add one
                </Link>
              </p>
            ) : (
              bookmakers
                .sort((a, b) => b.currentBalance - a.currentBalance)
                .map((acc) => (
                  <Link
                    key={acc.id}
                    href={`/bets/settings/accounts/${acc.id}`}
                    className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div>
                      <p className="font-medium">{acc.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {acc.currency} • {acc.transactionCount} transaction
                        {acc.transactionCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <p
                      className={`font-semibold ${
                        acc.currentBalance >= 0
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {formatCurrency(acc.currentBalance, acc.currency ?? "NOK")}
                    </p>
                  </Link>
                ))
            )}
          </CardContent>
        </Card>

        {/* Exchanges */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-purple-600" />
              Exchanges ({exchanges.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {exchanges.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No exchange accounts yet.{" "}
                <Link
                  href="/bets/settings/accounts/new"
                  className="text-primary hover:underline"
                >
                  Add one
                </Link>
              </p>
            ) : (
              exchanges
                .sort((a, b) => b.currentBalance - a.currentBalance)
                .map((acc) => (
                  <Link
                    key={acc.id}
                    href={`/bets/settings/accounts/${acc.id}`}
                    className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div>
                      <p className="font-medium">{acc.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {acc.currency} • {acc.transactionCount} transaction
                        {acc.transactionCount !== 1 ? "s" : ""}
                        {acc.commission && (
                          <span className="ml-2">
                            {(Number(acc.commission) * 100).toFixed(1)}% comm
                          </span>
                        )}
                      </p>
                    </div>
                    <p
                      className={`font-semibold ${
                        acc.currentBalance >= 0
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {formatCurrency(acc.currentBalance, acc.currency ?? "NOK")}
                    </p>
                  </Link>
                ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Info */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
        <h3 className="mb-2 font-medium text-blue-900">
          <TrendingUp className="mb-0.5 mr-2 inline h-4 w-4" />
          Bankroll Management Tips
        </h3>
        <ul className="space-y-1 text-blue-800 text-sm">
          <li>
            • Keep sufficient funds in your exchange to cover lay liabilities
          </li>
          <li>
            • Regularly withdraw profits to lock in gains
          </li>
          <li>
            • Track deposits and withdrawals to understand your true ROI
          </li>
          <li>
            • Consider spreading funds across multiple bookmakers
          </li>
        </ul>
      </div>
    </div>
  );
}
