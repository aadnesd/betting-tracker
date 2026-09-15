"use client";

import { Check, Loader2, Minus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PredictionMarketExecution } from "@/lib/db/schema";
import { calculateLayProfitLoss, calculateProfitLoss } from "@/lib/settlement";

type Outcome = "won" | "lost" | "push";

type BetSettlementDropdownProps = {
  betId: string;
  betKind: "back" | "lay";
  odds: number;
  stake: number;
  currency: string;
  selection: string;
  /** Exchange commission rate for lay bets (e.g., 0.05 for 5%). Defaults to 0. */
  commissionRate?: number;
  predictionMarketSharePrice?: number | null;
  predictionMarketExecution?: PredictionMarketExecution | null;
};

/**
 * Calculate potential P&L for display in dropdown.
 */
function calculatePotentialPL(
  kind: "back" | "lay",
  outcome: Outcome,
  stake: number,
  odds: number,
  commissionRate = 0,
  predictionMarketSharePrice?: number | null,
  predictionMarketExecution?: PredictionMarketExecution | null
): number {
  const betOutcome =
    outcome === "won" ? "win" : outcome === "lost" ? "loss" : "push";
  if (kind === "lay") {
    const layOutcome =
      betOutcome === "win" ? "loss" : betOutcome === "loss" ? "win" : "push";
    return calculateLayProfitLoss(
      layOutcome,
      stake,
      odds,
      commissionRate,
      predictionMarketSharePrice == null
        ? null
        : {
            sharePrice: predictionMarketSharePrice,
            execution: predictionMarketExecution,
          }
    );
  }

  return calculateProfitLoss(betOutcome, stake, odds);
}

function formatPL(amount: number, currency: string): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}${amount.toFixed(2)} ${currency}`;
}

export function BetSettlementDropdown({
  betId,
  betKind,
  odds,
  stake,
  currency,
  selection,
  commissionRate = 0,
  predictionMarketSharePrice = null,
  predictionMarketExecution = null,
}: BetSettlementDropdownProps) {
  const router = useRouter();
  const [isSettling, setIsSettling] = useState(false);

  const handleSettle = async (outcome: Outcome) => {
    setIsSettling(true);

    try {
      const response = await fetch("/api/bets/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          betId,
          betKind,
          outcome,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to settle bet");
      }

      const pl = data.bet.profitLoss;
      const plFormatted = formatPL(pl, currency);

      toast.success(`Bet settled: ${outcome}`, {
        description: `${selection} — P&L: ${plFormatted}`,
      });

      router.refresh();
    } catch (error) {
      toast.error("Failed to settle bet", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSettling(false);
    }
  };

  const wonPL = calculatePotentialPL(
    betKind,
    "won",
    stake,
    odds,
    commissionRate,
    predictionMarketSharePrice,
    predictionMarketExecution
  );
  const lostPL = calculatePotentialPL(
    betKind,
    "lost",
    stake,
    odds,
    commissionRate,
    predictionMarketSharePrice,
    predictionMarketExecution
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={isSettling} size="sm" variant="outline">
          {isSettling ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Settling...
            </>
          ) : (
            "Settle"
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="flex items-center justify-between gap-4"
          onClick={() => handleSettle("won")}
        >
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600" />
            Won
          </span>
          <span className="text-emerald-600 text-xs">
            {formatPL(wonPL, currency)}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex items-center justify-between gap-4"
          onClick={() => handleSettle("lost")}
        >
          <span className="flex items-center gap-2">
            <X className="h-4 w-4 text-rose-600" />
            Lost
          </span>
          <span className="text-rose-600 text-xs">
            {formatPL(lostPL, currency)}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex items-center justify-between gap-4"
          onClick={() => handleSettle("push")}
        >
          <span className="flex items-center gap-2">
            <Minus className="h-4 w-4 text-muted-foreground" />
            Push
          </span>
          <span className="text-muted-foreground text-xs">±0.00</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
