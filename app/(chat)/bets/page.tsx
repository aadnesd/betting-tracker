import { format } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { DashboardActions } from "@/components/bets/dashboard-actions";
import { DashboardSummaryCards } from "@/components/bets/dashboard-summary-cards";
import { ExposureAlertBanner } from "@/components/bets/exposure-alert-banner";
import { ExposureByEventCard } from "@/components/bets/exposure-by-event-card";
import { ExposureTimelineWithControls } from "@/components/bets/exposure-timeline-chart";
import { FreeBetExpiryBanner } from "@/components/bets/free-bet-expiry-banner";
import { PendingSettlementCard } from "@/components/bets/pending-settlement-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  countExpiringFreeBets,
  countPendingSettlementBets,
  getDashboardSummary,
  getExposureByEvent,
  getExposureTimeline,
  getPendingSettlementBets,
  listAccountsWithBalances,
  listActiveWalletsByUser,
  listMatchedBetsByUser,
} from "@/lib/db/queries";

export const metadata = {
  title: "Matched bets",
};

export default async function Page() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;

  const [bets, summary, expiringFreeBetsCount, exposureData7, exposureData14, exposureData30, exposureData90, exposureByEvent, pendingSettlementBets, pendingSettlementCount, accountsWithBalances, activeWallets] = await Promise.all([
    listMatchedBetsByUser({
      userId,
      limit: 50,
    }),
    getDashboardSummary({ userId }),
    countExpiringFreeBets({ userId, daysUntilExpiry: 7 }),
    getExposureTimeline({ userId, daysBack: 7 }),
    getExposureTimeline({ userId, daysBack: 14 }),
    getExposureTimeline({ userId, daysBack: 30 }),
    getExposureTimeline({ userId, daysBack: 90 }),
    getExposureByEvent({ userId }),
    getPendingSettlementBets({ userId, filter: "all", limit: 10 }),
    countPendingSettlementBets({ userId }),
    listAccountsWithBalances({ userId }),
    listActiveWalletsByUser(userId),
  ]);

  // Helper to check if an account is active (treats null/undefined as active for backwards compatibility)
  const isActive = (status: string | null | undefined) => !status || status === "active";
  
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
  const wallets = activeWallets.map((w) => ({
    id: w.id,
    name: w.name,
    type: w.type as "fiat" | "crypto" | "hybrid",
    currency: w.currency,
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
          pendingReviewCount={summary.pendingReviewCount} 
          accounts={accounts}
          wallets={wallets}
        />
      </div>

      <ExposureAlertBanner
        totalExposure={summary.openExposure}
        openPositions={summary.openPositions}
        threshold={5000}
      />

      <FreeBetExpiryBanner
        expiringCount={expiringFreeBetsCount}
        daysThreshold={7}
      />

      <DashboardSummaryCards
        totalProfit={summary.totalProfit}
        settledCount={summary.settledCount}
        openExposure={summary.openExposure}
        openPositions={summary.openPositions}
        pendingReviewCount={summary.pendingReviewCount}
        recentActivityCount={summary.recentActivityCount}
        roi={summary.roi}
      />

      <ExposureTimelineWithControls
        data7={exposureData7}
        data14={exposureData14}
        data30={exposureData30}
        data90={exposureData90}
        currentExposure={summary.openExposure}
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
              bet.status === "draft" && (!bet.backBetId || !bet.layBetId);
            const missingLabel = missingLeg
              ? bet.backBetId
                ? "Missing lay leg"
                : "Missing back leg"
              : null;

            return (
              <Link
                className="block rounded-md border p-3 transition-colors hover:bg-muted/50"
                href={`/bets/${bet.id}`}
                key={bet.id}
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{bet.selection}</span>
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
                    {bet.netExposure && (
                      <span className="font-semibold text-sm">
                        Exposure: NOK {Number(bet.netExposure).toFixed(2)}
                      </span>
                    )}
                    {missingLabel && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800 text-xs">
                        {missingLabel}
                      </span>
                    )}
                    <BetStatusBadge status={bet.status} />
                  </div>
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
