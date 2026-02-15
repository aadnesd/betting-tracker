import { endOfDay, format, startOfDay, subDays } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { BetSettlementDropdown } from "@/components/bets/bet-settlement-dropdown";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAccountsByUser, listAllBetsByUser } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "All bets — Matched betting",
};

type PageProps = {
  searchParams: Promise<{
    status?: string;
    account?: string;
    range?: string;
    query?: string;
    from?: string;
    to?: string;
  }>;
};

const rangeOptions = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
] as const;

const statusOptions = [
  { value: "all", label: "All" },
  { value: "placed", label: "Placed" },
  { value: "settled", label: "Settled" },
] as const;

function formatAmount(amount: number | null, currency: string | null) {
  if (amount === null) {
    return "—";
  }
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return currency ? `${formatted} ${currency}` : formatted;
}

function formatOdds(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function resolveDateRange({
  range,
  from,
  to,
}: {
  range: string;
  from?: string;
  to?: string;
}) {
  const now = new Date();

  if (range === "all") {
    return { fromDate: undefined, toDate: undefined };
  }

  if (range === "custom") {
    const fromDate = from ? startOfDay(new Date(from)) : undefined;
    const toDate = to ? endOfDay(new Date(to)) : undefined;
    return { fromDate, toDate };
  }

  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  return {
    fromDate: startOfDay(subDays(now, days)),
    toDate: endOfDay(now),
  };
}

export default async function Page(props: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const searchParams = await props.searchParams;
  const status =
    searchParams.status === "placed" || searchParams.status === "settled"
      ? searchParams.status
      : undefined;
  const accountId =
    searchParams.account && searchParams.account !== "all"
      ? searchParams.account
      : undefined;
  const range = searchParams.range ?? "30d";
  const searchQuery = searchParams.query?.trim() || undefined;

  const { fromDate, toDate } = resolveDateRange({
    range,
    from: searchParams.from,
    to: searchParams.to,
  });

  const [bets, accounts] = await Promise.all([
    listAllBetsByUser({
      userId: session.user.id,
      status,
      accountId,
      fromDate,
      toDate,
      search: searchQuery,
      limit: 50,
    }),
    listAccountsByUser({ userId: session.user.id, limit: 200 }),
  ]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Matched betting
          </p>
          <h1 className="font-semibold text-2xl">All bets</h1>
          <p className="text-muted-foreground text-sm">
            Individual back and lay bets, sorted by placed date.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/bets">← Dashboard</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/bets/quick-add">Quick Add</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/bets/new/standalone">New Single Bet</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/bets/new">New matched bet</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-[repeat(12,minmax(0,1fr))]"
            method="get"
          >
            <div className="md:col-span-2">
              <label className="text-muted-foreground text-xs" htmlFor="status">
                Status
              </label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                defaultValue={searchParams.status ?? "all"}
                id="status"
                name="status"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label
                className="text-muted-foreground text-xs"
                htmlFor="account"
              >
                Account
              </label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                defaultValue={searchParams.account ?? "all"}
                id="account"
                name="account"
              >
                <option value="all">All accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.kind})
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="text-muted-foreground text-xs" htmlFor="range">
                Date range
              </label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                defaultValue={range}
                id="range"
                name="range"
              >
                {rangeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-muted-foreground text-xs" htmlFor="from">
                From
              </label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                defaultValue={searchParams.from}
                id="from"
                name="from"
                type="date"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-muted-foreground text-xs" htmlFor="to">
                To
              </label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                defaultValue={searchParams.to}
                id="to"
                name="to"
                type="date"
              />
            </div>

            <div className="md:col-span-8">
              <label className="text-muted-foreground text-xs" htmlFor="query">
                Search
              </label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                defaultValue={searchParams.query}
                id="query"
                name="query"
                placeholder="Market, selection, or bookmaker"
              />
            </div>

            <div className="flex items-end gap-2 md:col-span-4">
              <Button size="sm" type="submit">
                Apply filters
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/bets/all">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <CardTitle>Results</CardTitle>
          <p className="text-muted-foreground text-sm">
            Showing {bets.length} bet{bets.length === 1 ? "" : "s"}
          </p>
        </CardHeader>
        <CardContent>
          {bets.length === 0 ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                No bets match these filters yet.
              </p>
              <Button asChild size="sm">
                <Link href="/bets/new">Upload a matched bet</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Market / Selection</TableHead>
                  <TableHead>Odds / Stake</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>P/L</TableHead>
                  <TableHead>Placed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bets.map((bet) => {
                  const displayDate = bet.placedAt ?? bet.createdAt;
                  const accountLabel = bet.accountName ?? bet.exchange;
                  const accountKind =
                    bet.accountKind ??
                    (bet.kind === "back" ? "bookmaker" : "exchange");
                  const profitClassName = bet.profitLoss
                    ? bet.profitLoss >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                    : "text-muted-foreground";

                  return (
                    <TableRow key={`${bet.kind}-${bet.id}`}>
                      <TableCell>
                        <Badge
                          className={cn(
                            "border px-2 py-0.5 text-xs",
                            bet.kind === "back"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-rose-200 bg-rose-50 text-rose-700"
                          )}
                          variant="outline"
                        >
                          {bet.kind === "back" ? "Back" : "Lay"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium text-sm">
                            {accountLabel}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {accountKind}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium text-sm">
                            {bet.selection}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {bet.market}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div className="font-medium">
                            {formatOdds(bet.odds)}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {formatAmount(bet.stake, bet.currency)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <BetStatusBadge status={bet.status} />
                      </TableCell>
                      <TableCell className={cn("text-sm", profitClassName)}>
                        {bet.status === "settled"
                          ? formatAmount(bet.profitLoss ?? 0, bet.currency)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(displayDate, "dd MMM yyyy, HH:mm")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/bets/${bet.kind}/${bet.id}`}>
                              View
                            </Link>
                          </Button>
                          {bet.status !== "settled" && (
                            <BetSettlementDropdown
                              betId={bet.id}
                              betKind={bet.kind}
                              commissionRate={
                                bet.kind === "lay"
                                  ? (bet.accountCommission ?? 0)
                                  : 0
                              }
                              currency={bet.currency ?? "NOK"}
                              odds={bet.odds}
                              selection={bet.selection}
                              stake={bet.stake}
                            />
                          )}
                          {bet.matchedBetId && (
                            <Button asChild size="sm" variant="ghost">
                              <Link href={`/bets/${bet.matchedBetId}`}>
                                Matched
                              </Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
