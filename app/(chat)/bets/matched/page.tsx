import { endOfDay, format, startOfDay, subDays } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { listMatchedBetsForList } from "@/lib/db/queries";
import { formatNOK } from "@/lib/reporting";

export const metadata = {
  title: "Matched bets — Matched betting",
};

type PageProps = {
  searchParams: Promise<{
    status?: string;
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
  { value: "draft", label: "Draft" },
  { value: "matched", label: "Matched" },
  { value: "needs_review", label: "Needs review" },
  { value: "settled", label: "Settled" },
] as const;

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

export default async function Page(props: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const searchParams = await props.searchParams;
  const status =
    searchParams.status &&
    searchParams.status !== "all" &&
    ["draft", "matched", "needs_review", "settled"].includes(
      searchParams.status
    )
      ? (searchParams.status as
          | "draft"
          | "matched"
          | "needs_review"
          | "settled")
      : undefined;
  const range = searchParams.range ?? "30d";
  const searchQuery = searchParams.query?.trim() || undefined;

  const { fromDate, toDate } = resolveDateRange({
    range,
    from: searchParams.from,
    to: searchParams.to,
  });

  const bets = await listMatchedBetsForList({
    userId: session.user.id,
    status,
    fromDate,
    toDate,
    search: searchQuery,
    limit: 100,
  });

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Matched betting
          </p>
          <h1 className="font-semibold text-2xl">Matched bets</h1>
          <p className="text-muted-foreground text-sm">
            Full matched bet list with leg-by-leg details for reconciliation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/bets">← Dashboard</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/bets/review">Review queue</Link>
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
          <form className="grid gap-3 md:grid-cols-4" method="get">
            <div className="space-y-1">
              <label className="font-medium text-sm" htmlFor="query">
                Search
              </label>
              <Input
                defaultValue={searchParams.query ?? ""}
                id="query"
                name="query"
                placeholder="Market or selection"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium text-sm" htmlFor="status">
                Status
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                defaultValue={status ?? "all"}
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
            <div className="space-y-1">
              <label className="font-medium text-sm" htmlFor="range">
                Date range
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
            <div className="space-y-1">
              <label className="font-medium text-sm" htmlFor="from">
                Custom range
              </label>
              <div className="flex items-center gap-2">
                <Input
                  defaultValue={searchParams.from ?? ""}
                  id="from"
                  name="from"
                  type="date"
                />
                <Input
                  defaultValue={searchParams.to ?? ""}
                  id="to"
                  name="to"
                  type="date"
                />
              </div>
            </div>
            <div className="md:col-span-4">
              <Button type="submit" variant="outline" size="sm">
                Apply filters
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {bets.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              No matched bets found for these filters.
            </CardContent>
          </Card>
        ) : (
          bets.map((bet) => {
            const missingLeg =
              bet.status === "draft" && (!bet.back || !bet.lay);
            const missingLabel = missingLeg
              ? bet.back
                ? "Missing lay leg"
                : "Missing back leg"
              : null;
            return (
              <details
                className="group rounded-md border bg-card"
                key={bet.id}
              >
                <summary className="flex cursor-pointer list-none flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{bet.selection}</span>
                      <Separator className="h-4" orientation="vertical" />
                      <span className="text-muted-foreground text-sm">
                        {bet.market}
                      </span>
                      {bet.promoType && (
                        <Badge variant="secondary">{bet.promoType}</Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Created {format(bet.createdAt, "dd MMM yyyy, HH:mm")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {bet.netExposure !== null && (
                      <span className="font-semibold text-sm">
                        Exposure: {formatNOK(bet.netExposure)}
                      </span>
                    )}
                    {missingLabel && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800 text-xs">
                        {missingLabel}
                      </span>
                    )}
                    <BetStatusBadge status={bet.status} />
                  </div>
                </summary>
                <div className="space-y-3 border-t p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      Matched bet ID: {bet.id}
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/bets/${bet.id}`}>Open detail</Link>
                    </Button>
                  </div>
                  {bet.footballMatch ? (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      <div className="font-medium">
                        {bet.footballMatch.homeTeam} vs{" "}
                        {bet.footballMatch.awayTeam}
                      </div>
                      <div className="text-muted-foreground">
                        {bet.footballMatch.competition} •{" "}
                        {format(bet.footballMatch.matchDate, "dd MMM yyyy")}
                      </div>
                      <div className="text-muted-foreground">
                        Status: {bet.footballMatch.status}
                        {bet.footballMatch.homeScore !== null &&
                        bet.footballMatch.awayScore !== null
                          ? ` (${bet.footballMatch.homeScore}-${bet.footballMatch.awayScore})`
                          : ""}
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      No match linked.
                    </p>
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Back leg</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        {bet.back ? (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">
                                Account
                              </span>
                              <span className="font-medium">
                                {bet.back.accountName ?? bet.back.exchange}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">
                                Odds
                              </span>
                              <span>{formatOdds(bet.back.odds)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">
                                Stake
                              </span>
                              <span>
                                {formatAmount(
                                  bet.back.stake,
                                  bet.back.currency
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">
                                Status
                              </span>
                              <BetStatusBadge status={bet.back.status} />
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">
                                Profit/Loss
                              </span>
                              <span>
                                {formatAmount(
                                  bet.back.profitLoss,
                                  bet.back.currency
                                )}
                              </span>
                            </div>
                          </>
                        ) : (
                          <p className="text-muted-foreground">
                            No back leg yet.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Lay leg</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        {bet.lay ? (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">
                                Exchange
                              </span>
                              <span className="font-medium">
                                {bet.lay.accountName ?? bet.lay.exchange}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">
                                Odds
                              </span>
                              <span>{formatOdds(bet.lay.odds)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">
                                Stake
                              </span>
                              <span>
                                {formatAmount(
                                  bet.lay.stake,
                                  bet.lay.currency
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">
                                Status
                              </span>
                              <BetStatusBadge status={bet.lay.status} />
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">
                                Profit/Loss
                              </span>
                              <span>
                                {formatAmount(
                                  bet.lay.profitLoss,
                                  bet.lay.currency
                                )}
                              </span>
                            </div>
                          </>
                        ) : (
                          <p className="text-muted-foreground">
                            No lay leg yet.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                  {bet.notes && (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      <span className="font-medium">Notes:</span>{" "}
                      <span className="text-muted-foreground">{bet.notes}</span>
                    </div>
                  )}
                </div>
              </details>
            );
          })
        )}
      </div>
    </div>
  );
}
