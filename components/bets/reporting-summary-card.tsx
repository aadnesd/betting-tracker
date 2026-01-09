"use client";

import { cn } from "@/lib/utils";
import type { ReportingSummary } from "@/lib/reporting";
import { formatNOK, formatPercentage } from "@/lib/reporting";

type Props = {
  summary: ReportingSummary;
  className?: string;
};

export function ReportingSummaryCard({ summary, className }: Props) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-4", className)}>
      <StatCard
        title="Net Profit"
        value={formatNOK(summary.netProfit)}
        trend={summary.netProfit >= 0 ? "positive" : "negative"}
        subtitle={`${summary.settledCount} settled bets`}
      />
      <StatCard
        title="Total Stake"
        value={formatNOK(summary.totalStake)}
        subtitle="Total wagered"
      />
      <StatCard
        title="ROI"
        value={formatPercentage(summary.roi)}
        trend={summary.roi >= 0 ? "positive" : "negative"}
        subtitle="Return on investment"
      />
      <StatCard
        title="Open Exposure"
        value={formatNOK(summary.openExposure)}
        trend={summary.openExposure > 0 ? "negative" : "neutral"}
        subtitle="Current risk"
      />
    </div>
  );
}

type StatCardProps = {
  title: string;
  value: string;
  trend?: "positive" | "negative" | "neutral";
  subtitle?: string;
};

function StatCard({ title, value, trend = "neutral", subtitle }: StatCardProps) {
  const trendColors = {
    positive: "text-emerald-600",
    negative: "text-rose-600",
    neutral: "text-slate-900 dark:text-slate-100",
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="font-medium text-muted-foreground text-sm">{title}</p>
      <p className={cn("mt-1 font-bold text-2xl", trendColors[trend])}>
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-muted-foreground text-xs">{subtitle}</p>
      )}
    </div>
  );
}
