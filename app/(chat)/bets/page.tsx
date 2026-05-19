import { format } from "date-fns";
import { Copy } from "lucide-react";
import { unstable_cache } from "next/cache";
import dynamic from "next/dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { DashboardActions } from "@/components/bets/dashboard-actions";
import { DashboardSummaryCards } from "@/components/bets/dashboard-summary-cards";
import { ExposureAlertBanner } from "@/components/bets/exposure-alert-banner";
import { FreeBetExpiryBanner } from "@/components/bets/free-bet-expiry-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { dashboardTag } from "@/lib/cache";
import {
  countExpiringFreeBets,
  countPendingSettlementBets,
  getBalanceSnapshots,
  getDashboardSummary,
  getExposureByEvent,
  getPendingSettlementBets,
  listAccountsWithBalances,
  listMatchedBetsForList,
  listWalletBankTransactionsByUser,
  listWalletsByUser,
} from "@/lib/db/queries";
import { convertAmountToNok } from "@/lib/fx-rates";
import {
  formatNOK,
  markWalletBankTransactionsOnBalanceData,
  snapshotsToBalanceData,
} from "@/lib/reporting";

function cacheDashboard<T>(
  userId: string,
  key: string,
  loader: () => Promise<T>
) {
  return unstable_cache(loader, ["dashboard", userId, key], {
    tags: [dashboardTag(userId)],
    revalidate: false,
  })();
}

export const metadata = {
  title: "Matched bets",
};

const BalanceChartWithControls = dynamic(
  () =>
    import("@/components/bets/balance-chart").then(
      (module) => module.BalanceChartWithControls
    ),
  {
    loading: () => (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Total Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
    ),
  }
);

const PendingSettlementCard = dynamic(
  () =>
    import("@/components/bets/pending-settlement-card").then(
      (module) => module.PendingSettlementCard
    ),
  {
    loading: () => (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Settlement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-36 animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
    ),
  }
);

const ExposureByEventCard = dynamic(
  () =>
    import("@/components/bets/exposure-by-event-card").then(
      (module) => module.ExposureByEventCard
    ),
  {
    loading: () => (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exposure by Event</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-36 animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
    ),
  }
);

function buildCopyMatchedBetHref(
  bet: Awaited<ReturnType<typeof listMatchedBetsForList>>[number]
) {
  const params = new URLSearchParams({
    copyFrom: bet.id,
    market: bet.market,
    selection: bet.selection,
  });

  if (bet.normalizedSelection) {
    params.set("normalizedSelection", bet.normalizedSelection);
  }
  if (bet.promoType) {
    params.set("promoType", bet.promoType);
  }
  if (bet.notes) {
    params.set("notes", bet.notes);
  }
  if (bet.footballMatch) {
    params.set("matchId", bet.footballMatch.id);
    params.set("homeTeam", bet.footballMatch.homeTeam);
    params.set("awayTeam", bet.footballMatch.awayTeam);
  }
  if (bet.back) {
    params.set("backOdds", String(bet.back.odds));
    params.set("backStake", String(bet.back.stake));
    params.set("backBookmaker", bet.back.accountName || bet.back.exchange);
    params.set("backCurrency", bet.back.currency ?? "NOK");
  }
  if (bet.lay) {
    params.set("layOdds", String(bet.lay.odds));
    params.set("layStake", String(bet.lay.stake));
    params.set("layExchange", bet.lay.accountName || bet.lay.exchange);
    params.set("layCurrency", bet.lay.currency ?? "NOK");
  }

  return `/bets/quick-add?${params.toString()}`;
}

