import { format } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { listMatchedBetsByUser } from "@/lib/db/queries";

export const metadata = {
  title: "Matched bets",
};

export default async function Page() {
  const session = await auth();

  if (!session) {
    redirect("/api/auth/guest");
  }

  const bets = await listMatchedBetsByUser({
    userId: session.user.id,
    limit: 50,
  });

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
        <Button asChild>
          <Link href="/bets/new">New matched bet</Link>
        </Button>
      </div>

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

          {bets.map((bet) => (
            <div
              className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
              key={bet.id}
            >
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
              <div className="flex items-center gap-3">
                {bet.netExposure && (
                  <span className="font-semibold text-sm">
                    Exposure: £{Number(bet.netExposure).toFixed(2)}
                  </span>
                )}
                <BetStatusBadge status={bet.status} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
