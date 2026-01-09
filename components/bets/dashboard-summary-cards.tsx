import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Clock,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { formatNOK, formatPercentage } from "@/lib/reporting";
import { cn } from "@/lib/utils";

export interface DashboardSummaryProps {
  totalProfit: number;
  settledCount: number;
  openExposure: number;
  openPositions: number;
  pendingReviewCount: number;
  recentActivityCount: number;
  roi: number;
}

/**
 * Dashboard summary cards showing key metrics at a glance:
 * - Total profit/loss with ROI
 * - Open exposure with position count
 * - Pending reviews
 * - Recent activity (7 days)
 */
export function DashboardSummaryCards({
  totalProfit,
  settledCount,
  openExposure,
  openPositions,
  pendingReviewCount,
  recentActivityCount,
  roi,
}: DashboardSummaryProps) {
  const isProfitable = totalProfit >= 0;
  const hasExposure = openExposure > 0;
  const hasPending = pendingReviewCount > 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total Profit */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "rounded-full p-2",
                  isProfitable ? "bg-green-100" : "bg-red-100"
                )}
              >
                <DollarSign
                  className={cn(
                    "h-4 w-4",
                    isProfitable ? "text-green-600" : "text-red-600"
                  )}
                />
              </div>
              <span className="font-medium text-muted-foreground text-sm">
                Total Profit
              </span>
            </div>
            {roi !== 0 && (
              <span
                className={cn(
                  "flex items-center text-xs font-medium",
                  isProfitable ? "text-green-600" : "text-red-600"
                )}
              >
                <TrendingUp className="mr-0.5 h-3 w-3" />
                {formatPercentage(roi)}
              </span>
            )}
          </div>
          <div className="mt-3">
            <p
              className={cn(
                "text-2xl font-bold",
                isProfitable ? "text-green-600" : "text-red-600"
              )}
            >
              {formatNOK(totalProfit)}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              From {settledCount} settled bet{settledCount !== 1 ? "s" : ""}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Open Exposure */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "rounded-full p-2",
                  hasExposure ? "bg-amber-100" : "bg-gray-100"
                )}
              >
                <BarChart3
                  className={cn(
                    "h-4 w-4",
                    hasExposure ? "text-amber-600" : "text-gray-400"
                  )}
                />
              </div>
              <span className="font-medium text-muted-foreground text-sm">
                Open Exposure
              </span>
            </div>
          </div>
          <div className="mt-3">
            <p
              className={cn(
                "text-2xl font-bold",
                hasExposure ? "text-amber-600" : "text-muted-foreground"
              )}
            >
              {formatNOK(openExposure)}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              {openPositions} open position{openPositions !== 1 ? "s" : ""}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Pending Reviews */}
      <Link href="/bets/review">
        <Card
          className={cn(
            "transition-colors hover:bg-muted/50",
            hasPending && "border-amber-200 bg-amber-50/50"
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "rounded-full p-2",
                    hasPending ? "bg-amber-100" : "bg-gray-100"
                  )}
                >
                  <AlertTriangle
                    className={cn(
                      "h-4 w-4",
                      hasPending ? "text-amber-600" : "text-gray-400"
                    )}
                  />
                </div>
                <span className="font-medium text-muted-foreground text-sm">
                  Pending Review
                </span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3">
              <p
                className={cn(
                  "text-2xl font-bold",
                  hasPending ? "text-amber-600" : "text-muted-foreground"
                )}
              >
                {pendingReviewCount}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {hasPending
                  ? "Items need your attention"
                  : "All caught up!"}
              </p>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Recent Activity */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-blue-100 p-2">
                <Clock className="h-4 w-4 text-blue-600" />
              </div>
              <span className="font-medium text-muted-foreground text-sm">
                Recent Activity
              </span>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-blue-600">
              {recentActivityCount}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              Bets in the last 7 days
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
