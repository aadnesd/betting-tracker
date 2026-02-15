"use client";

import { format } from "date-fns";
import { AlertTriangle, Calendar, Target, Trophy } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ExposureByEvent } from "@/lib/db/queries";
import { formatNOK } from "@/lib/reporting";
import { cn } from "@/lib/utils";

interface ExposureByEventCardProps {
  exposureData: ExposureByEvent[];
  /** Optional threshold to highlight high exposure events */
  warningThreshold?: number;
}

/**
 * Dashboard card showing open exposure grouped by football match/event.
 *
 * Why: Users may have multiple bets on the same match (e.g., Match Odds + Over 2.5)
 * and need to see their total exposure to that single event for risk management.
 * The reporting spec requires "Net exposure per event and per day."
 */
export function ExposureByEventCard({
  exposureData,
  warningThreshold = 5000,
}: ExposureByEventCardProps) {
  const hasExposure = exposureData.length > 0;
  const totalExposure = exposureData.reduce(
    (sum, e) => sum + e.totalExposure,
    0
  );
  const highExposureEvents = exposureData.filter(
    (e) => e.totalExposure >= warningThreshold
  );

  // Separate linked and unlinked bets
  const linkedEvents = exposureData.filter((e) => e.match !== null);
  const unlinkedBets = exposureData.find((e) => e.match === null);

  return (
    <Card className={cn(highExposureEvents.length > 0 && "border-amber-200")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "rounded-full p-2",
                highExposureEvents.length > 0
                  ? "bg-amber-100"
                  : hasExposure
                    ? "bg-blue-100"
                    : "bg-gray-100"
              )}
            >
              <Target
                className={cn(
                  "h-4 w-4",
                  highExposureEvents.length > 0
                    ? "text-amber-600"
                    : hasExposure
                      ? "text-blue-600"
                      : "text-gray-400"
                )}
              />
            </div>
            <div>
              <CardTitle className="text-base">Exposure by Event</CardTitle>
              <p className="text-muted-foreground text-xs">
                {linkedEvents.length} event
                {linkedEvents.length !== 1 ? "s" : ""} • Total:{" "}
                {formatNOK(totalExposure)}
              </p>
            </div>
          </div>
          {highExposureEvents.length > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-amber-700 text-xs">
              <AlertTriangle className="h-3 w-3" />
              <span>{highExposureEvents.length} high</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasExposure ? (
          <>
            {/* Linked events (with match info) */}
            {linkedEvents.length > 0 && (
              <div className="space-y-2">
                {linkedEvents.map((event) => (
                  <EventRow
                    event={event}
                    isHighExposure={event.totalExposure >= warningThreshold}
                    key={event.matchId}
                  />
                ))}
              </div>
            )}

            {/* Unlinked bets (no match assigned) */}
            {unlinkedBets && unlinkedBets.betCount > 0 && (
              <>
                {linkedEvents.length > 0 && <Separator className="my-3" />}
                <div className="rounded-md border border-dashed bg-muted/20 p-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-muted-foreground text-sm">
                          Unlinked Bets
                        </span>
                        <span className="text-muted-foreground text-xs">
                          ({unlinkedBets.betCount} bet
                          {unlinkedBets.betCount !== 1 ? "s" : ""})
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Bets not linked to a football match
                      </p>
                    </div>
                    <span
                      className={cn(
                        "font-semibold text-sm",
                        unlinkedBets.totalExposure >= warningThreshold
                          ? "text-amber-600"
                          : "text-gray-600"
                      )}
                    >
                      {formatNOK(unlinkedBets.totalExposure)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="py-6 text-center">
            <Target className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 font-medium text-muted-foreground text-sm">
              No open exposure
            </p>
            <p className="text-muted-foreground text-xs">
              All positions are settled
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EventRow({
  event,
  isHighExposure,
}: {
  event: ExposureByEvent;
  isHighExposure: boolean;
}) {
  if (!event.match) return null;

  const matchDate = new Date(event.match.matchDate);
  const isLive =
    event.match.status === "IN_PLAY" || event.match.status === "PAUSED";
  const isFinished = event.match.status === "FINISHED";

  // Link to the first bet if only one, otherwise could link to filtered bet list
  const betLink = event.betCount === 1 ? `/bets/${event.betIds[0]}` : undefined;

  const content = (
    <div
      className={cn(
        "rounded-md border p-3 transition-colors",
        isHighExposure && "border-amber-200 bg-amber-50/30",
        betLink && "hover:bg-muted/50"
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold text-sm">
              {event.match.homeTeam} vs {event.match.awayTeam}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <span>{event.match.competition}</span>
            <Separator className="h-3" orientation="vertical" />
            <Calendar className="h-3 w-3" />
            <span>{format(matchDate, "EEE dd MMM, HH:mm")}</span>
            <MatchStatusBadge status={event.match.status} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div
              className={cn(
                "font-semibold text-sm",
                isHighExposure ? "text-amber-600" : "text-gray-900"
              )}
            >
              {formatNOK(event.totalExposure)}
            </div>
            <div className="text-muted-foreground text-xs">
              {event.betCount} bet{event.betCount !== 1 ? "s" : ""}
            </div>
          </div>
          {event.promoTypes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {event.promoTypes.slice(0, 2).map((promo) => (
                <span
                  className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-700 text-xs"
                  key={promo}
                >
                  {promo}
                </span>
              ))}
              {event.promoTypes.length > 2 && (
                <span className="text-muted-foreground text-xs">
                  +{event.promoTypes.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (betLink) {
    return <Link href={betLink}>{content}</Link>;
  }

  return content;
}

function MatchStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    SCHEDULED: { label: "Scheduled", className: "bg-gray-100 text-gray-700" },
    TIMED: { label: "Scheduled", className: "bg-gray-100 text-gray-700" },
    IN_PLAY: {
      label: "Live",
      className: "bg-red-100 text-red-700 animate-pulse",
    },
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
