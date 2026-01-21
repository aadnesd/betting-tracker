import {
  AlertTriangle,
  Calendar,
  Filter,
  Gift,
  Lock,
  Plus,
  Tag,
  X,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  countExpiringFreeBets,
  getActiveFreeBetsSummary,
  listFreeBetsByUser,
} from "@/lib/db/queries";

export const metadata = {
  title: "Free Bets & Promotions",
};

function formatCurrency(value: number | string, currency: string): string {
  const numVal = typeof value === "string" ? Number.parseFloat(value) : value;
  return `${currency} ${numVal.toFixed(2)}`;
}

function formatDate(date: Date | null): string {
  if (!date) return "No expiry";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isExpiringSoon(date: Date | null): boolean {
  if (!date) return false;
  const now = new Date();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return new Date(date).getTime() - now.getTime() < sevenDays;
}

function FreeBetStatusBadge({
  status,
}: {
  status: "active" | "locked" | "used" | "expired";
}) {
  switch (status) {
    case "active":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700 text-xs">
          <Gift className="h-3 w-3" />
          Active
        </span>
      );
    case "locked":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700 text-xs">
          <Lock className="h-3 w-3" />
          Locked
        </span>
      );
    case "used":
      return (
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-600 text-xs">
          Used
        </span>
      );
    case "expired":
      return (
        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-red-600 text-xs">
          Expired
        </span>
      );
    default:
      return null;
  }
}

