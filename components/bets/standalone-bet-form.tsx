"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface AccountOption {
  id: string;
  name: string;
  kind: "bookmaker" | "exchange";
  currency: string | null;
}

interface StandaloneBetFormProps {
  bookmakers: AccountOption[];
  exchanges: AccountOption[];
}

interface FormData {
  kind: "back" | "lay";
  market: string;
  selection: string;
  odds: string;
  stake: string;
  account: string;
  currency: string;
  placedAt: string;
  notes: string;
}

export function StandaloneBetForm({
  bookmakers,
  exchanges,
}: StandaloneBetFormProps) {
  const router = useRouter();

  const [formData, setFormData] = useState<FormData>({
    kind: "back",
    market: "",
    selection: "",
    odds: "",
    stake: "",
    account: bookmakers.length > 0 ? bookmakers[0].name : "",
    currency: bookmakers.length > 0 ? (bookmakers[0].currency ?? "NOK") : "NOK",
    placedAt: new Date().toISOString().slice(0, 16), // datetime-local format
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {}
  );

  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  // Get the accounts for the currently selected bet type
  const accounts = formData.kind === "back" ? bookmakers : exchanges;

  // When bet type changes, reset account to first available of that type
  const handleKindChange = (kind: "back" | "lay") => {
    const newAccounts = kind === "back" ? bookmakers : exchanges;
    const newAccount = newAccounts.length > 0 ? newAccounts[0].name : "";
    const newCurrency =
      newAccounts.length > 0 ? (newAccounts[0].currency ?? "NOK") : "NOK";

    setFormData((prev) => ({
      ...prev,
      kind,
      account: newAccount,
      currency: newCurrency,
    }));
  };

  // When account changes, update currency
  const handleAccountChange = (accountName: string) => {
    const selectedAccount = accounts.find((a) => a.name === accountName);
    setFormData((prev) => ({
      ...prev,
      account: accountName,
      currency: selectedAccount?.currency ?? prev.currency,
    }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.market.trim()) {
      newErrors.market = "Market is required";
    }
    if (!formData.selection.trim()) {
      newErrors.selection = "Selection is required";
    }
    if (!formData.odds || Number.parseFloat(formData.odds) <= 0) {
      newErrors.odds = "Odds must be positive";
    }
    if (!formData.stake || Number.parseFloat(formData.stake) <= 0) {
      newErrors.stake = "Stake must be positive";
    }
    if (!formData.account) {
      newErrors.account = "Account is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/bets/standalone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: formData.kind,
          market: formData.market.trim(),
          selection: formData.selection.trim(),
          odds: Number.parseFloat(formData.odds),
          stake: Number.parseFloat(formData.stake),
          account: formData.account,
          currency: formData.currency,
          placedAt: formData.placedAt
            ? new Date(formData.placedAt).toISOString()
            : undefined,
          notes: formData.notes.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create bet");
      }

      toast.success(
        `${formData.kind === "back" ? "Back" : "Lay"} bet created successfully`,
        {
          description: `${formData.selection} @ ${formData.odds}`,
        }
      );

      router.push("/bets/all");
      router.refresh();
    } catch (error) {
      toast.error("Failed to create bet", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const noAccounts = bookmakers.length === 0 && exchanges.length === 0;
  const noAccountsForType = accounts.length === 0;

  // Calculate potential profit/loss for display
  const odds = Number.parseFloat(formData.odds) || 0;
  const stake = Number.parseFloat(formData.stake) || 0;
  const potentialProfit =
    formData.kind === "back"
      ? stake * (odds - 1) // Back bet: profit if wins
      : stake; // Lay bet: profit equals stake if selection loses
  const potentialLoss =
    formData.kind === "back"
      ? stake // Back bet: lose stake if selection loses
      : stake * (odds - 1); // Lay bet: liability if selection wins

  return (
    <div className="container mx-auto max-w-xl p-4">
      <div className="mb-4">
        <Link
          href="/bets/all"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to All Bets
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Standalone Bet</CardTitle>
          <CardDescription>
            Add a single back or lay bet without a matched pair
          </CardDescription>
        </CardHeader>
        <CardContent>
          {noAccounts ? (
            <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm">
              <p className="font-medium">No accounts configured</p>
              <p className="mt-1 text-muted-foreground">
                Please{" "}
                <Link
                  href="/bets/settings/accounts/new"
                  className="underline hover:text-foreground"
                >
                  add an account
                </Link>{" "}
                before creating a bet.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Bet Type Selection */}
              <div className="space-y-2">
                <Label>Bet Type</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={formData.kind === "back" ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => handleKindChange("back")}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant={formData.kind === "lay" ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => handleKindChange("lay")}
                  >
                    Lay
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formData.kind === "back"
                    ? "Betting FOR the selection to win"
                    : "Betting AGAINST the selection to win"}
                </p>
              </div>

              {/* Account Selection */}
              <div className="space-y-2">
                <Label htmlFor="account">
                  {formData.kind === "back" ? "Bookmaker" : "Exchange"}
                </Label>
                {noAccountsForType ? (
                  <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
                    <p>
                      No {formData.kind === "back" ? "bookmaker" : "exchange"}{" "}
                      accounts configured.{" "}
                      <Link
                        href="/bets/settings/accounts/new"
                        className="underline hover:text-foreground"
                      >
                        Add one
                      </Link>
                    </p>
                  </div>
                ) : (
                  <Select
                    value={formData.account}
                    onValueChange={handleAccountChange}
                  >
                    <SelectTrigger id="account">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.name}>
                          {acc.name}{" "}
                          {acc.currency && (
                            <span className="text-muted-foreground">
                              ({acc.currency})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.account && (
                  <p className="text-xs text-destructive">{errors.account}</p>
                )}
              </div>

              {/* Market & Selection */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="market">Market</Label>
                  <Input
                    id="market"
                    placeholder="e.g., Man Utd v Liverpool"
                    value={formData.market}
                    onChange={(e) => updateField("market", e.target.value)}
                  />
                  {errors.market && (
                    <p className="text-xs text-destructive">{errors.market}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="selection">Selection</Label>
                  <Input
                    id="selection"
                    placeholder="e.g., Man Utd to win"
                    value={formData.selection}
                    onChange={(e) => updateField("selection", e.target.value)}
                  />
                  {errors.selection && (
                    <p className="text-xs text-destructive">
                      {errors.selection}
                    </p>
                  )}
                </div>
              </div>

              {/* Odds & Stake */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="odds">Odds</Label>
                  <Input
                    id="odds"
                    type="number"
                    step="0.01"
                    min="1.01"
                    placeholder="e.g., 2.50"
                    value={formData.odds}
                    onChange={(e) => updateField("odds", e.target.value)}
                  />
                  {errors.odds && (
                    <p className="text-xs text-destructive">{errors.odds}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stake">Stake ({formData.currency})</Label>
                  <Input
                    id="stake"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g., 100"
                    value={formData.stake}
                    onChange={(e) => updateField("stake", e.target.value)}
                  />
                  {errors.stake && (
                    <p className="text-xs text-destructive">{errors.stake}</p>
                  )}
                </div>
              </div>

              {/* Potential Profit/Loss Display */}
              {odds > 0 && stake > 0 && (
                <div className="rounded-md border bg-muted/50 p-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">
                        {formData.kind === "back"
                          ? "If selection wins"
                          : "If selection loses"}
                      </p>
                      <p className="font-medium text-green-600">
                        +{potentialProfit.toFixed(2)} {formData.currency}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        {formData.kind === "back"
                          ? "If selection loses"
                          : "If selection wins (liability)"}
                      </p>
                      <p className="font-medium text-red-600">
                        -{potentialLoss.toFixed(2)} {formData.currency}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Date Placed */}
              <div className="space-y-2">
                <Label htmlFor="placedAt">Date Placed</Label>
                <Input
                  id="placedAt"
                  type="datetime-local"
                  value={formData.placedAt}
                  onChange={(e) => updateField("placedAt", e.target.value)}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional notes..."
                  value={formData.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  rows={2}
                />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || noAccountsForType}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  `Create ${formData.kind === "back" ? "Back" : "Lay"} Bet`
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
