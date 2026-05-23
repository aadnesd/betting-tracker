import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Mail,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { GmailPromoActions } from "@/components/bets/gmail-promo-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getGmailConnectionByUserId,
  listEmailPromoCandidatesByUser,
} from "@/lib/db/queries";

export const metadata = {
  title: "Promo Inbox",
};

function formatDate(date: Date | null) {
  if (!date) {
    return "No date";
  }

  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatConfidence(value: string) {
  return `${Math.round(Number(value) * 100)}%`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "interesting") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700 text-xs">
        <Sparkles className="h-3 w-3" />
        Interesting
      </span>
    );
  }

  if (status === "needs_review") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700 text-xs">
        <AlertTriangle className="h-3 w-3" />
        Needs review
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-700 text-xs">
      <CheckCircle2 className="h-3 w-3" />
      New
    </span>
  );
}

export default async function PromoInboxPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const [connection, candidates] = await Promise.all([
    getGmailConnectionByUserId({ userId: session.user.id }),
    listEmailPromoCandidatesByUser({ userId: session.user.id, limit: 50 }),
  ]);
  const connected = connection?.status === "connected";
  const needsReviewCount = candidates.filter(
    (candidate) => candidate.status === "needs_review"
  ).length;
  const interestingCount = candidates.filter(
    (candidate) => candidate.status === "interesting"
  ).length;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Promotions
          </p>
          <h1 className="font-semibold text-2xl">Promo Inbox</h1>
          <p className="text-muted-foreground text-sm">
            AI-reviewed Gmail offers linked to your bookmaker accounts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/bets/settings/promos">Free Bets & Promotions</Link>
          </Button>
          <GmailPromoActions connected={connected} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Gmail
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold text-lg">
                {connected ? "Connected" : "Not connected"}
              </span>
            </div>
            <p className="mt-1 truncate text-muted-foreground text-sm">
              {connection?.gmailEmail ?? "Connect Gmail to scan promo emails"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Interesting
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-semibold text-2xl">{interestingCount}</div>
            <p className="text-muted-foreground text-sm">
              Parsed offers ready to inspect
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Needs Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-semibold text-2xl">{needsReviewCount}</div>
            <p className="text-muted-foreground text-sm">
              Low confidence or unmatched account
            </p>
          </CardContent>
        </Card>
      </div>

      {connection?.lastError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <div>
            <p className="font-medium text-red-900">Gmail sync error</p>
            <p className="text-red-700 text-sm">{connection.lastError}</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {candidates.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Mail className="mx-auto h-10 w-10 text-muted-foreground" />
              <h2 className="mt-3 font-semibold text-lg">
                No promo emails yet
              </h2>
              <p className="mx-auto mt-1 max-w-md text-muted-foreground text-sm">
                Connect Gmail and run a sync to scan recent bookmaker emails for
                free bets, bonuses, boosts, refunds, and wagering rules.
              </p>
            </CardContent>
          </Card>
        ) : (
          candidates.map((candidate) => (
            <Card key={candidate.id}>
              <CardContent className="p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={candidate.status} />
                      <span className="rounded-full border px-2 py-0.5 text-muted-foreground text-xs capitalize">
                        {candidate.promoKind.replaceAll("_", " ")}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        Confidence {formatConfidence(candidate.confidence)}
                      </span>
                    </div>
                    <div>
                      <h2 className="font-semibold text-lg">
                        {candidate.title}
                      </h2>
                      <p className="text-muted-foreground text-sm">
                        {candidate.summary}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <span>
                        Account:{" "}
                        <span className="font-medium">
                          {candidate.accountName ??
                            candidate.accountNameGuess ??
                            "Unmatched"}
                        </span>
                      </span>
                      {candidate.minOdds && (
                        <span>Min odds: {Number(candidate.minOdds)}</span>
                      )}
                      {candidate.maxStake && (
                        <span>
                          Max stake: {candidate.currency ?? ""}
                          {Number(candidate.maxStake).toFixed(2)}
                        </span>
                      )}
                      {candidate.expiresAt && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-4 w-4" />
                          Expires {formatDate(candidate.expiresAt)}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {candidate.sender} · {candidate.subject}
                    </p>
                  </div>
                  <div className="shrink-0 text-muted-foreground text-sm">
                    Received {formatDate(candidate.receivedAt)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
