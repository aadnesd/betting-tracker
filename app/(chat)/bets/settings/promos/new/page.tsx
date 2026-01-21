import { Gift } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { FreeBetForm } from "@/components/bets/free-bet-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAccountsByUser } from "@/lib/db/queries";

export const metadata = {
  title: "Add Free Bet",
};

export default async function NewFreeBetPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const userId = session.user.id;

  const accounts = await listAccountsByUser({ userId });
  // Treat null/undefined status as active for backwards compatibility
  const isActive = (status: string | null | undefined) =>
    status === "active" || !status;
  const bookmakers = accounts
    .filter((a) => a.kind === "bookmaker" && isActive(a.status))
    .map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
    }));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Free Bets & Promotions
          </p>
          <h1 className="font-semibold text-2xl">Add Free Bet</h1>
          <p className="text-muted-foreground text-sm">
            Record a new free bet or promotional credit from a bookmaker.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/bets/settings/promos">← Back to Free Bets</Link>
        </Button>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-emerald-600" />
            Free Bet Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bookmakers.length === 0 ? (
            <div className="py-8 text-center">
              <Gift className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="mb-2 font-medium">No bookmaker accounts</p>
              <p className="mb-4 text-muted-foreground text-sm">
                You need to add a bookmaker account before recording free bets.
              </p>
              <Button asChild>
                <Link href="/bets/settings/accounts/new">Add Account</Link>
              </Button>
            </div>
          ) : (
            <FreeBetForm accounts={bookmakers} mode="create" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