export default async function PromosSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const userId = session.user.id;
  const params = await searchParams;
  const filterExpiring = params.filter === "expiring";

  // Fetch all data in parallel
  const [freeBets, summary, expiringCount] = await Promise.all([
    listFreeBetsByUser({ userId }),
    getActiveFreeBetsSummary({ userId }),
    countExpiringFreeBets({ userId, daysUntilExpiry: 7 }),
  ]);

  let activeFreeBets = freeBets.filter((fb) => fb.status === "active");
  const lockedFreeBets = freeBets.filter((fb) => fb.status === "locked");
  
  // Apply filter if requested - uses isExpiringSoon helper defined above
  if (filterExpiring) {
    activeFreeBets = activeFreeBets.filter((fb) => isExpiringSoon(fb.expiresAt));
  }
  
  const usedFreeBets = freeBets.filter((fb) => fb.status === "used");
  const expiredFreeBets = freeBets.filter((fb) => fb.status === "expired");

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">Settings</p>
          <h1 className="font-semibold text-2xl">Free Bets & Promotions</h1>
          <p className="text-muted-foreground text-sm">
            Track your free bets, bonuses, and promotional offers across all
            bookmakers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/bets">← Back to dashboard</Link>
          </Button>
          {expiringCount > 0 && !filterExpiring && (
            <Button asChild variant="outline">
              <Link href="/bets/settings/promos?filter=expiring" className="flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Expiring ({expiringCount})
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/bets/settings/promos/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Free Bet
            </Link>
          </Button>
        </div>
      </div>

      {/* Expiring Soon Warning */}
      {expiringCount > 0 && !filterExpiring && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <div>
            <p className="font-medium text-amber-900">
              {expiringCount} free bet{expiringCount !== 1 ? "s" : ""} expiring
              within 7 days
            </p>
            <p className="text-amber-700 text-sm">
              Use them before they expire to maximize your value.
            </p>
          </div>
        </div>
      )}

      {/* Filter Indicator */}
      {filterExpiring && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-3">
            <Filter className="h-5 w-5 text-blue-600" />
            <div>
              <p className="font-medium text-blue-900">
                Showing {activeFreeBets.length} free bet{activeFreeBets.length !== 1 ? "s" : ""} expiring within 7 days
              </p>
              <p className="text-blue-700 text-sm">
                Use these before they expire to maximize your value.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/bets/settings/promos" className="flex items-center gap-1">
              <X className="h-4 w-4" />
              Clear filter
            </Link>
          </Button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Free Bets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">
              {summary.totalValue.toFixed(2)}
            </p>
            <p className="text-muted-foreground text-sm">Available to use</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expiring Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                expiringCount > 0 ? "text-amber-600" : "text-muted-foreground"
              }`}
            >
              {expiringCount}
            </p>
            <p className="text-muted-foreground text-sm">Within 7 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Used This Period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{usedFreeBets.length}</p>
            <p className="text-muted-foreground text-sm">Free bets utilized</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Free Bets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-emerald-600" />
            Active Free Bets ({activeFreeBets.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeFreeBets.length === 0 && (
            <div className="py-8 text-center">
              <Gift className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="mb-2 font-medium">No active free bets</p>
              <p className="mb-4 text-muted-foreground text-sm">
                Add free bets you receive from bookmakers to track them here.
              </p>
              <Button asChild>
                <Link href="/bets/settings/promos/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Free Bet
                </Link>
              </Button>
            </div>
          )}

          {activeFreeBets.map((fb) => (
            <Link
              key={fb.id}
              href={`/bets/settings/promos/${fb.id}`}
              className="block rounded-md border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{fb.name}</span>
                    <FreeBetStatusBadge status={fb.status} />
                    {isExpiringSoon(fb.expiresAt) && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700 text-xs">
                        <AlertTriangle className="h-3 w-3" />
                        Expiring soon
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {fb.accountName && (
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {fb.accountName}
                      </span>
                    )}
                    {fb.minOdds && (
                      <span>Min odds: {Number(fb.minOdds).toFixed(2)}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Expires: {formatDate(fb.expiresAt)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-lg text-emerald-600">
                    {formatCurrency(fb.value, fb.currency)}
                  </p>
                  <p className="text-muted-foreground text-xs">Free bet value</p>
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      {/* Locked Promos (with unlock requirements) */}
      {lockedFreeBets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600" />
              Locked Promos ({lockedFreeBets.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lockedFreeBets.map((fb) => {
              const unlockProgress = fb.unlockProgress
                ? Number.parseFloat(fb.unlockProgress)
                : 0;
              const unlockTarget = fb.unlockTarget
                ? Number.parseFloat(fb.unlockTarget)
                : 0;
              const progressPercent =
                unlockTarget > 0
                  ? Math.min((unlockProgress / unlockTarget) * 100, 100)
                  : 0;

              return (
                <Link
                  key={fb.id}
                  href={`/bets/settings/promos/${fb.id}`}
                  className="block rounded-md border border-amber-200 bg-amber-50/30 p-4 transition-colors hover:bg-amber-50/50"
                >
                  <div className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{fb.name}</span>
                          <FreeBetStatusBadge status={fb.status} />
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          {fb.accountName && (
                            <span className="flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              {fb.accountName}
                            </span>
                          )}
                          <span>
                            {fb.unlockType === "stake"
                              ? `Stake ${fb.currency} ${unlockTarget.toFixed(0)}`
                              : `Place ${unlockTarget.toFixed(0)} bets`}
                            {fb.unlockMinOdds &&
                              ` @ ${Number.parseFloat(fb.unlockMinOdds).toFixed(2)}+`}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-lg text-amber-600">
                          {formatCurrency(fb.value, fb.currency)}
                        </p>
                        <p className="text-muted-foreground text-xs">When unlocked</p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {fb.unlockType === "stake"
                            ? `${fb.currency} ${unlockProgress.toFixed(2)}`
                            : `${unlockProgress.toFixed(0)} bets`}
                        </span>
                        <span>{progressPercent.toFixed(0)}%</span>
                      </div>
                      <Progress value={progressPercent} className="h-2 bg-amber-100" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Used & Expired Free Bets */}
      {(usedFreeBets.length > 0 || expiredFreeBets.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-muted-foreground">
              <Tag className="h-5 w-5" />
              History ({usedFreeBets.length + expiredFreeBets.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...usedFreeBets, ...expiredFreeBets].map((fb) => (
              <Link
                key={fb.id}
                href={`/bets/settings/promos/${fb.id}`}
                className="block rounded-md border border-muted bg-muted/30 p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-muted-foreground">
                        {fb.name}
                      </span>
                      <FreeBetStatusBadge status={fb.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {fb.accountName && <span>{fb.accountName}</span>}
                      {fb.expiresAt && (
                        <span>
                          {fb.status === "expired" ? "Expired" : "Used"}:{" "}
                          {formatDate(fb.expiresAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-muted-foreground">
                      {formatCurrency(fb.value, fb.currency)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Quick Info */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
        <h3 className="mb-2 font-medium text-blue-900">
          About Free Bet Tracking
        </h3>
        <ul className="space-y-1 text-blue-800 text-sm">
          <li>
            • <strong>Free bets</strong> are promotional credits from bookmakers
            that can be used for matched betting
          </li>
          <li>
            • Track expiry dates to ensure you use them before they expire
          </li>
          <li>
            • When you use a free bet in a matched bet, mark it as "used" to
            update your inventory
          </li>
          <li>
            • Some free bets have minimum odds requirements - record these for
            reference
          </li>
        </ul>
      </div>
    </div>
  );
}
