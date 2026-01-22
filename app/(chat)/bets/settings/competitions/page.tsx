import { Globe, Trophy } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { CompetitionSelector } from "@/components/bets/competition-selector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnabledCompetitions, getUserSettings } from "@/lib/db/queries";
import { AVAILABLE_COMPETITIONS, DEFAULT_COMPETITION_CODES } from "@/lib/db/schema";

export const metadata = {
  title: "Competition Settings",
};

export default async function CompetitionSettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;

  const settings = await getUserSettings({ userId });
  const enabled = settings?.enabledCompetitions ?? [...DEFAULT_COMPETITION_CODES];

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Settings
          </p>
          <h1 className="font-semibold text-2xl">Competition Sync</h1>
          <p className="text-muted-foreground text-sm">
            Select which football competitions to sync for match data and auto-settlement.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/bets">← Back to dashboard</Link>
          </Button>
        </div>
      </div>

      {/* Summary Card */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Enabled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <p className="text-2xl font-bold">{enabled.length}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              of {AVAILABLE_COMPETITIONS.length} available
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Data Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-500" />
              <p className="font-semibold">football-data.org</p>
            </div>
            <p className="text-sm text-muted-foreground">
              API v4 — Daily sync
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sync Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">Daily at 06:00 UTC</p>
            <p className="text-sm text-muted-foreground">
              14 days ahead + 3 days finished
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Competition Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Select Competitions
          </CardTitle>
          <CardDescription>
            Choose which competitions to include in the match sync. Matches from these
            leagues will be available for linking bets and auto-settlement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompetitionSelector
            available={[...AVAILABLE_COMPETITIONS]}
            enabled={enabled}
            defaults={[...DEFAULT_COMPETITION_CODES]}
          />
        </CardContent>
      </Card>

      {/* Info Section */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
        <h3 className="mb-2 font-medium text-blue-900">About Competition Sync</h3>
        <ul className="space-y-1 text-blue-800 text-sm">
          <li>
            • <strong>Match data</strong> is fetched from football-data.org API daily
          </li>
          <li>
            • <strong>Upcoming matches</strong> (next 14 days) allow you to link bets to specific fixtures
          </li>
          <li>
            • <strong>Finished matches</strong> (last 3 days) enable auto-settlement based on results
          </li>
          <li>
            • Selecting fewer competitions reduces API calls and improves performance
          </li>
          <li>
            • Changes take effect on the next sync cycle
          </li>
        </ul>
      </div>
    </div>
  );
}
