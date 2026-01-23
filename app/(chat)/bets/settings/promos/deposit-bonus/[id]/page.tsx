import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/app/(auth)/auth";
import { getDepositBonusById, listBonusQualifyingBets } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Pencil, AlertTriangle, CheckCircle, X } from "lucide-react";
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

  const wageringRequirement = Number.parseFloat(bonus.wageringRequirement);
  const wageringProgress = Number.parseFloat(bonus.wageringProgress);
  const progressPercent = wageringRequirement > 0
    ? Math.min((wageringProgress / wageringRequirement) * 100, 100)
    : 0;
  const remaining = Math.max(0, wageringRequirement - wageringProgress);

  const getStatusBadge = () => {
    switch (bonus.status) {
      case "active":
        return <Badge variant="default" className="text-base">Active</Badge>;
      case "cleared":
        return <Badge variant="outline" className="border-green-500 text-green-600 text-base">Cleared</Badge>;
      case "forfeited":
        return <Badge variant="secondary" className="text-base">Forfeited</Badge>;
      case "expired":
        return <Badge variant="destructive" className="text-base">Expired</Badge>;
    }
  };

  const isExpiringSoon = bonus.expiresAt && bonus.status === "active" && 
    new Date(bonus.expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/bets/settings/promos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{bonus.name}</h1>
            <p className="text-muted-foreground">{bonus.accountName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          {bonus.status === "active" && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/bets/settings/promos/deposit-bonus/${id}/edit`}>
                  <Pencil className="mr-1 h-3 w-3" />
                  Edit
                </Link>
              </Button>
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
            {new Date(bonus.expiresAt!).toLocaleDateString()} - complete wagering soon!
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
                <p className="text-sm text-muted-foreground">Deposit</p>
                <p className="text-xl font-semibold">
                  {bonus.currency} {Number.parseFloat(bonus.depositAmount).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bonus</p>
                <p className="text-xl font-semibold text-green-600">
                  {bonus.currency} {Number.parseFloat(bonus.bonusAmount).toFixed(2)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div>
                <p className="text-sm text-muted-foreground">Min Odds</p>
                <p className="font-medium">
                  {Number.parseFloat(bonus.minOdds).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Wagering</p>
                <p className="font-medium">
                  {Number.parseFloat(bonus.wageringMultiplier)}× on {bonus.wageringBase.replace("_", " + ")}
                </p>
              </div>
            </div>
            {bonus.maxBetPercent && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground">Max Bet</p>
                <p className="font-medium">
                  {Number.parseFloat(bonus.maxBetPercent)}% of bonus = {bonus.currency}{" "}
                  {(Number.parseFloat(bonus.bonusAmount) * Number.parseFloat(bonus.maxBetPercent) / 100).toFixed(2)}
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
                <CheckCircle className="h-12 w-12 text-green-500 mb-2" />
                <p className="font-medium text-green-600">Wagering Complete!</p>
                {bonus.clearedAt && (
                  <p className="text-sm text-muted-foreground">
                    Cleared on {new Date(bonus.clearedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ) : bonus.status === "forfeited" ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <X className="h-12 w-12 text-muted-foreground mb-2" />
                <p className="font-medium text-muted-foreground">Bonus Forfeited</p>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <p className="text-3xl font-bold">{progressPercent.toFixed(1)}%</p>
                  <p className="text-sm text-muted-foreground">completed</p>
                </div>
                <Progress value={progressPercent} className="h-3" />
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
                <div className="pt-2 border-t text-sm">
                  <p className="text-muted-foreground">Total Required</p>
                  <p className="font-medium">
                    {bonus.currency} {wageringRequirement.toFixed(2)}
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
                <span className="text-muted-foreground">Linked Transaction</span>
                <span className="font-mono text-xs">{bonus.linkedTransactionId.slice(0, 8)}...</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(bonus.createdAt).toLocaleDateString()}</span>
            </div>
            {bonus.notes && (
              <div className="pt-2 border-t">
                <p className="text-muted-foreground mb-1">Notes</p>
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
            <p className="text-center text-muted-foreground py-8">
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
                        <Badge variant="outline" className="border-green-500 text-green-600">
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
