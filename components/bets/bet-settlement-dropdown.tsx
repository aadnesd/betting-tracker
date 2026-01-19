"use client";

import { Check, Loader2, X, Minus } from "lucide-react";
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

type Outcome = "won" | "lost" | "push";

interface BetSettlementDropdownProps {
  betId: string;
  betKind: "back" | "lay";
  odds: number;
  stake: number;
  currency: string;
  selection: string;
  /** Exchange commission rate for lay bets (e.g., 0.05 for 5%). Defaults to 0. */
  commissionRate?: number;
}

/**
 * Calculate potential P&L for display in dropdown.
 * For lay bets, commission is deducted from winning profits.
 */
function calculatePotentialPL(
  kind: "back" | "lay",
  outcome: Outcome,
  stake: number,
  odds: number,
  commissionRate = 0
): number {
  switch (outcome) {
    case "won":
      // For back bet: win = stake × (odds - 1)
      // For lay bet: win = stake × (1 - commission) (backer loses stake, exchange takes commission)
      if (kind === "back") {
        return stake * (odds - 1);
      }
      // Lay bet win: profit minus commission
      const grossProfit = stake;
      return grossProfit * (1 - commissionRate);
    case "lost":
      // For back bet: lose stake
      // For lay bet: lose = stake × (odds - 1) (pay out winnings, no commission on losses)
      return kind === "back" ? -stake : -stake * (odds - 1);
    case "push":
      return 0;
  }
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

  const wonPL = calculatePotentialPL(betKind, "won", stake, odds, commissionRate);
  const lostPL = calculatePotentialPL(betKind, "lost", stake, odds, commissionRate);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isSettling}>
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
          onClick={() => handleSettle("won")}
          className="flex items-center justify-between gap-4"
        >
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600" />
            Won
          </span>
          <span className="text-xs text-emerald-600">{formatPL(wonPL, currency)}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSettle("lost")}
          className="flex items-center justify-between gap-4"
        >
          <span className="flex items-center gap-2">
            <X className="h-4 w-4 text-rose-600" />
            Lost
          </span>
          <span className="text-xs text-rose-600">{formatPL(lostPL, currency)}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSettle("push")}
          className="flex items-center justify-between gap-4"
        >
          <span className="flex items-center gap-2">
            <Minus className="h-4 w-4 text-muted-foreground" />
            Push
          </span>
          <span className="text-xs text-muted-foreground">±0.00</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
