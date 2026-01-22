"use client";

import { cn } from "@/lib/utils";
import type { ReportingSummary } from "@/lib/reporting";
import { formatNOK, formatPercentage } from "@/lib/reporting";
import {
  CalculationTooltip,
  type CalculationType,
} from "@/components/bets/calculation-tooltip";

type Props = {
  summary: ReportingSummary;
  className?: string;
};

export function ReportingSummaryCard({ summary, className }: Props) {
  const hasBonuses = summary.bonusTotal > 0;
  
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-5", className)}>
      <NetProfitCard summary={summary} hasBonuses={hasBonuses} />
      <StatCard
        title="Total Stake"
        value={formatNOK(summary.totalStake)}
        subtitle="Total wagered"
      />
      <StatCard
        title="Qualifying Loss"
        value={formatNOK(-summary.qualifyingLoss)}
        trend={summary.qualifyingLoss > 0 ? "negative" : "neutral"}
        subtitle="Cost to unlock offers"
        tooltipType="qualifyingLoss"
      />
      <StatCard
        title="ROI"
        value={formatPercentage(summary.roi)}
        trend={summary.roi >= 0 ? "positive" : "negative"}
        subtitle={hasBonuses ? "Includes bonuses" : "Return on investment"}
        tooltipType="roi"
      />
      <StatCard
        title="Open Exposure"
        value={formatNOK(summary.openExposure)}
        trend={summary.openExposure > 0 ? "negative" : "neutral"}
        subtitle="Current risk"
        tooltipType="netExposure"
      />
    </div>
  );
}

/**
 * Net Profit card with optional betting/bonus breakdown.
 * Shows breakdown when bonuses exist to make profit sources transparent.
 */
function NetProfitCard({ summary, hasBonuses }: { summary: ReportingSummary; hasBonuses: boolean }) {
  const trend = summary.netProfit >= 0 ? "positive" : "negative";
  const trendColors = {
    positive: "text-emerald-600",
    negative: "text-rose-600",
    neutral: "text-slate-900 dark:text-slate-100",
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="font-medium text-muted-foreground text-sm inline-flex items-center gap-1">
        Net Profit
      </p>
      <p className={cn("mt-1 font-bold text-2xl", trendColors[trend])}>
        {formatNOK(summary.netProfit)}
      </p>
      {hasBonuses ? (
        <div className="mt-1 space-y-0.5 text-muted-foreground text-xs">
          <div className="flex justify-between">
            <span>Betting P/L:</span>
            <span className={cn(summary.bettingProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
              {formatNOK(summary.bettingProfit)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Bonuses:</span>
            <span className="text-emerald-600">+{formatNOK(summary.bonusTotal)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-muted-foreground text-xs">
          {summary.settledCount} settled bets
        </p>
      )}
    </div>
  );
}

type StatCardProps = {
  title: string;
  value: string;
  trend?: "positive" | "negative" | "neutral";
  subtitle?: string;
  tooltipType?: CalculationType;
};

function StatCard({ title, value, trend = "neutral", subtitle, tooltipType }: StatCardProps) {
  const trendColors = {
    positive: "text-emerald-600",
    negative: "text-rose-600",
    neutral: "text-slate-900 dark:text-slate-100",
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="font-medium text-muted-foreground text-sm inline-flex items-center gap-1">
        {title}
        {tooltipType && <CalculationTooltip type={tooltipType} />}
      </div>
      <div className={cn("mt-1 font-bold text-2xl", trendColors[trend])}>
        {value}
      </div>
      {subtitle && (
        <div className="mt-1 text-muted-foreground text-xs">{subtitle}</div>
      )}
    </div>
  );
}
