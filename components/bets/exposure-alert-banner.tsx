"use client";

import { AlertTriangle, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatNOK } from "@/lib/reporting";

type Props = {
  /** Total exposure in NOK */
  totalExposure: number;
  /** Number of open positions */
  openPositions: number;
  /** Threshold above which to show warning */
  threshold?: number;
  /** Custom className */
  className?: string;
};

/**
 * Banner that alerts users when their open exposure exceeds a threshold.
 * Helps manage risk by providing visibility into total outstanding liability.
 */
export function ExposureAlertBanner({
  totalExposure,
  openPositions,
  threshold = 5000,
  className,
}: Props) {
  // Don't render if no open positions or exposure is below threshold
  if (openPositions === 0 || Math.abs(totalExposure) < threshold) {
    return null;
  }

  const isHighExposure = Math.abs(totalExposure) >= threshold * 2;

  return (
    <Alert
      className={className}
      variant={isHighExposure ? "destructive" : "default"}
    >
      {isHighExposure ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <TrendingUp className="h-4 w-4" />
      )}
      <AlertTitle className="font-semibold">
        {isHighExposure ? "High exposure warning" : "Exposure notice"}
      </AlertTitle>
      <AlertDescription className="mt-1 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <span>
          You have {formatNOK(Math.abs(totalExposure))} in open exposure across{" "}
          {openPositions} position{openPositions !== 1 ? "s" : ""}.
          {isHighExposure && " Consider settling or reducing your positions."}
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href="/bets/reports" prefetch={false}>
            View reports
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
