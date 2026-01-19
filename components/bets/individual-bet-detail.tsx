import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { ValueWithTooltip } from "@/components/bets/calculation-tooltip";
import { IndividualBetActions } from "@/components/bets/individual-bet-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type {
  Account,
  BackBet,
  FootballMatch,
  LayBet,
  MatchedBet,
  ScreenshotUpload,
} from "@/lib/db/schema";

const betKindLabels = {
  back: "Back bet",
  lay: "Lay bet",
} as const;

type AuditEntry = {
  id: string;
  action: string;
  notes: string | null;
  changes: unknown;
  createdAt: Date;
};

interface IndividualBetDetailProps {
  bet: BackBet | LayBet;
  betKind: "back" | "lay";
  account: Account | null;
  accountBalance: number | null;
  matchedBet: MatchedBet | null;
  otherLeg: BackBet | LayBet | null;
  screenshot: ScreenshotUpload | null;
  footballMatch: FootballMatch | null;
  auditEntries: AuditEntry[];
  settlementInfo: {
    outcome?: string | null;
    settledAt?: string | null;
    profitLoss?: number | null;
  } | null;
}

function formatCurrency(amount: number, currency: string | null) {
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

function formatAction(action: string) {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function IndividualBetDetail({
  bet,
  betKind,
  account,
  accountBalance,
  matchedBet,
  otherLeg,
  screenshot,
  footballMatch,
  auditEntries,
  settlementInfo,
}: IndividualBetDetailProps) {
  const odds = Number(bet.odds);
  const stake = Number(bet.stake);
  const currency = bet.currency ?? account?.currency ?? "NOK";
  const placedAt = bet.placedAt ?? bet.createdAt;
  const profitLoss = bet.profitLoss ? Number(bet.profitLoss) : null;
  const potentialWin = betKind === "back" ? stake * (odds - 1) : stake;
  const layLiability = betKind === "lay" ? stake * (odds - 1) : null;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Matched betting
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-semibold text-2xl">{bet.selection}</h1>
            <BetStatusBadge status={bet.status} />
          </div>
          <p className="text-muted-foreground text-sm">{bet.market}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/bets/all">← All bets</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/bets">Dashboard</Link>
          </Button>
          {bet.status !== "settled" && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/bets/${betKind}/${bet.id}/edit`}>Edit</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Bet summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Type</span>
              <Badge variant="outline">{betKindLabels[betKind]}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Odds</span>
              <span className="font-medium">{formatOdds(odds)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Stake</span>
              <span className="font-medium">{formatCurrency(stake, currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {betKind === "lay" ? (
                  <ValueWithTooltip type="layLiability">Liability</ValueWithTooltip>
                ) : (
                  "Potential win"
                )}
              </span>
              <span className="font-medium">
                {betKind === "lay" && layLiability !== null
                  ? formatCurrency(layLiability, currency)
                  : formatCurrency(potentialWin, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Placed</span>
              <span>{format(new Date(placedAt), "dd MMM yyyy, HH:mm")}</span>
            </div>
            {bet.status === "settled" && profitLoss !== null && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Profit / Loss</span>
                <span
                  className={cn(
                    "font-semibold",
                    profitLoss >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}
                >
                  {formatCurrency(profitLoss, currency)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {account ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{account.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Kind</span>
                  <span className="capitalize">{account.kind}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Balance</span>
                  <span className="font-medium">
                    {accountBalance !== null
                      ? formatCurrency(accountBalance, account.currency)
                      : "—"}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                No account linked to this bet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {matchedBet ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Matched set</span>
                  <BetStatusBadge status={matchedBet.status} />
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/bets/${matchedBet.id}`}>
                    View matched set
                  </Link>
                </Button>
                {otherLeg && (
                  <div className="rounded-md border bg-muted/50 p-2">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">
                      Other leg
                    </p>
                    <p className="font-medium text-sm">{otherLeg.selection}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatOdds(Number(otherLeg.odds))} · {formatCurrency(
                        Number(otherLeg.stake),
                        otherLeg.currency ?? currency
                      )}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">
                This bet is not linked to a matched set.
              </p>
            )}
            {footballMatch && (
              <div className="rounded-md border p-2">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  Linked match
                </p>
                <p className="font-medium text-sm">
                  {footballMatch.homeTeam} vs {footballMatch.awayTeam}
                </p>
                <p className="text-muted-foreground text-xs">
                  {footballMatch.competition} · {format(
                    new Date(footballMatch.matchDate),
                    "dd MMM yyyy, HH:mm"
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr,0.9fr]">
        <div className="space-y-6">
          {screenshot?.url && (
            <Card>
              <CardHeader>
                <CardTitle>Screenshot</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-md border">
                  <Image
                    alt={`${betKindLabels[betKind]} screenshot`}
                    className="h-64 w-full object-cover"
                    height={256}
                    src={screenshot.url}
                    width={480}
                  />
                </div>
                {screenshot.filename && (
                  <p className="mt-2 text-muted-foreground text-xs">
                    {screenshot.filename}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Bet details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Market</span>
                <span className="font-medium">{bet.market}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Selection</span>
                <span className="font-medium">{bet.selection}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Exchange</span>
                <span>{bet.exchange}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Currency</span>
                <span>{currency}</span>
              </div>
              {bet.error && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-rose-700">
                  {bet.error}
                </div>
              )}
              {matchedBet && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Matched set</span>
                  <Link
                    href={`/bets/${matchedBet.id}`}
                    className="inline-flex items-center gap-1 text-sm text-emerald-700"
                  >
                    View details <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <IndividualBetActions
          betId={bet.id}
          betKind={betKind}
          status={bet.status}
          odds={odds}
          stake={stake}
          currency={currency}
          selection={bet.selection}
          accountBalance={accountBalance}
          matchedBetId={matchedBet?.id ?? null}
          settlementInfo={settlementInfo}
        />
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Activity log</CardTitle>
        </CardHeader>
        <CardContent>
          {auditEntries.length === 0 ? (
            <p className="text-muted-foreground text-sm">No history yet.</p>
          ) : (
            <ul className="space-y-3">
              {auditEntries.map((entry) => (
                <li
                  className="flex items-start gap-3 border-l-2 border-muted pl-3"
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
                    {entry.changes !== null &&
                      entry.changes !== undefined && (
                        <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-2 text-xs">
                          {JSON.stringify(entry.changes, null, 2)}
                        </pre>
                      )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {format(new Date(entry.createdAt), "dd MMM yyyy, HH:mm")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
