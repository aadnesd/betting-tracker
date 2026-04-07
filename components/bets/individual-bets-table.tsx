import { format } from "date-fns";
import Link from "next/link";
import { BetSettlementDropdown } from "@/components/bets/bet-settlement-dropdown";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { IndividualBetListItem } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

type IndividualBetsTableProps = {
  bets: IndividualBetListItem[];
};

function formatAmount(amount: number | null, currency: string | null) {
  if (amount === null) {
    return "—";
  }

  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return currency ? `${formatted} ${currency}` : formatted;
}

function formatOdds(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function IndividualBetsTable({ bets }: IndividualBetsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Market / Selection</TableHead>
          <TableHead>Odds / Stake</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>P/L</TableHead>
          <TableHead>Placed</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bets.map((bet) => {
          const displayDate = bet.placedAt ?? bet.createdAt;
          const accountLabel = bet.accountName ?? bet.exchange;
          const accountKind =
            bet.accountKind ?? (bet.kind === "back" ? "bookmaker" : "exchange");
          const profitClassName = bet.profitLoss
            ? bet.profitLoss >= 0
              ? "text-emerald-600"
              : "text-rose-600"
            : "text-muted-foreground";

          return (
            <TableRow key={`${bet.kind}-${bet.id}`}>
              <TableCell>
                <Badge
                  className={cn(
                    "border px-2 py-0.5 text-xs",
                    bet.kind === "back"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-rose-200 bg-rose-50 text-rose-700"
                  )}
                  variant="outline"
                >
                  {bet.kind === "back" ? "Back" : "Lay"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="font-medium text-sm">{accountLabel}</div>
                  <div className="text-muted-foreground text-xs">
                    {accountKind}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="font-medium text-sm">{bet.selection}</div>
                  <div className="text-muted-foreground text-xs">
                    {bet.market}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1 text-sm">
                  <div className="font-medium">{formatOdds(bet.odds)}</div>
                  <div className="text-muted-foreground text-xs">
                    {formatAmount(bet.stake, bet.currency)}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <BetStatusBadge status={bet.status} />
              </TableCell>
              <TableCell className={cn("text-sm", profitClassName)}>
                {bet.status === "settled"
                  ? formatAmount(bet.profitLoss ?? 0, bet.currency)
                  : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {format(displayDate, "dd MMM yyyy, HH:mm")}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/bets/${bet.kind}/${bet.id}`}>View</Link>
                  </Button>
                  {bet.status !== "settled" && (
                    <BetSettlementDropdown
                      betId={bet.id}
                      betKind={bet.kind}
                      commissionRate={
                        bet.kind === "lay" ? (bet.accountCommission ?? 0) : 0
                      }
                      currency={bet.currency ?? "NOK"}
                      odds={bet.odds}
                      selection={bet.selection}
                      stake={bet.stake}
                    />
                  )}
                  {bet.matchedBetId && (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/bets/${bet.matchedBetId}`}>Matched</Link>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
