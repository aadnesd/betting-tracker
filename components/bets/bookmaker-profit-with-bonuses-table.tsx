import { Gift } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BookmakerProfitWithBonuses } from "@/lib/db/queries";
import { formatNOK, formatPercentage } from "@/lib/reporting";
import { cn } from "@/lib/utils";

type Props = {
  data: BookmakerProfitWithBonuses[];
  emptyMessage?: string;
  className?: string;
};

/**
 * Displays bookmaker profit/loss including bonus transactions.
 * Shows betting profit, bonus amounts, combined total, and ROI.
 * Helps identify which bookmaker reward programs provide the best value.
 */
export function BookmakerProfitWithBonusesTable({
  data,
  emptyMessage = "No bookmaker data available",
  className,
}: Props) {
  // Already sorted by totalProfit descending from the query
  const sorted = data;

  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      <div className="border-b px-4 py-3">
        <h3 className="font-semibold text-lg">Bookmaker Performance</h3>
        <p className="text-muted-foreground text-sm">
          Matched-betting efficiency from pre-settlement exposure plus bonus impact
        </p>
      </div>
      {sorted.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground text-sm">
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bookmaker</TableHead>
                <TableHead className="text-right">Matched Sets</TableHead>
                <TableHead className="text-right">Stake</TableHead>
                <TableHead className="text-right">Net P/L</TableHead>
                <TableHead className="text-right">Match ROI</TableHead>
                <TableHead className="text-right">Retention</TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1">
                    <Gift className="h-3.5 w-3.5" />
                    Bonuses
                  </span>
                </TableHead>
                <TableHead className="text-right">Total Profit</TableHead>
                <TableHead className="text-right">Avg Exposure / Set</TableHead>
                <TableHead className="text-right">ROI incl. Bonus</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell className="font-medium">
                    {row.accountName}
                  </TableCell>
                  <TableCell className="text-right">{row.betCount}</TableCell>
                  <TableCell className="text-right">
                    {formatNOK(row.totalStake)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      row.bettingProfit >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                    )}
                  >
                    {formatNOK(row.bettingProfit)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      row.bettingRoi >= 0 ? "text-emerald-600" : "text-rose-600"
                    )}
                  >
                    {formatPercentage(row.bettingRoi)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium",
                      row.retentionPct >= 99
                        ? "text-emerald-600"
                        : row.retentionPct >= 98
                          ? "text-amber-600"
                          : "text-rose-600"
                    )}
                  >
                    {`${row.retentionPct.toFixed(2)}%`}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      row.bonusTotal > 0
                        ? "text-blue-600"
                        : "text-muted-foreground"
                    )}
                  >
                    {row.bonusTotal > 0 ? formatNOK(row.bonusTotal) : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-semibold",
                      row.totalProfit >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                    )}
                  >
                    {formatNOK(row.totalProfit)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      row.avgNetExposurePerSet >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                    )}
                  >
                    {row.betCount > 0
                      ? formatNOK(row.avgNetExposurePerSet)
                      : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      row.roi >= 0 ? "text-emerald-600" : "text-rose-600"
                    )}
                  >
                    {formatPercentage(row.roi)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Summary footer */}
      {sorted.length > 0 && (
        <div className="border-t bg-muted/50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">
              {sorted.length} bookmaker{sorted.length !== 1 ? "s" : ""}
            </span>
            <div className="flex gap-6">
              <span>
                <span className="text-muted-foreground">Net P/L: </span>
                <span
                  className={cn(
                    "font-medium",
                    sorted.reduce((sum, r) => sum + r.bettingProfit, 0) >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                  )}
                >
                  {formatNOK(
                    sorted.reduce((sum, r) => sum + r.bettingProfit, 0)
                  )}
                </span>
              </span>
              <span>
                <span className="text-muted-foreground">Total Bonuses: </span>
                <span className="font-medium text-blue-600">
                  {formatNOK(sorted.reduce((sum, r) => sum + r.bonusTotal, 0))}
                </span>
              </span>
              <span>
                <span className="text-muted-foreground">Combined: </span>
                <span
                  className={cn(
                    "font-semibold",
                    sorted.reduce((sum, r) => sum + r.totalProfit, 0) >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                  )}
                >
                  {formatNOK(sorted.reduce((sum, r) => sum + r.totalProfit, 0))}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
