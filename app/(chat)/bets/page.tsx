import { format } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { ExposureAlertBanner } from "@/components/bets/exposure-alert-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  countMatchedBetsByStatus,
  getOpenExposure,
  listMatchedBetsByUser,
} from "@/lib/db/queries";

export const metadata = {
  title: "Matched bets",
};

export default async function Page() {
  const session = await auth();

  if (!session) {
    redirect("/api/auth/guest");
  }

  const userId = session.user.id;

  const [bets, pendingCount, exposureData] = await Promise.all([
    listMatchedBetsByUser({
      userId,
      limit: 50,
    }),
    countMatchedBetsByStatus({
      userId,
      statuses: ["needs_review", "draft"],
    }),
    getOpenExposure({ userId }),
  ]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Matched betting
          </p>
          <h1 className="font-semibold text-2xl">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Review parsed bets and jump into a new upload flow.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/bets/reports">Reports</Link>
          </Button>
          <Button asChild variant={pendingCount > 0 ? "outline" : "ghost"}>
            <Link href="/bets/review" className="flex items-center gap-2">
              Review queue
              {pendingCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 font-semibold text-white text-xs">
                  {pendingCount}
                </span>
              )}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/bets/new">New matched bet</Link>
          </Button>
        </div>
      </div>

      <ExposureAlertBanner
        totalExposure={exposureData.totalExposure}
        openPositions={exposureData.count}
        threshold={5000}
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent matched bets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bets.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No matched bets yet. Upload back and lay slips to get started.
            </p>
          )}

          {bets.map((bet) => {
            const missingLeg =
              bet.status === "draft" && (!bet.backBetId || !bet.layBetId);
            const missingLabel = missingLeg
              ? bet.backBetId
                ? "Missing lay leg"
                : "Missing back leg"
              : null;

            return (
              <Link
                className="block rounded-md border p-3 transition-colors hover:bg-muted/50"
                href={`/bets/${bet.id}`}
                key={bet.id}
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{bet.selection}</span>
                      <Separator className="h-4" orientation="vertical" />
                      <span className="text-muted-foreground text-sm">
                        {bet.market}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Created{" "}
                      {format(new Date(bet.createdAt), "dd MMM yyyy, HH:mm")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {bet.netExposure && (
                      <span className="font-semibold text-sm">
                        Exposure: NOK {Number(bet.netExposure).toFixed(2)}
                      </span>
                    )}
                    {missingLabel && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800 text-xs">
                        {missingLabel}
                      </span>
                    )}
                    <BetStatusBadge status={bet.status} />
                  </div>
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
