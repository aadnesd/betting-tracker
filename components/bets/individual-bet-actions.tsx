"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const outcomes = [
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "push", label: "Push" },
] as const;

type Outcome = (typeof outcomes)[number]["value"];

type SettlementInfo = {
  outcome?: string | null;
  settledAt?: string | null;
  profitLoss?: number | null;
};

interface IndividualBetActionsProps {
  betId: string;
  betKind: "back" | "lay";
  status: "draft" | "placed" | "matched" | "settled" | "needs_review" | "error";
  odds: number;
  stake: number;
  currency: string;
  selection: string;
  accountBalance?: number | null;
  matchedBetId?: string | null;
  settlementInfo?: SettlementInfo | null;
}

function calculatePotentialPL(
  kind: "back" | "lay",
  outcome: Outcome,
  stake: number,
  odds: number
) {
  switch (outcome) {
    case "won":
      return kind === "back" ? stake * (odds - 1) : stake;
    case "lost":
      return kind === "back" ? -stake : -stake * (odds - 1);
    case "push":
      return 0;
  }
}

function formatCurrency(amount: number, currency: string) {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted} ${currency}`;
}

export function IndividualBetActions({
  betId,
  betKind,
  status,
  odds,
  stake,
  currency,
  selection,
  accountBalance,
  matchedBetId,
  settlementInfo,
}: IndividualBetActionsProps) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [notes, setNotes] = useState("");
  const [isSettling, setIsSettling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const preview = useMemo(() => {
    if (!outcome) {
      return null;
    }
    const profitLoss = calculatePotentialPL(betKind, outcome, stake, odds);
    const projectedBalance =
      accountBalance !== null && accountBalance !== undefined
        ? accountBalance + profitLoss
        : null;

    return { profitLoss, projectedBalance };
  }, [accountBalance, betKind, odds, outcome, stake]);

  const settleBet = async () => {
    if (!outcome) {
      toast.error("Select an outcome before settling.");
      return;
    }

    setIsSettling(true);

    try {
      const response = await fetch("/api/bets/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          betId,
          betKind,
          outcome,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to settle bet");
      }

      toast.success(`Bet settled: ${outcome}`, {
        description: `${selection} — P/L ${formatCurrency(
          data.bet.profitLoss,
          currency
        )}`,
      });

      router.refresh();
    } catch (error) {
      toast.error("Failed to settle bet", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSettling(false);
    }
  };

  const deleteBet = async (cascade: boolean) => {
    setIsDeleting(true);

    try {
      const response = await fetch("/api/bets/individual/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          betId,
          betKind,
          cascade,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete bet");
      }

      toast.success(
        cascade ? "Matched set deleted" : "Bet deleted",
        {
          description: cascade
            ? "Removed matched set and both legs."
            : "The bet has been removed and any links updated.",
        }
      );

      router.push("/bets/all");
      router.refresh();
    } catch (error) {
      toast.error("Failed to delete bet", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Settlement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "settled" ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Outcome</span>
                <span className="font-medium capitalize">
                  {settlementInfo?.outcome ?? "Settled"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Profit / Loss</span>
                <span
                  className={cn(
                    "font-semibold",
                    (settlementInfo?.profitLoss ?? 0) >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                  )}
                >
                  {formatCurrency(settlementInfo?.profitLoss ?? 0, currency)}
                </span>
              </div>
              {settlementInfo?.settledAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Settled at</span>
                  <span>{settlementInfo.settledAt}</span>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="outcome">Outcome</Label>
                <Select
                  value={outcome}
                  onValueChange={(v) => setOutcome(v as Outcome)}
                >
                  <SelectTrigger id="outcome">
                    <SelectValue placeholder="Select outcome" />
                  </SelectTrigger>
                  <SelectContent>
                    {outcomes.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Optional settlement notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>

              <div className="rounded-md border bg-muted/50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">P/L preview</span>
                  <span className="font-medium">
                    {preview
                      ? formatCurrency(preview.profitLoss, currency)
                      : "—"}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-muted-foreground">Account impact</span>
                  <span className="font-medium">
                    {preview && preview.projectedBalance !== null
                      ? formatCurrency(preview.projectedBalance, currency)
                      : "—"}
                  </span>
                </div>
                {accountBalance !== null && accountBalance !== undefined && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Current balance: {formatCurrency(accountBalance, currency)}
                  </p>
                )}
              </div>

              <Button
                type="button"
                onClick={settleBet}
                disabled={isSettling || !outcome}
                className="w-full"
              >
                {isSettling ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Settling...
                  </span>
                ) : (
                  "Settle bet"
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Delete bet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Deleting removes this bet and reverses any settlement transactions.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full" disabled={isDeleting}>
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    Delete bet
                  </span>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this bet?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. Choose whether to delete only
                  this bet or the entire matched set.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteBet(false)}>
                  Delete this bet only
                </AlertDialogAction>
                {matchedBetId && (
                  <AlertDialogAction
                    onClick={() => deleteBet(true)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete matched set
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
