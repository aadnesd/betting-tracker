import { AlertTriangle, ArrowLeft, CheckCircle, Pencil, X } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAccountBalance,
  getDepositBonusById,
  listBonusQualifyingBets,
} from "@/lib/db/queries";
import { DepositBonusCompleteEarlyButton } from "./complete-early-button";
import { DepositBonusForfeitButton } from "./forfeit-button";

export default async function DepositBonusDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;

  const bonus = await getDepositBonusById({ id, userId: session.user.id });
  if (!bonus) {
    notFound();
  }

  const qualifyingBets = await listBonusQualifyingBets({
    depositBonusId: id,
    limit: 50,
  });
  const accountBalance = await getAccountBalance({
    userId: session.user.id,
    accountId: bonus.accountId,
  });

  const wageringRequirement = Number.parseFloat(bonus.wageringRequirement);
  const wageringProgress = Number.parseFloat(bonus.wageringProgress);
  const progressPercent =
    wageringRequirement > 0
      ? Math.min((wageringProgress / wageringRequirement) * 100, 100)
      : 0;
  const remaining = Math.max(0, wageringRequirement - wageringProgress);
  const canCompleteEarly =
    bonus.status === "active" && wageringProgress < wageringRequirement;

  const getStatusBadge = () => {
    switch (bonus.status) {
      case "active":
        return (
          <Badge className="text-base" variant="default">
            Active
          </Badge>
        );
      case "cleared":
        return (
          <Badge
            className="border-green-500 text-base text-green-600"
            variant="outline"
          >
            Cleared
          </Badge>
        );
      case "forfeited":
        return (
          <Badge className="text-base" variant="secondary">
            Forfeited
          </Badge>
        );
      case "completed_early":
        return (
          <Badge
            className="border-amber-500 text-amber-700 text-base"
            variant="outline"
          >
            Completed Early
          </Badge>
        );
      case "expired":
        return (
          <Badge className="text-base" variant="destructive">
            Expired
          </Badge>
        );
    }
  };

  const isExpiringSoon =
    bonus.expiresAt &&
    bonus.status === "active" &&
    new Date(bonus.expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild size="icon" variant="ghost">
            <Link href="/bets/settings/promos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-bold text-2xl">{bonus.name}</h1>
            <p className="text-muted-foreground">{bonus.accountName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          {bonus.status === "active" && (
            <>
              <Button asChild size="sm" variant="outline">
                <Link href={`/bets/settings/promos/deposit-bonus/${id}/edit`}>
                  <Pencil className="mr-1 h-3 w-3" />
                  Edit
                </Link>
              </Button>
              {canCompleteEarly && (
                <DepositBonusCompleteEarlyButton
                  bonusId={id}
                  bonusName={bonus.name}
                />
              )}
              <DepositBonusForfeitButton bonusId={id} bonusName={bonus.name} />
            </>
          )}
        </div>
      </div>

      {/* Expiry Warning */}
      {isExpiringSoon && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          <span>
            This bonus expires on{" "}
            {new Date(bonus.expiresAt!).toLocaleDateString()} - complete
            wagering soon!
          </span>
        </div>
      )}

      {/* Main Info Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Amounts Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bonus Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground text-sm">Deposit</p>
                <p className="font-semibold text-xl">
                  {bonus.currency}{" "}
                  {Number.parseFloat(bonus.depositAmount).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Bonus</p>
                <p className="font-semibold text-green-600 text-xl">
                  {bonus.currency}{" "}
                  {Number.parseFloat(bonus.bonusAmount).toFixed(2)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t pt-2">
              <div>
                <p className="text-muted-foreground text-sm">Min Odds</p>
                <p className="font-medium">
                  {Number.parseFloat(bonus.minOdds).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Wagering</p>
                <p className="font-medium">
                  {Number.parseFloat(bonus.wageringMultiplier)}× on{" "}
                  {bonus.wageringBase.replace("_", " + ")}
                </p>
              </div>
            </div>
            {bonus.maxBetPercent && (
              <div className="border-t pt-2">
                <p className="text-muted-foreground text-sm">Max Bet</p>
                <p className="font-medium">
                  {Number.parseFloat(bonus.maxBetPercent)}% of bonus ={" "}
                  {bonus.currency}{" "}
                  {(
                    (Number.parseFloat(bonus.bonusAmount) *
                      Number.parseFloat(bonus.maxBetPercent)) /
                    100
                  ).toFixed(2)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Progress Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Wagering Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {bonus.status === "cleared" ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <CheckCircle className="mb-2 h-12 w-12 text-green-500" />
                <p className="font-medium text-green-600">Wagering Complete!</p>
                {bonus.clearedAt && (
                  <p className="text-muted-foreground text-sm">
                    Cleared on {new Date(bonus.clearedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ) : bonus.status === "forfeited" ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <X className="mb-2 h-12 w-12 text-muted-foreground" />
                <p className="font-medium text-muted-foreground">
                  Bonus Forfeited
                </p>
              </div>
            ) : bonus.status === "completed_early" ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <CheckCircle className="mb-2 h-12 w-12 text-amber-500" />
                <p className="font-medium text-amber-700">Completed Early</p>
                <p className="text-muted-foreground text-sm">
                  Closed before full wagering was completed.
                </p>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <p className="font-bold text-3xl">
                    {progressPercent.toFixed(1)}%
                  </p>
                  <p className="text-muted-foreground text-sm">completed</p>
                </div>
                <Progress className="h-3" value={progressPercent} />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Progress</p>
                    <p className="font-medium">
                      {bonus.currency} {wageringProgress.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Remaining</p>
                    <p className="font-medium">
                      {bonus.currency} {remaining.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="border-t pt-2 text-sm">
                  <p className="text-muted-foreground">Total Required</p>
                  <p className="font-medium">
                    {bonus.currency} {wageringRequirement.toFixed(2)}
                  </p>
                </div>
                <div className="border-t pt-2 text-sm">
                  <p className="text-muted-foreground">Account Balance</p>
                  <p className="font-medium">
                    {bonus.currency} {accountBalance.toFixed(2)}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Additional Info */}
      {(bonus.expiresAt || bonus.notes || bonus.linkedTransactionId) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Additional Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {bonus.expiresAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expires</span>
                <span>{new Date(bonus.expiresAt).toLocaleDateString()}</span>
              </div>
            )}
            {bonus.linkedTransactionId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Linked Transaction
                </span>
                <span className="font-mono text-xs">
                  {bonus.linkedTransactionId.slice(0, 8)}...
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(bonus.createdAt).toLocaleDateString()}</span>
            </div>
            {bonus.notes && (
              <div className="border-t pt-2">
                <p className="mb-1 text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap">{bonus.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Qualifying Bets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Qualifying Bets ({qualifyingBets.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {qualifyingBets.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No qualifying bets yet. Bets on this account with odds ≥{" "}
              {Number.parseFloat(bonus.minOdds).toFixed(2)} will appear here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Stake</TableHead>
                  <TableHead>Odds</TableHead>
                  <TableHead>Qualified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qualifyingBets.map((bet) => (
                  <TableRow key={bet.id}>
                    <TableCell>
                      {new Date(bet.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {bonus.currency} {Number.parseFloat(bet.stake).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {Number.parseFloat(bet.odds).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {bet.qualified ? (
                        <Badge
                          className="border-green-500 text-green-600"
                          variant="outline"
                        >
                          Yes
                        </Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