export default async function Page() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 90);

  const startDateIso = startDate.toISOString();
  const endDateIso = endDate.toISOString();

  const [
    bets,
    summary,
    expiringFreeBetsCount,
    balanceSnapshots,
    exposureByEvent,
    pendingSettlementBets,
    pendingSettlementCount,
    accountsWithBalances,
    activeWallets,
    walletBankTransactions,
  ] = await Promise.all([
    cacheDashboard(userId, "recent-matched-bets", () =>
      listMatchedBetsForList({
        userId,
        limit: 50,
      })
    ),
    cacheDashboard(userId, "summary", () => getDashboardSummary({ userId })),
    cacheDashboard(userId, "expiring-free-bets", () =>
      countExpiringFreeBets({ userId, daysUntilExpiry: 7 })
    ),
    cacheDashboard(
      userId,
      `balance-snapshots:${startDateIso}:${endDateIso}`,
      () =>
        getBalanceSnapshots({
          userId,
          startDate,
          endDate,
        })
    ),
    cacheDashboard(userId, "exposure-by-event", () =>
      getExposureByEvent({ userId })
    ),
    getPendingSettlementBets({ userId, filter: "all", limit: 10 }),
    cacheDashboard(userId, "pending-settlement-count", () =>
      countPendingSettlementBets({ userId })
    ),
    cacheDashboard(userId, "accounts-with-balances", () =>
      listAccountsWithBalances({ userId })
    ),
    cacheDashboard(userId, "active-wallets", () => listWalletsByUser(userId)),
    cacheDashboard(
      userId,
      `wallet-bank-transactions:${startDateIso}:${endDateIso}`,
      () =>
        listWalletBankTransactionsByUser({
          userId,
          startDate,
          endDate,
        })
    ),
  ]);

  const walletBankTransactionsForChart = await (async () => {
    const distinctCurrencies = Array.from(
      new Set(
        walletBankTransactions
          .map((transaction) => transaction.currency ?? "NOK")
          .map((currency) => currency.toUpperCase())
      )
    );

    // Resolve each currency conversion rate once per request.
    const rateEntries: [string, number][] = await Promise.all(
      distinctCurrencies.map(
        async (currency): Promise<[string, number]> => [
          currency,
          currency === "NOK" ? 1 : await convertAmountToNok(1, currency),
        ]
      )
    );
    const rateByCurrency = new Map(rateEntries);

    return walletBankTransactions.map((transaction) => {
      const amount = Number.parseFloat(transaction.amount ?? "0") || 0;
      const currency = (transaction.currency ?? "NOK").toUpperCase();
      const rate = rateByCurrency.get(currency) ?? 1;

      return {
        date: new Date(transaction.date),
        type: transaction.type,
        amountNok: amount * rate,
      };
    });
  })();

  const balanceDayChartData = markWalletBankTransactionsOnBalanceData(
    snapshotsToBalanceData(balanceSnapshots, "day"),
    walletBankTransactionsForChart,
    "day"
  );
  const balanceWeekChartData = markWalletBankTransactionsOnBalanceData(
    snapshotsToBalanceData(balanceSnapshots, "week"),
    walletBankTransactionsForChart,
    "week"
  );
  const balanceMonthChartData = markWalletBankTransactionsOnBalanceData(
    snapshotsToBalanceData(balanceSnapshots, "month"),
    walletBankTransactionsForChart,
    "month"
  );

  // Helper to check if an account is active (treats null/undefined as active for backwards compatibility)
  const isActive = (status: string | null | undefined) =>
    !status || status === "active";

  // Transform accounts for QuickTransactionSheet
  const accounts = accountsWithBalances
    .filter((a) => isActive(a.status))
    .map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      currency: a.currency || "NOK",
      currentBalance: String(a.currentBalance),
    }));

  // Transform wallets for QuickTransactionSheet
  const wallets = activeWallets
    .filter((w) => w.status === "active")
    .map((w) => ({
      id: w.id,
      name: w.name,
      type: w.type as "fiat" | "crypto" | "hybrid",
      currency: w.currency,
      currentBalance: String(w.balance),
    }));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Matched betting
          </p>
          <h1 className="font-semibold text-2xl">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Review parsed bets and jump into a new upload flow.
          </p>
        </div>
        <DashboardActions
          accounts={accounts}
          pendingReviewCount={summary.pendingReviewCount}
          wallets={wallets}
        />
      </div>

      <ExposureAlertBanner
        openPositions={summary.openPositions}
        threshold={5000}
        totalExposure={summary.openExposure}
      />

      <FreeBetExpiryBanner
        daysThreshold={7}
        expiringCount={expiringFreeBetsCount}
      />

      <DashboardSummaryCards
        openExposure={summary.openExposure}
        openPositions={summary.openPositions}
        openProfitIfBackWins={summary.openProfitIfBackWins}
        openProfitIfLayWins={summary.openProfitIfLayWins}
        pendingReviewCount={summary.pendingReviewCount}
        recentActivityCount={summary.recentActivityCount}
        roi={summary.roi}
        settledCount={summary.settledCount}
        totalProfit={summary.totalProfit}
      />

      <BalanceChartWithControls
        dayData={balanceDayChartData}
        monthData={balanceMonthChartData}
        title="Total Balance"
        weekData={balanceWeekChartData}
      />

      <PendingSettlementCard
        bets={pendingSettlementBets}
        totalCount={pendingSettlementCount}
      />

      <ExposureByEventCard
        exposureData={exposureByEvent}
        warningThreshold={5000}
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent matched bets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bets.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No matched bets yet. Upload back and lay slips to get started.
            </p>
          )}

          {bets.map((bet) => {
            const missingLeg =
              bet.status === "draft" && (!bet.back || !bet.lay);
            const missingLabel = missingLeg
              ? bet.back
                ? "Missing lay leg"
                : "Missing back leg"
              : null;
            const copyHref = buildCopyMatchedBetHref(bet);

            return (
              <div
                className="rounded-md border p-3 transition-colors hover:bg-muted/50"
                key={bet.id}
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        className="font-semibold hover:underline"
                        href={`/bets/${bet.id}`}
                      >
                        {bet.selection}
                      </Link>
                      <Separator className="h-4" orientation="vertical" />
                      <span className="text-muted-foreground text-sm">
                        {bet.market}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Created{" "}
                      {format(new Date(bet.createdAt), "dd MMM yyyy, HH:mm")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {bet.outcomePreview && (
                      <div className="text-right text-xs">
                        <div>
                          If back bet wins:{" "}
                          <span className="font-semibold">
                            {formatNOK(bet.outcomePreview.profitIfBackWins)}
                          </span>
                        </div>
                        <div>
                          If lay bet wins:{" "}
                          <span className="font-semibold">
                            {formatNOK(bet.outcomePreview.profitIfLayWins)}
                          </span>
                        </div>
                      </div>
                    )}
                    {missingLabel && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800 text-xs">
                        {missingLabel}
                      </span>
                    )}
                    <BetStatusBadge status={bet.status} />
                    <Button asChild size="sm" variant="outline">
                      <Link
                        aria-label={`Copy ${bet.selection}`}
                        href={copyHref}
                      >
                        <Copy className="h-4 w-4" />
                        Copy
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
