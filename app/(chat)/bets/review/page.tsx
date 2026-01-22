import { format } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  countMatchedBetsByStatus,
  listMatchedBetsByStatus,
} from "@/lib/db/queries";

export const metadata = {
  title: "Reconciliation queue",
};

export default async function Page() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;

  // Fetch bets that need review or are incomplete drafts
  const [queueItems, needsReviewCount, draftCount] = await Promise.all([
    listMatchedBetsByStatus({
      userId,
      statuses: ["needs_review", "draft"],
      limit: 100,
    }),
    countMatchedBetsByStatus({ userId, statuses: ["needs_review"] }),
    countMatchedBetsByStatus({ userId, statuses: ["draft"] }),
  ]);

  const totalCount = needsReviewCount + draftCount;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Matched betting
          </p>
          <h1 className="font-semibold text-2xl">Reconciliation queue</h1>
          <p className="text-muted-foreground text-sm">
            Review bets that need attention before confirming.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/bets">← Back to dashboard</Link>
          </Button>
          <Button asChild>
            <Link href="/bets/new">New matched bet</Link>
          </Button>
        </div>
      </div>

      {/* Status summary badges */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border bg-amber-50/50 px-3 py-2">
          <span className="font-semibold text-amber-800 text-lg">
            {needsReviewCount}
          </span>
          <span className="text-amber-700 text-sm">needs review</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-slate-50/50 px-3 py-2">
          <span className="font-semibold text-slate-800 text-lg">
            {draftCount}
          </span>
          <span className="text-slate-600 text-sm">drafts</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
          <span className="font-semibold text-lg">{totalCount}</span>
          <span className="text-muted-foreground text-sm">total pending</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {queueItems.length === 0 && (
            <div className="py-6 text-center">
              <p className="mb-2 font-medium text-emerald-700">
                🎉 All caught up!
              </p>
              <p className="text-muted-foreground text-sm">
                No bets need review. Everything is confirmed and matched.
              </p>
            </div>
          )}

          {queueItems.map((bet) => {
            const missingLeg = !bet.backBetId || !bet.layBetId;
            const missingLabel = missingLeg
              ? bet.backBetId
                ? "Missing lay leg"
                : "Missing back leg"
              : null;

            // Determine issue category
            const issues: string[] = [];
            if (bet.status === "needs_review") {
              issues.push("Low confidence or flagged for review");
            }
            if (missingLeg) {
              issues.push(missingLabel || "Incomplete bet");
            }
            if (bet.lastError) {
              issues.push(`Error: ${bet.lastError}`);
            }

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
                    {issues.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {issues.map((issue) => (
                          <li
                            className="text-amber-700 text-xs"
                            key={issue}
                          >
                            • {issue}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {bet.netExposure && (
                      <span className="font-semibold text-sm">
                        NOK {Number(bet.netExposure).toFixed(2)}
                      </span>
                    )}
                    {bet.promoType && (
                      <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-purple-800 text-xs">
                        {bet.promoType}
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
