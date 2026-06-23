"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { Badge } from "@/components/ui/badge";
import type { MatchedBetListItem } from "@/lib/db/queries";
import { formatCurrency } from "@/lib/reporting";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "medium",
  }).format(new Date(date));
}

export function AccountBetHistory({
  bets,
  accountId,
}: {
  bets: MatchedBetListItem[];
  accountId: string;
}) {
  if (bets.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p className="mb-2">No bets recorded for this account yet</p>
        <p className="text-sm">Bets placed at this account will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bets.map((bet) => {
        const isBack = bet.back?.accountId === accountId;
        const isLay = bet.lay?.accountId === accountId;
        const leg = isBack ? bet.back : bet.lay;
        const role = isBack && isLay ? "Both" : isBack ? "Back" : "Lay";

        return (
          <Link
            className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
            href={`/bets/${bet.id}`}
            key={bet.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{bet.selection}</span>
                  <BetStatusBadge status={bet.status} />
                  <Badge className="text-xs" variant="outline">
                    {role}
                  </Badge>
                  {bet.promoType && (
                    <Badge
                      className="border-purple-200 bg-purple-50 text-purple-700 text-xs"
                      variant="outline"
                    >
                      {bet.promoType}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 truncate text-muted-foreground text-sm">
                  {bet.market}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
                  <span>{formatDate(bet.createdAt)}</span>
                  {leg && (
                    <>
                      <span>Odds: {leg.odds.toFixed(2)}</span>
                      <span>
                        Stake:{" "}
                        {formatCurrency(leg.stake, leg.currency ?? "NOK")}
                      </span>
                    </>
                  )}
                  {bet.back && bet.lay && (
                    <span>
                      Back {bet.back.odds.toFixed(2)} / Lay{" "}
                      {bet.lay.odds.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {bet.outcomePreview && bet.status !== "settled" && (
                  <div className="text-right text-xs">
                    <div className="text-emerald-600">
                      +
                      {formatCurrency(
                        bet.outcomePreview.profitIfBackWins,
                        "NOK"
                      )}
                    </div>
                    <div className="text-rose-600">
                      {formatCurrency(
                        bet.outcomePreview.profitIfLayWins,
                        "NOK"
                      )}
                    </div>
                  </div>
                )}
                {bet.status === "settled" &&
                  leg?.profitLoss !== null &&
                  leg?.profitLoss !== undefined && (
                    <span
                      className={`font-semibold text-sm ${
                        leg.profitLoss >= 0
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }`}
                    >
                      {leg.profitLoss >= 0 ? "+" : ""}
                      {formatCurrency(leg.profitLoss, leg.currency ?? "NOK")}
                    </span>
                  )}
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
