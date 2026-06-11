import { CheckCircle2, Globe, Trophy } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CompetitionSelector } from "@/components/bets/competition-selector";
import { SyncMatchesButton } from "@/components/bets/sync-matches-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCachedSession } from "@/lib/auth";
import { getUserSettings, listRecentlyFinishedMatches } from "@/lib/db/queries";
import {
  AVAILABLE_COMPETITIONS,
  DEFAULT_COMPETITION_CODES,
} from "@/lib/db/schema";
import { getActiveProvider } from "@/lib/matches";

export const metadata = {
  title: "Competition Settings",
};

const SETTLED_DAYS_BACK = 7;
const SETTLED_DISPLAY_LIMIT = 30;

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function formatScore(value: string | null): string {
  return value ?? "–";
}

export default async function CompetitionSettingsPage() {
  const session = await getCachedSession();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;

  const settings = await getUserSettings({ userId });
  const enabled = settings?.enabledCompetitions ?? [
    ...DEFAULT_COMPETITION_CODES,
  ];

  const provider = getActiveProvider();
  const recentlySettled = (
    await listRecentlyFinishedMatches({ daysBack: SETTLED_DAYS_BACK })
  ).slice(0, SETTLED_DISPLAY_LIMIT);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">Settings</p>
          <h1 className="font-semibold text-2xl">Competition Sync</h1>
          <p className="text-muted-foreground text-sm">
            Select which football competitions to sync for match data and
            auto-settlement.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncMatchesButton />
          <Button asChild variant="outline">
            <Link href="/bets">← Back to dashboard</Link>
          </Button>
        </div>
      </div>

      {/* Summary Card */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Enabled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <p className="font-bold text-2xl">{enabled.length}</p>
            </div>
            <p className="text-muted-foreground text-sm">
              of {AVAILABLE_COMPETITIONS.length} available
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Data Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-500" />
              <p className="font-semibold">{provider.label}</p>
            </div>
            <p className="text-muted-foreground text-sm">Daily sync</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Sync Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">Daily at 04:00 UTC</p>
            <p className="text-muted-foreground text-sm">
              10 days ahead + 3 days finished
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recently Settled Matches */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Recently Settled Matches
          </CardTitle>
          <CardDescription>
            Finished matches synced in the last {SETTLED_DAYS_BACK} days. These
            scores are used to auto-settle linked bets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentlySettled.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No finished matches synced yet. Use “Sync now” after recent
              fixtures have ended.
            </p>
          ) : (
            <ul className="divide-y">
              {recentlySettled.map((match) => (
                <li
                  className="flex items-center justify-between gap-4 py-2"
                  key={match.id}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">
                      {match.homeTeam}{" "}
                      <span className="font-semibold tabular-nums">
                        {formatScore(match.homeScore)}–
                        {formatScore(match.awayScore)}
                      </span>{" "}
                      {match.awayTeam}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">
                      {match.competition}
                    </p>
                  </div>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {dateFormatter.format(match.matchDate)} UTC
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Competition Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Select Competitions
          </CardTitle>
          <CardDescription>
            Choose which competitions to include in the match sync. Matches from
            these leagues will be available for linking bets and
            auto-settlement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompetitionSelector
            available={[...AVAILABLE_COMPETITIONS]}
            defaults={[...DEFAULT_COMPETITION_CODES]}
            enabled={enabled}
          />
        </CardContent>
      </Card>

      {/* Info Section */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
        <h3 className="mb-2 font-medium text-blue-900">
          About Competition Sync
        </h3>
        <ul className="space-y-1 text-blue-800 text-sm">
          <li>
            • <strong>Match data</strong> is fetched from {provider.label} daily
          </li>
          <li>
            • <strong>Upcoming matches</strong> (next 10 days) allow you to link
            bets to specific fixtures
          </li>
          <li>
            • <strong>Finished matches</strong> (last 3 days) enable
            auto-settlement based on results
          </li>
          <li>
            • Use <strong>Sync now</strong> to pull in just-settled scores
            without waiting for the daily run
          </li>
          <li>• Changes take effect on the next sync cycle</li>
        </ul>
      </div>
    </div>
  );
}
