import { format } from "date-fns";
import { ArrowLeft, CalendarDays, Gift, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { FreeBetForm } from "@/components/bets/free-bet-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFreeBetById, listAccountsByUser } from "@/lib/db/queries";

export const metadata = {
  title: "Free Bet Details",
};

interface FreeBetDetailPageProps {
  params: Promise<{ id: string }>;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>;
    case "used":
      return <Badge className="bg-blue-100 text-blue-700">Used</Badge>;
    case "expired":
      return <Badge className="bg-red-100 text-red-700">Expired</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default async function FreeBetDetailPage({
  params,
}: FreeBetDetailPageProps) {
  const session = await auth();

  if (!session) {
    redirect("/api/auth/guest");
  }

  const userId = session.user.id;
  const { id } = await params;

  const freeBet = await getFreeBetById({ id, userId });

  if (!freeBet) {
    notFound();
  }

  const accounts = await listAccountsByUser({ userId });
  const bookmakers = accounts
    .filter((a) => a.kind === "bookmaker" && a.status === "active")
    .map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
    }));

  const account = accounts.find((a) => a.id === freeBet.accountId);
  const isEditable = freeBet.status === "active";

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Free Bets & Promotions
          </p>
          <h1 className="flex items-center gap-2 font-semibold text-2xl">
            {freeBet.name} {getStatusBadge(freeBet.status)}
          </h1>
          <p className="text-muted-foreground text-sm">
            {account?.name || "Unknown account"} •{" "}
            {freeBet.currency} {Number(freeBet.value).toFixed(2)}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/bets/settings/promos">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Free Bets
          </Link>
        </Button>
      </div>

      {/* Summary Card (read-only view) */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-emerald-600" />
            Free Bet Summary
          </CardTitle>
          <CardDescription>
            {isEditable
              ? "Edit the details below or mark as used."
              : `This free bet has been ${freeBet.status}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Value</dt>
              <dd className="font-medium">
                {freeBet.currency} {Number(freeBet.value).toFixed(2)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Bookmaker</dt>
              <dd className="font-medium">{account?.name || "Unknown"}</dd>
            </div>
            {freeBet.minOdds && (
              <div>
                <dt className="text-muted-foreground">Min Odds</dt>
                <dd className="font-medium">{Number(freeBet.minOdds).toFixed(2)}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Expires</dt>
              <dd className="flex items-center gap-1 font-medium">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                {freeBet.expiresAt
                  ? format(new Date(freeBet.expiresAt), "d MMM yyyy")
                  : "No expiry"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="font-medium">
                {format(new Date(freeBet.createdAt), "d MMM yyyy")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{getStatusBadge(freeBet.status)}</dd>
            </div>
            {freeBet.notes && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="font-medium">{freeBet.notes}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Edit Form (only for active free bets) */}
      {isEditable && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Edit Free Bet</CardTitle>
            <CardDescription>
              Update the details of this free bet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FreeBetForm
              accounts={bookmakers}
              mode="edit"
              initialData={{
                id: freeBet.id,
                accountId: freeBet.accountId,
                name: freeBet.name,
                value: freeBet.value,
                currency: freeBet.currency,
                minOdds: freeBet.minOdds ?? "",
                expiresAt: freeBet.expiresAt
                  ? freeBet.expiresAt.toISOString().split("T")[0]
                  : "",
                notes: freeBet.notes ?? "",
                status: freeBet.status,
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Used in matched bet link */}
      {freeBet.status === "used" && freeBet.usedInMatchedBetId && (
        <Card className="max-w-2xl">
          <CardContent className="pt-6">
            <p className="mb-3 text-muted-foreground text-sm">
              This free bet was used in a matched bet.
            </p>
            <Button asChild variant="outline">
              <Link href={`/bets/${freeBet.usedInMatchedBetId}`}>
                View Matched Bet
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
