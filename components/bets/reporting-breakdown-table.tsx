import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNOK, formatPercentage } from "@/lib/reporting";
import { cn } from "@/lib/utils";

type BreakdownRow = {
  name: string;
  count: number;
  totalProfitLoss: number;
  totalStake: number;
  roi: number;
};

type Props = {
  title: string;
  data: BreakdownRow[];
  emptyMessage?: string;
  className?: string;
};

export function ReportingBreakdownTable({
  title,
  data,
  emptyMessage = "No data available",
  className,
}: Props) {
  // Sort by profit descending
  const sorted = [...data].sort(
    (a, b) => b.totalProfitLoss - a.totalProfitLoss
  );

  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      <div className="border-b px-4 py-3">
        <h3 className="font-semibold text-lg">{title}</h3>
      </div>
      {sorted.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground text-sm">
          {emptyMessage}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Bets</TableHead>
              <TableHead className="text-right">Stake</TableHead>
              <TableHead className="text-right">Profit/Loss</TableHead>
              <TableHead className="text-right">ROI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-right">{row.count}</TableCell>
                <TableCell className="text-right">
                  {formatNOK(row.totalStake)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium",
                    row.totalProfitLoss >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                  )}
                >
                  {formatNOK(row.totalProfitLoss)}
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
      )}
    </div>
  );
}
