"use client";

import { format } from "date-fns";
import {
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { PendingSettlementBet } from "@/lib/db/queries";
import { formatNOK } from "@/lib/reporting";
import { cn } from "@/lib/utils";

export type SettlementFilter = "today" | "thisWeek" | "all";

interface PendingSettlementCardProps {
  bets: PendingSettlementBet[];
  totalCount: number;
  filter?: SettlementFilter;
}

/**
 * Dashboard widget showing matched bets awaiting settlement.
 * Groups bets by match date and provides quick-settle actions.
 *
 * Why: Streamlines the settlement workflow by showing all bets
 * ready to be settled with linked match information.
 */
export function PendingSettlementCard({
  bets,
  totalCount,
  filter = "all",
}: PendingSettlementCardProps) {
  const [activeFilter, setActiveFilter] = useState<SettlementFilter>(filter);

  const hasPending = bets.length > 0;

  // Group bets by date (match date if available, otherwise creation date)
  const groupedBets = groupBetsByDate(bets);

  return (
    <Card className={cn(hasPending && "border-blue-200")}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "rounded-full p-2",
                hasPending ? "bg-blue-100" : "bg-gray-100"
              )}
            >
              <Clock
                className={cn(
                  "h-4 w-4",
                  hasPending ? "text-blue-600" : "text-gray-400"
                )}
              />
            </div>
            <div>
              <CardTitle className="text-base">Pending Settlement</CardTitle>
              <p className="text-muted-foreground text-xs">
                {totalCount} bet{totalCount !== 1 ? "s" : ""} awaiting
                settlement
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <FilterButton
              active={activeFilter === "today"}
              label="Today"
              onClick={() => setActiveFilter("today")}
            />
            <FilterButton
              active={activeFilter === "thisWeek"}
              label="This Week"
              onClick={() => setActiveFilter("thisWeek")}
            />
            <FilterButton
              active={activeFilter === "all"}
              label="All"
              onClick={() => setActiveFilter("all")}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {bets.length === 0 ? (
          <div className="py-6 text-center">
            <CheckCircle className="mx-auto h-8 w-8 text-green-500" />
            <p className="mt-2 font-medium text-muted-foreground text-sm">
              No bets pending settlement
            </p>
            <p className="text-muted-foreground text-xs">
              All matched bets have been settled
            </p>
          </div>
        ) : (
          <>
            {Object.entries(groupedBets).map(([dateKey, dateBets]) => (
              <div key={dateKey}>
                <div className="mb-2 flex items-center gap-2">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    {dateKey}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    ({dateBets.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {dateBets.map((bet) => (
                    <PendingBetRow bet={bet} key={bet.id} />
                  ))}
                </div>
                <Separator className="mt-3" />
              </div>
            ))}
            {bets.length < totalCount && (
              <div className="pt-2 text-center">
                <Button asChild size="sm" variant="link">
                  <Link href="/bets?status=matched">
                    View all {totalCount} pending bets →
                  </Link>
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      className="h-7 px-2 text-xs"
      onClick={onClick}
      size="sm"
      variant={active ? "default" : "ghost"}
    >
      {label}
    </Button>
  );
}

function PendingBetRow({ bet }: { bet: PendingSettlementBet }) {
  const hasMatch = bet.footballMatch !== null;
  const isMatchFinished = bet.footballMatch?.status === "FINISHED";

  return (
    <Link
      className={cn(
        "block rounded-md border p-3 transition-colors hover:bg-muted/50",
        isMatchFinished && "border-green-200 bg-green-50/30"
      )}
      href={`/bets/${bet.id}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{bet.selection}</span>
            <Separator className="h-4" orientation="vertical" />
            <span className="text-muted-foreground text-xs">{bet.market}</span>
          </div>
          {hasMatch ? (
            <div className="flex items-center gap-2 text-xs">
              <Trophy className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">
                {bet.footballMatch!.homeTeam} vs {bet.footballMatch!.awayTeam}
              </span>
              {isMatchFinished && bet.footballMatch!.homeScore !== null && (
                <span className="font-semibold text-green-600">
                  ({bet.footballMatch!.homeScore} -{" "}
                  {bet.footballMatch!.awayScore})
                </span>
              )}
              <MatchStatusBadge status={bet.footballMatch!.status} />
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              Created {format(new Date(bet.createdAt), "dd MMM yyyy, HH:mm")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {bet.netExposure && (
            <span
              className={cn(
                "font-medium text-sm",
                Number(bet.netExposure) >= 0
                  ? "text-green-600"
                  : "text-amber-600"
              )}
            >
              {formatNOK(Number(bet.netExposure))}
            </span>
          )}
          {bet.promoType && (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-700 text-xs">
              {bet.promoType}
            </span>
          )}
          {isMatchFinished && (
            <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-green-700 text-xs">
              <CheckCircle className="h-3 w-3" />
              Ready
            </span>
          )}
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </Link>
  );
}

function MatchStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    SCHEDULED: { label: "Scheduled", className: "bg-gray-100 text-gray-700" },
    TIMED: { label: "Scheduled", className: "bg-gray-100 text-gray-700" },
    IN_PLAY: { label: "Live", className: "bg-red-100 text-red-700" },
    PAUSED: { label: "Paused", className: "bg-amber-100 text-amber-700" },
    FINISHED: { label: "Finished", className: "bg-green-100 text-green-700" },
    POSTPONED: { label: "Postponed", className: "bg-amber-100 text-amber-700" },
    SUSPENDED: { label: "Suspended", className: "bg-amber-100 text-amber-700" },
    CANCELLED: { label: "Cancelled", className: "bg-red-100 text-red-700" },
  };

  const config = statusConfig[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-700",
  };

  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs", config.className)}>
      {config.label}
    </span>
  );
}

/**
 * Group bets by date for display.
 * Uses match date if available, otherwise falls back to creation date.
 */
function groupBetsByDate(
  bets: PendingSettlementBet[]
): Record<string, PendingSettlementBet[]> {
  const groups: Record<string, PendingSettlementBet[]> = {};

  for (const bet of bets) {
    const date = bet.footballMatch?.matchDate ?? bet.createdAt;
    const dateKey = formatDateGroupLabel(new Date(date));

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(bet);
  }

  return groups;
}

function formatDateGroupLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateNormalized = new Date(date);
  dateNormalized.setHours(0, 0, 0, 0);

  if (dateNormalized.getTime() === today.getTime()) {
    return "Today";
  }
  if (dateNormalized.getTime() === tomorrow.getTime()) {
    return "Tomorrow";
  }
  if (dateNormalized.getTime() === yesterday.getTime()) {
    return "Yesterday";
  }

  return format(date, "EEEE, dd MMM yyyy");
}
