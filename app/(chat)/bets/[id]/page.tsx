import { format } from "date-fns";
import {
  CalendarDays,
  Gift,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { ValueWithTooltip } from "@/components/bets/calculation-tooltip";
import { MatchedBetDetailActions } from "@/components/bets/matched-bet-detail-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { computeMatchedBetOutcomes } from "@/lib/bet-calculations";
import {
  getMatchedBetWithParts,
  listAuditEntriesByEntity,
} from "@/lib/db/queries";
import type {
  BackBet,
  FootballMatch,
  LayBet,
  ScreenshotUpload,
} from "@/lib/db/schema";
import { convertAmountToNok } from "@/lib/fx-rates";

export const metadata = {
  title: "Matched bet detail",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;

  const data = await getMatchedBetWithParts({ id, userId });

  if (!data) {
    notFound();
  }

  const {
    matched,
    back,
    lay,
    backScreenshot,
    layScreenshot,
    footballMatch,
    freeBet,
    layAccountCommission,
  } = data;

  // Fetch audit history for this matched bet
  const auditEntries = await listAuditEntriesByEntity({
    entityType: "matched_bet",
    entityId: matched.id,
    limit: 50,
  });

  // Detect mismatches
  const mismatches = detectMismatches(back, lay);

  // Calculate bet outcomes for display
  const isFreeBet = freeBet
    ? true
    : matched.promoType
      ? /free[\s_-]?bet/i.test(matched.promoType)
      : false;
  const freeBetStakeReturned = freeBet?.stakeReturned ?? false;

  let betOutcomes: {
    profitIfWins: number;
    profitIfLoses: number;
    guaranteedProfit: number;
    isFreeBet: boolean;
  } | null = null;

  if (back && lay) {
    const backStake = Number.parseFloat(back.stake);
    const backOdds = Number.parseFloat(back.odds);
    const layStake = Number.parseFloat(lay.stake);
    const layOdds = Number.parseFloat(lay.odds);
    const backCurrency = (back.currency ?? "NOK").toUpperCase();
    const layCurrency = (lay.currency ?? "NOK").toUpperCase();

    if (
      !Number.isNaN(backStake) &&
      !Number.isNaN(backOdds) &&
      !Number.isNaN(layStake) &&
      !Number.isNaN(layOdds)
    ) {
      const outcomes = computeMatchedBetOutcomes({
        backStake,
        backOdds,
        layStake,
        layOdds,
        isFreeBet,
        freeBetStakeReturned,
        commissionRate: layAccountCommission ?? 0,
      });

      // Convert to NOK for consistent display
      const [profitIfWinsNok, profitIfLosesNok] = await Promise.all([
        // profitIfWins = backProfit - layLiability
        // backProfit is in back currency, layLiability is in lay currency
        (async () => {
          const backProfitNok = await convertAmountToNok(
            outcomes.backProfit,
            backCurrency
          );
          const layLiabilityNok = await convertAmountToNok(
            outcomes.layLiability,
            layCurrency
          );
          return backProfitNok - layLiabilityNok;
        })(),
        // profitIfLoses = layStake * (1 - commission) (for free bet) or layStake * (1 - commission) - backStake
        (async () => {
          const commission = layAccountCommission ?? 0;
          const layWinNetNok = await convertAmountToNok(
            layStake * (1 - commission),
            layCurrency
          );
          if (isFreeBet) {
            return layWinNetNok; // No back stake lost
          }
          const backStakeNok = await convertAmountToNok(
            backStake,
            backCurrency
          );
          return layWinNetNok - backStakeNok;
        })(),
      ]);

      betOutcomes = {
        profitIfWins: profitIfWinsNok,
        profitIfLoses: profitIfLosesNok,
        guaranteedProfit: Math.min(profitIfWinsNok, profitIfLosesNok),
        isFreeBet,
      };
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Matched betting
          </p>
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-2xl">{matched.selection}</h1>
            <BetStatusBadge status={matched.status} />
          </div>
          <p className="text-muted-foreground text-sm">{matched.market}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/bets/review">← Review queue</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/bets">Dashboard</Link>
          </Button>
        </div>
      </div>

      {/* Mismatch alerts */}
      {mismatches.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 font-medium text-amber-800">⚠️ Issues detected</p>
          <ul className="space-y-1">
            {mismatches.map((issue, i) => (
              <li className="text-amber-700 text-sm" key={i}>
                • {issue.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary row */}
      <div className="flex flex-wrap gap-4">
        {/* Show both outcomes for free bets, otherwise just net exposure */}
        {betOutcomes && betOutcomes.isFreeBet ? (
          <>
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="flex items-center gap-1 text-muted-foreground text-xs uppercase tracking-wide">
                <Gift className="h-3 w-3 text-green-600" />
                Guaranteed profit
              </p>
              <p className="font-semibold text-green-700 text-lg">
                NOK {betOutcomes.guaranteedProfit.toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/50 px-4 py-3">
              <p className="flex items-center gap-1 text-muted-foreground text-xs uppercase tracking-wide">
                <TrendingUp className="h-3 w-3" />
                If selection wins
              </p>
              <p
                className={`font-semibold text-lg ${betOutcomes.profitIfWins >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                NOK {betOutcomes.profitIfWins.toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/50 px-4 py-3">
              <p className="flex items-center gap-1 text-muted-foreground text-xs uppercase tracking-wide">
                <TrendingDown className="h-3 w-3" />
                If selection loses
              </p>
              <p
                className={`font-semibold text-lg ${betOutcomes.profitIfLoses >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                NOK {betOutcomes.profitIfLoses.toFixed(2)}
              </p>
            </div>
          </>
        ) : (
          matched.netExposure && (
            <div className="rounded-lg border bg-muted/50 px-4 py-3">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                <ValueWithTooltip side="right" type="netExposure">
                  Net exposure
                </ValueWithTooltip>
              </p>
              <p className="font-semibold text-lg">
                NOK {Number(matched.netExposure).toFixed(2)}
              </p>
            </div>
          )
        )}
        {matched.promoType && (
          <div className="rounded-lg border bg-purple-50 px-4 py-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Promo type
            </p>
            <p className="font-semibold text-purple-800">{matched.promoType}</p>
          </div>
        )}
        <div className="rounded-lg border bg-muted/50 px-4 py-3">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Created
          </p>
          <p className="font-medium">
            {format(new Date(matched.createdAt), "dd MMM yyyy, HH:mm")}
          </p>
        </div>
      </div>

      {/* Linked Football Match */}
      {footballMatch && <MatchInfoCard match={footballMatch} />}

      {/* Two-column layout for back and lay */}
      <div className="grid gap-6 lg:grid-cols-2">
        <BetCard
          bet={back}
          label="Back bet"
          screenshot={backScreenshot}
          type="back"
        />
        <BetCard
          bet={lay}
          label="Lay bet"
          screenshot={layScreenshot}
          type="lay"
        />
      </div>

      {/* Notes */}
      {matched.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{matched.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <MatchedBetDetailActions
        currentStatus={matched.status}
        hasBothLegs={!!back && !!lay}
        matchedBetId={matched.id}
        mismatches={mismatches}
      />

      {/* Audit history */}
      <Card>
        <CardHeader>
          <CardTitle>Status history</CardTitle>
        </CardHeader>
        <CardContent>
          {auditEntries.length === 0 ? (
            <p className="text-muted-foreground text-sm">No history yet.</p>
          ) : (
            <ul className="space-y-3">
              {auditEntries.map((entry) => {
                const hasChanges =
                  entry.changes !== null && entry.changes !== undefined;
                return (
                  <li
                    className="flex items-start gap-3 border-muted border-l-2 pl-3"
                    key={entry.id}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {formatAction(entry.action)}
                      </p>
                      {entry.notes && (
                        <p className="text-muted-foreground text-sm">
                          {entry.notes}
                        </p>
                      )}
                      {hasChanges && (
                        <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-2 text-xs">
                          {JSON.stringify(
                            entry.changes as Record<string, unknown>,
                            null,
                            2
                          )}
                        </pre>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {format(new Date(entry.createdAt), "dd MMM HH:mm")}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BetCard({
  label,
  type,
  bet,
  screenshot,
}: {
  label: string;
  type: "back" | "lay";
  bet: BackBet | LayBet | null;
  screenshot: ScreenshotUpload | null;
}) {
  const borderColor = type === "back" ? "border-sky-200" : "border-emerald-200";
  const bgColor = type === "back" ? "bg-sky-50/50" : "bg-emerald-50/50";

  if (!bet) {
    return (
      <Card className={`${borderColor} ${bgColor}`}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            {label}
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-normal text-amber-800 text-xs">
              Missing
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No {type} bet attached. Use attach leg action to complete.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={borderColor}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {label}
          <BetStatusBadge status={bet.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Screenshot - only show if URL is a valid http(s) URL */}
        {screenshot?.url && /^https?:\/\//.test(screenshot.url) && (
          <div className="overflow-hidden rounded-md border">
            <Image
              alt={`${label} screenshot`}
              className="h-48 w-full object-cover"
              height={192}
              src={screenshot.url}
              width={320}
            />
          </div>
        )}

        {/* Parsed data */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Market" value={bet.market} />
          <Field label="Selection" value={bet.selection} />
          <Field highlight label="Odds" value={bet.odds} />
          <Field
            highlight
            label="Stake"
            value={`${bet.stake} ${bet.currency ?? ""}`}
          />
          <Field label="Exchange" value={bet.exchange} />
          <Field
            label="Placed at"
            value={
              bet.placedAt
                ? format(new Date(bet.placedAt), "dd MMM yyyy, HH:mm")
                : "—"
            }
          />
        </div>

        {/* Confidence indicators */}
        {bet.confidence !== null && bet.confidence !== undefined && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Confidence scores
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(bet.confidence as Record<string, number>).map(
                ([field, score]) => (
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      score < 0.8
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                    key={field}
                  >
                    {field}: {score.toFixed(2)}
                  </span>
                )
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number | null;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={highlight ? "font-semibold" : ""}>{value ?? "—"}</p>
    </div>
  );
}

function formatAction(action: string) {
  const labels: Record<string, string> = {
    create: "Created",
    update: "Updated",
    delete: "Deleted",
    status_change: "Status changed",
    reconcile: "Reconciled",
    attach_leg: "Leg attached",
  };
  return labels[action] ?? action;
}

type MismatchIssue = {
  type: "missing_leg" | "odds_drift" | "currency_mismatch" | "market_mismatch";
  label: string;
};

function detectMismatches(
  back: BackBet | null,
  lay: LayBet | null
): MismatchIssue[] {
  const issues: MismatchIssue[] = [];

  // Missing leg detection
  if (!back) {
    issues.push({ type: "missing_leg", label: "Missing back bet" });
  }
  if (!lay) {
    issues.push({ type: "missing_leg", label: "Missing lay bet" });
  }

  if (!back || !lay) {
    return issues;
  }

  // Odds drift >10%
  const backOdds = Number(back.odds);
  const layOdds = Number(lay.odds);
  if (backOdds > 0 && layOdds > 0) {
    const drift = Math.abs((layOdds - backOdds) / backOdds);
    if (drift > 0.1) {
      issues.push({
        type: "odds_drift",
        label: `Odds drift: back ${backOdds.toFixed(2)} vs lay ${layOdds.toFixed(2)} (${(drift * 100).toFixed(1)}%)`,
      });
    }
  }

  // Currency mismatch
  const backCurrency = back.currency?.toUpperCase();
  const layCurrency = lay.currency?.toUpperCase();
  if (backCurrency && layCurrency && backCurrency !== layCurrency) {
    issues.push({
      type: "currency_mismatch",
      label: `Currency mismatch: back ${backCurrency} vs lay ${layCurrency}`,
    });
  }

  // Market mismatch
  const normalizedBackMarket = back.market.trim().toLowerCase();
  const normalizedLayMarket = lay.market.trim().toLowerCase();
  if (normalizedBackMarket !== normalizedLayMarket) {
    issues.push({
      type: "market_mismatch",
      label: `Market mismatch: "${back.market}" vs "${lay.market}"`,
    });
  }

  return issues;
}

/**
 * MatchInfoCard - Displays linked football match information.
 *
 * Why: Shows users which real-world match this bet is linked to,
 * enabling future auto-settlement when match results are synced.
 */
function MatchInfoCard({ match }: { match: FootballMatch }) {
  const matchDate = new Date(match.matchDate);
  const isFinished = match.status === "FINISHED";
  const isUpcoming = match.status === "SCHEDULED" || match.status === "TIMED";
  const isLive = match.status === "IN_PLAY" || match.status === "PAUSED";

  const getStatusBadge = () => {
    if (isFinished) {
      return (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800 text-xs">
          Finished
        </span>
      );
    }
    if (isLive) {
      return (
        <span className="animate-pulse rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800 text-xs">
          Live
        </span>
      );
    }
    if (isUpcoming) {
      return (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800 text-xs">
          Upcoming
        </span>
      );
    }
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-800 text-xs">
        {match.status}
      </span>
    );
  };

  return (
    <Card className="border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4 text-amber-600" />
          Linked Match
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Teams */}
          <div className="flex items-center justify-between">
            <div className="flex-1 text-center">
              <p className="font-semibold text-lg">{match.homeTeam}</p>
              {isFinished && match.homeScore !== null && (
                <p className="font-bold text-2xl text-amber-700 dark:text-amber-400">
                  {match.homeScore}
                </p>
              )}
            </div>
            <div className="px-4 font-medium text-muted-foreground">vs</div>
            <div className="flex-1 text-center">
              <p className="font-semibold text-lg">{match.awayTeam}</p>
              {isFinished && match.awayScore !== null && (
                <p className="font-bold text-2xl text-amber-700 dark:text-amber-400">
                  {match.awayScore}
                </p>
              )}
            </div>
          </div>

          {/* Match details */}
          <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-muted-foreground text-sm">
            <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              {match.competitionCode || match.competition}
            </span>
            <div className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {format(matchDate, "EEE dd MMM yyyy, HH:mm")}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
