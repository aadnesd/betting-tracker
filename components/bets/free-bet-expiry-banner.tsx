"use client";

import { AlertTriangle, Gift } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = {
  /** Number of free bets expiring within the threshold period */
  expiringCount: number;
  /** Total value of expiring free bets (optional) */
  totalValue?: number;
  /** Currency for the total value (optional) */
  currency?: string;
  /** Days until expiry threshold (default 7) */
  daysThreshold?: number;
  /** Custom className */
  className?: string;
};

/**
 * Banner that alerts users when they have free bets expiring soon.
 * Links to the promos page filtered to show only expiring bets.
 * Why: Prevents missed free bets by providing visibility into upcoming expirations.
 */
export function FreeBetExpiryBanner({
  expiringCount,
  totalValue,
  currency = "GBP",
  daysThreshold = 7,
  className,
}: Props) {
  // Don't render if no expiring free bets
  if (expiringCount === 0) {
    return null;
  }

  const isUrgent = expiringCount >= 3;

  return (
    <Alert
      variant={isUrgent ? "destructive" : "default"}
      className={className}
    >
      {isUrgent ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <Gift className="h-4 w-4" />
      )}
      <AlertTitle className="font-semibold">
        {isUrgent ? "Free bets expiring soon!" : "Free bet reminder"}
      </AlertTitle>
      <AlertDescription className="mt-1 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <span>
          You have {expiringCount} free bet{expiringCount !== 1 ? "s" : ""}{" "}
          expiring within {daysThreshold} days
          {totalValue !== undefined &&
            totalValue > 0 &&
            ` worth ${currency} ${totalValue.toFixed(2)}`}
          . Use them before they expire to maximize value.
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href="/bets/settings/promos?filter=expiring">
            View expiring
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
