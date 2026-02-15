import { Download, Upload } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { BalanceChartWithControls } from "@/components/bets/balance-chart";
import { BookmakerProfitWithBonusesTable } from "@/components/bets/bookmaker-profit-with-bonuses-table";
import { BreakdownChartWithToggle } from "@/components/bets/breakdown-charts";
import { ExportButton } from "@/components/bets/export-button";
import { ProfitChartWithControls } from "@/components/bets/profit-chart";
import { ReportingBreakdownTable } from "@/components/bets/reporting-breakdown-table";
import { ReportingDateFilter } from "@/components/bets/reporting-date-filter";
import { ReportingSummaryCard } from "@/components/bets/reporting-summary-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getBalanceSnapshots,
  getBookmakerProfitWithBonuses,
  getMatchedBetsForReporting,
  getOpenExposure,
  getProfitByBookmaker,
  getProfitByExchange,
  getProfitByPromoType,
  getTotalBonusesForUser,
} from "@/lib/db/queries";
import {
  calculateCumulativeProfitData,
  calculateReportingSummary,
  enrichWithROI,
  getDateRange,
  type MatchedBetWithLegs,
  snapshotsToBalanceData,
} from "@/lib/reporting";

export const metadata = {
  title: "Reports — Matched Betting",
};

type Props = {
  searchParams: Promise<{ period?: string }>;
};

export default async function Page(props: Props) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const searchParams = await props.searchParams;
  const period =
    (searchParams.period as "week" | "month" | "quarter" | "year" | "all") ||
    "month";
  const { startDate, endDate } = getDateRange(period);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Matched betting
          </p>
          <h1 className="font-semibold text-2xl">Reports</h1>
          <p className="text-muted-foreground text-sm">
            Profit, ROI, and breakdown by bookmaker and promo type.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/bets/import">
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Link>
          </Button>
          <ExportButton endDate={endDate} startDate={startDate} />
          <Button asChild variant="outline">
            <Link href="/bets">← Dashboard</Link>
          </Button>
        </div>
      </div>

      <Suspense fallback={<FilterSkeleton />}>
        <ReportingDateFilter />
      </Suspense>

      <Suspense fallback={<SummarySkeleton />}>
        <ReportingContent
          endDate={endDate}
          startDate={startDate}
          userId={session.user.id}
        />
      </Suspense>
    </div>
  );
}

async function ReportingContent({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate: Date | null;
  endDate: Date;
}) {
  // Fetch all data in parallel
  const [
    matchedBets,
    openExposureData,
    bookmakerData,
    exchangeData,
    promoData,
    bookmakerWithBonuses,
    totalBonuses,
    balanceSnapshots,
  ] = await Promise.all([
    getMatchedBetsForReporting({
      userId,
      startDate,
      endDate,
      statuses: ["settled"],
    }),
    getOpenExposure({ userId }),
    getProfitByBookmaker({ userId, startDate, endDate }),
    getProfitByExchange({ userId, startDate, endDate }),
    getProfitByPromoType({ userId, startDate, endDate }),
    getBookmakerProfitWithBonuses({ userId, startDate, endDate }),
    getTotalBonusesForUser({ userId, startDate, endDate }),
    getBalanceSnapshots({ userId, startDate: startDate ?? undefined, endDate }),
  ]);

  // Transform matched bets to the format expected by calculateReportingSummary
  const betsWithLegs: MatchedBetWithLegs[] = matchedBets.map((row) => ({
    matched: row.matched,
    back: row.back,
    lay: row.lay,
  }));

  // Calculate summary and cumulative profit data (all async for FX conversion)
  const [summary, dayChartData, weekChartData, monthChartData] =
    await Promise.all([
      calculateReportingSummary(
        betsWithLegs,
        openExposureData.totalExposure,
        totalBonuses
      ),
      calculateCumulativeProfitData(betsWithLegs, "day"),
      calculateCumulativeProfitData(betsWithLegs, "week"),
      calculateCumulativeProfitData(betsWithLegs, "month"),
    ]);

  // Generate balance chart data from snapshots (grouped by day/week/month)
  const balanceDayChartData = snapshotsToBalanceData(balanceSnapshots, "day");
  const balanceWeekChartData = snapshotsToBalanceData(balanceSnapshots, "week");
  const balanceMonthChartData = snapshotsToBalanceData(
    balanceSnapshots,
    "month"
  );

  // Enrich breakdown data with ROI
  const bookmakerBreakdown = enrichWithROI(
    bookmakerData.map((row) => ({
      name: row.accountName,
      count: row.count,
      totalProfitLoss: row.totalProfitLoss,
      totalStake: row.totalStake,
    }))
  );

  const exchangeBreakdown = enrichWithROI(
    exchangeData.map((row) => ({
      name: row.accountName,
      count: row.count,
      totalProfitLoss: row.totalProfitLoss,
      totalStake: row.totalStake,
    }))
  );

  const promoBreakdown = enrichWithROI(
    promoData.map((row) => ({
      name: row.promoType,
      count: row.count,
      totalProfitLoss: row.totalProfitLoss,
      totalStake: row.totalStake,
    }))
  );

  return (
    <div className="space-y-6">
      <ReportingSummaryCard summary={summary} />

      <ProfitChartWithControls
        dayData={dayChartData}
        monthData={monthChartData}
        title="Cumulative Profit"
        weekData={weekChartData}
      />

      <BalanceChartWithControls
        dayData={balanceDayChartData}
        monthData={balanceMonthChartData}
        title="Cumulative Total Balance"
        weekData={balanceWeekChartData}
      />

      {/* Performance Breakdown Charts - show matched set profit by category */}
      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownChartWithToggle
          data={promoBreakdown}
          emptyMessage="No promo data"
          title="Profit by Strategy"
        />
        <BreakdownChartWithToggle
          data={bookmakerBreakdown}
          emptyMessage="No bookmaker data"
          title="Profit by Bookmaker"
        />
      </div>

      <BookmakerProfitWithBonusesTable
        data={bookmakerWithBonuses}
        emptyMessage="No bookmaker data. Settle bets or add bonus transactions to see performance."
      />

      {/* Detailed breakdown tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ReportingBreakdownTable
          data={promoBreakdown}
          emptyMessage="No settled matched bets"
          title="By Strategy"
        />
        <ReportingBreakdownTable
          data={exchangeBreakdown}
          emptyMessage="No settled matched bets"
          title="By Exchange"
        />
      </div>
    </div>
  );
}

function FilterSkeleton() {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton className="h-8 w-24" key={i} />
      ))}
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton className="h-24" key={i} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}
