import { Building2, CreditCard, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAccountsWithBalances } from "@/lib/db/queries";

export const metadata = {
  title: "Account Settings",
};

function formatCurrency(value: number, currency: string | null): string {
  const cur = currency ?? "NOK";
  return `${cur} ${value.toFixed(2)}`;
}

function AccountKindBadge({ kind }: { kind: "bookmaker" | "exchange" }) {
  if (kind === "exchange") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-800 text-xs">
        <CreditCard className="h-3 w-3" />
        Exchange
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-green-800 text-xs">
      <Building2 className="h-3 w-3" />
      Bookmaker
    </span>
  );
}

function AccountStatusBadge({ status }: { status: "active" | "archived" }) {
  if (status === "archived") {
    return (
      <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-600 text-xs">
        Archived
      </span>
    );
  }
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700 text-xs">
      Active
    </span>
  );
}

export default async function AccountSettingsPage() {
  const session = await auth();

  if (!session) {
    redirect("/api/auth/guest");
  }

  const userId = session.user.id;

  const accounts = await listAccountsWithBalances({ userId });

  const bookmakers = accounts.filter((a) => a.kind === "bookmaker");
  const exchanges = accounts.filter((a) => a.kind === "exchange");

  const totalBookmakerBalance = bookmakers.reduce(
    (sum, a) => sum + a.currentBalance,
    0
  );
  const totalExchangeBalance = exchanges.reduce(
    (sum, a) => sum + a.currentBalance,
    0
  );

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Settings
          </p>
          <h1 className="font-semibold text-2xl">Bookmaker & Exchange Accounts</h1>
          <p className="text-muted-foreground text-sm">
            Manage your betting accounts, track balances, and record transactions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/bets">← Back to dashboard</Link>
          </Button>
          <Button asChild>
            <Link href="/bets/settings/accounts/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Account
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{accounts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bookmakers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{bookmakers.length}</p>
            <p className="text-sm text-muted-foreground">
              Total: NOK {totalBookmakerBalance.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Exchanges
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{exchanges.length}</p>
            <p className="text-sm text-muted-foreground">
              Total: NOK {totalExchangeBalance.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Combined Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              NOK {(totalBookmakerBalance + totalExchangeBalance).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Accounts List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Your Accounts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {accounts.length === 0 && (
            <div className="py-8 text-center">
              <Building2 className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="mb-2 font-medium">No accounts yet</p>
              <p className="mb-4 text-muted-foreground text-sm">
                Add your first bookmaker or exchange account to start tracking.
              </p>
              <Button asChild>
                <Link href="/bets/settings/accounts/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Account
                </Link>
              </Button>
            </div>
          )}

          {accounts.map((acct) => (
            <Link
              key={acct.id}
              href={`/bets/settings/accounts/${acct.id}`}
              className="block rounded-md border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{acct.name}</span>
                    <AccountKindBadge kind={acct.kind} />
                    <AccountStatusBadge status={acct.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {acct.currency && (
                      <span>Currency: {acct.currency}</span>
                    )}
                    {acct.kind === "exchange" && acct.commission && (
                      <span>
                        Commission: {(Number(acct.commission) * 100).toFixed(1)}%
                      </span>
                    )}
                    <span>
                      {acct.transactionCount} transaction{acct.transactionCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-lg">
                    {formatCurrency(acct.currentBalance, acct.currency)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Current balance
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      {/* Quick Info */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
        <h3 className="mb-2 font-medium text-blue-900">About Account Tracking</h3>
        <ul className="space-y-1 text-blue-800 text-sm">
          <li>
            • <strong>Bookmaker accounts</strong> are where you place back bets with promotional offers
          </li>
          <li>
            • <strong>Exchange accounts</strong> are where you lay bets to lock in profit/minimize loss
          </li>
          <li>
            • Record deposits, withdrawals, and bonuses to keep accurate balance tracking
          </li>
          <li>
            • Balances update automatically based on your recorded transactions
          </li>
        </ul>
      </div>
    </div>
  );
}
