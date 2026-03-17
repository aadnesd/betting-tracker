"use client";

import { ArrowLeft, Gift, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { type MatchOption, MatchPicker } from "@/components/bets/match-picker";
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
import type { SettlementOutcome } from "@/lib/settled-bet-edit";

const PROMO_TYPES = [
  "Free Bet",
  "Risk-Free Bet",
  "Deposit Bonus",
  "Odds Boost",
  "Profit Boost",
  "Reload Offer",
  "Qualifying Bet",
  "Other",
] as const;

export type AccountOption = {
  id: string;
  name: string;
  kind: "bookmaker" | "exchange";
  currency: string | null;
};

export type FreeBetOption = {
  id: string;
  name: string;
  value: number;
  currency: string;
  accountId: string | null;
  accountName: string | null;
  expiresAt: string | null;
  minOdds: number | null;
  stakeReturned?: boolean;
};

type StandaloneBetFormProps = {
  bookmakers: AccountOption[];
  exchanges: AccountOption[];
  freeBets?: FreeBetOption[];
  mode?: "create" | "edit";
  initialData?: {
    id: string;
    kind: "back" | "lay";
    market: string;
    selection: string;
    odds: number;
    stake: number;
    accountId: string;
    currency: string;
    placedAt: Date;
    status?:
      | "draft"
      | "placed"
      | "matched"
      | "settled"
      | "needs_review"
      | "error";
    matchId?: string | null;
    settlementOutcome?: SettlementOutcome | null;
    notes?: string | null;
  };
};

type FormData = {
  kind: "back" | "lay";
  market: string;
  selection: string;
  odds: string;
  stake: string;
  accountId: string;
  currency: string;
  placedAt: string;
  matchId: string;
  promoType: string;
  freeBetId: string;
  settlementOutcome: SettlementOutcome | "";
  notes: string;
};

export function StandaloneBetForm({
  bookmakers,
  exchanges,
  freeBets = [],
  mode = "create",
  initialData,
}: StandaloneBetFormProps) {
  const router = useRouter();
  const isEdit = Boolean(mode === "edit" && initialData);
  const isSettledEdit = isEdit && initialData?.status === "settled";

  const initialKind = initialData?.kind ?? "back";
  const initialAccounts = initialKind === "back" ? bookmakers : exchanges;
  const fallbackAccountId = initialAccounts[0]?.id ?? "";
  const fallbackCurrency = initialAccounts[0]?.currency ?? "NOK";
  const initialPlacedAt = initialData?.placedAt
    ? new Date(initialData.placedAt).toISOString().slice(0, 16)
    : new Date().toISOString().slice(0, 16);

  const [formData, setFormData] = useState<FormData>({
    kind: initialKind,
    market: initialData?.market ?? "",
    selection: initialData?.selection ?? "",
    odds: initialData?.odds ? initialData.odds.toString() : "",
    stake: initialData?.stake ? initialData.stake.toString() : "",
    accountId: initialData?.accountId ?? fallbackAccountId,
    currency: initialData?.currency ?? fallbackCurrency,
    placedAt: initialPlacedAt, // datetime-local format
    matchId: initialData?.matchId ?? "",
    promoType: "",
    freeBetId: "",
    settlementOutcome: initialData?.settlementOutcome ?? "",
    notes: initialData?.notes ?? "",
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
  const selectedAccount = accounts.find(
    (account) => account.id === formData.accountId
  );
  const availableFreeBets =
    formData.kind !== "back"
      ? []
      : freeBets.filter(
          (freeBet) =>
            freeBet.accountId === formData.accountId || !freeBet.accountId
        );
  const selectedFreeBet =
    freeBets.find((freeBet) => freeBet.id === formData.freeBetId) ?? null;
  const showPromoFields = !isEdit && formData.kind === "back";

  // When bet type changes, reset account to first available of that type
  const handleKindChange = (kind: "back" | "lay") => {
    const newAccounts = kind === "back" ? bookmakers : exchanges;
    const newAccountId = newAccounts.length > 0 ? newAccounts[0].id : "";
    const newCurrency =
      newAccounts.length > 0 ? (newAccounts[0].currency ?? "NOK") : "NOK";

    setFormData((prev) => ({
      ...prev,
      kind,
      accountId: newAccountId,
      currency: newCurrency,
      promoType: kind === "back" ? prev.promoType : "",
      freeBetId: kind === "back" ? prev.freeBetId : "",
    }));
  };

  // When account changes, update currency
  const handleAccountChange = (accountId: string) => {
    const nextAccount = accounts.find((account) => account.id === accountId);
    setFormData((prev) => ({
      ...prev,
      accountId,
      currency: nextAccount?.currency ?? prev.currency,
      freeBetId:
        prev.freeBetId &&
        selectedFreeBet &&
        selectedFreeBet.accountId &&
        selectedFreeBet.accountId !== accountId
          ? ""
          : prev.freeBetId,
    }));
  };

  const handlePromoTypeChange = (promoType: string) => {
    setFormData((prev) => ({
      ...prev,
      promoType,
      freeBetId:
        promoType === "Free Bet" || promoType === "Risk-Free Bet"
          ? prev.freeBetId
          : "",
    }));
  };

  const handleFreeBetChange = (freeBetId: string) => {
    const freeBet = freeBets.find((option) => option.id === freeBetId);
    if (!freeBet) {
      updateField("freeBetId", "");
      return;
    }

    setFormData((prev) => ({
      ...prev,
      freeBetId,
      stake: freeBet.value.toString(),
      currency: freeBet.currency,
      accountId: freeBet.accountId ?? prev.accountId,
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
    if (!formData.accountId) {
      newErrors.accountId = "Account is required";
    }
    if (isSettledEdit && !formData.settlementOutcome) {
      newErrors.settlementOutcome = "Settlement outcome is required";
    }
    if (isSettledEdit && !formData.notes.trim()) {
      newErrors.notes = "Correction reason is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const endpoint =
        mode === "edit"
          ? "/api/bets/individual/update"
          : "/api/bets/standalone";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          betId: initialData?.id,
          betKind: formData.kind,
          kind: formData.kind,
          market: formData.market.trim(),
          selection: formData.selection.trim(),
          odds: Number.parseFloat(formData.odds),
          stake: Number.parseFloat(formData.stake),
          accountId: formData.accountId,
          currency: formData.currency,
          matchId: formData.matchId ? formData.matchId : null,
          promoType:
            showPromoFields && formData.promoType
              ? formData.promoType
              : undefined,
          freeBetId:
            showPromoFields && formData.freeBetId
              ? formData.freeBetId
              : undefined,
          placedAt: formData.placedAt
            ? new Date(formData.placedAt).toISOString()
            : undefined,
          settlementOutcome: formData.settlementOutcome || undefined,
          notes: formData.notes.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            (mode === "edit" ? "Failed to update bet" : "Failed to create bet")
        );
      }

      toast.success(
        mode === "edit"
          ? "Bet updated successfully"
          : `${formData.kind === "back" ? "Back" : "Lay"} bet created successfully`,
        {
          description: `${formData.selection} @ ${formData.odds}`,
        }
      );

      if (mode === "edit" && initialData) {
        router.push(`/bets/${initialData.kind}/${initialData.id}`);
      } else {
        router.push("/bets/all");
      }
      router.refresh();
    } catch (error) {
      toast.error(
        mode === "edit" ? "Failed to update bet" : "Failed to create bet",
        {
          description: error instanceof Error ? error.message : "Unknown error",
        }
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const noAccounts = bookmakers.length === 0 && exchanges.length === 0;
  const noAccountsForType = accounts.length === 0;
  const handleMatchChange = (match: MatchOption | null) => {
    updateField("matchId", match?.id ?? "");
  };

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
          className="inline-flex items-center text-muted-foreground text-sm hover:text-foreground"
          href={
            isEdit && initialData
              ? `/bets/${initialData.kind}/${initialData.id}`
              : "/bets/all"
          }
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {isEdit ? "Back to Bet Detail" : "Back to All Bets"}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? "Edit Bet" : "Create Standalone Bet"}</CardTitle>
          <CardDescription>
            {isSettledEdit
              ? "Correct settlement details and metadata for this settled bet"
              : isEdit
                ? "Update the details of this individual bet"
                : "Add a single back or lay bet without a matched pair"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {noAccounts ? (
            <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm">
              <p className="font-medium">No accounts configured</p>
              <p className="mt-1 text-muted-foreground">
                Please{" "}
                <Link
                  className="underline hover:text-foreground"
                  href="/bets/settings/accounts/new"
                >
                  add an account
                </Link>{" "}
                before creating a bet.
              </p>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              {/* Bet Type Selection */}
              <div className="space-y-2">
                <Label>Bet Type</Label>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={isEdit}
                    onClick={() => handleKindChange("back")}
                    type="button"
                    variant={formData.kind === "back" ? "default" : "outline"}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={isEdit}
                    onClick={() => handleKindChange("lay")}
                    type="button"
                    variant={formData.kind === "lay" ? "default" : "outline"}
                  >
                    Lay
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
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
                        className="underline hover:text-foreground"
                        href="/bets/settings/accounts/new"
                      >
                        Add one
                      </Link>
                    </p>
                  </div>
                ) : (
                  <Select
                    disabled={isSettledEdit}
                    onValueChange={handleAccountChange}
                    value={formData.accountId}
                  >
                    <SelectTrigger id="account">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
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
                {errors.accountId && (
                  <p className="text-destructive text-xs">{errors.accountId}</p>
                )}
                {isSettledEdit && (
                  <p className="text-muted-foreground text-xs">
                    Account and currency are locked for settled-bet corrections.
                  </p>
                )}
              </div>

              {/* Market & Selection */}
              <div className="space-y-2">
                <Label
                  className="flex items-center gap-2"
                  htmlFor="matchPicker"
                >
                  Link to Match (optional)
                </Label>
                <MatchPicker
                  onChange={handleMatchChange}
                  placeholder="Search for a match..."
                  value={formData.matchId || null}
                />
                <p className="text-muted-foreground text-xs">
                  Linking to a match enables automatic result lookup
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="market">Market</Label>
                  <Input
                    id="market"
                    onChange={(e) => updateField("market", e.target.value)}
                    placeholder="e.g., Man Utd v Liverpool"
                    value={formData.market}
                  />
                  {errors.market && (
                    <p className="text-destructive text-xs">{errors.market}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="selection">Selection</Label>
                  <Input
                    id="selection"
                    onChange={(e) => updateField("selection", e.target.value)}
                    placeholder="e.g., Man Utd to win"
                    value={formData.selection}
                  />
                  {errors.selection && (
                    <p className="text-destructive text-xs">
                      {errors.selection}
                    </p>
                  )}
                </div>
              </div>

              {showPromoFields && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="promoType">Promo Type (optional)</Label>
                    <Select
                      onValueChange={handlePromoTypeChange}
                      value={formData.promoType}
                    >
                      <SelectTrigger id="promoType">
                        <SelectValue placeholder="Select promo type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {PROMO_TYPES.map((promoType) => (
                          <SelectItem key={promoType} value={promoType}>
                            {promoType}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(formData.promoType === "Free Bet" ||
                    formData.promoType === "Risk-Free Bet") && (
                    <div className="space-y-2">
                      <Label
                        className="flex items-center gap-2"
                        htmlFor="freeBet"
                      >
                        <Gift className="h-4 w-4 text-emerald-600" />
                        Use a Free Bet (optional)
                      </Label>
                      {availableFreeBets.length > 0 ? (
                        <>
                          <Select
                            onValueChange={handleFreeBetChange}
                            value={formData.freeBetId}
                          >
                            <SelectTrigger id="freeBet">
                              <SelectValue placeholder="Select a free bet to use..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableFreeBets.map((freeBet) => (
                                <SelectItem key={freeBet.id} value={freeBet.id}>
                                  <span className="flex items-center gap-2">
                                    {freeBet.name}
                                    <span className="font-medium text-emerald-600">
                                      {freeBet.currency}{" "}
                                      {freeBet.value.toFixed(2)}
                                    </span>
                                    {freeBet.accountName && (
                                      <span className="text-muted-foreground text-xs">
                                        @ {freeBet.accountName}
                                      </span>
                                    )}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedFreeBet && (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
                              <div className="flex items-center gap-2 font-medium text-emerald-900">
                                <Gift className="h-4 w-4" />
                                Using: {selectedFreeBet.name}
                              </div>
                              <div className="mt-1 text-emerald-700">
                                Value: {selectedFreeBet.currency}{" "}
                                {selectedFreeBet.value.toFixed(2)}
                                {selectedFreeBet.minOdds && (
                                  <span className="ml-3">
                                    Min odds:{" "}
                                    {selectedFreeBet.minOdds.toFixed(2)}
                                  </span>
                                )}
                                <span className="ml-3">
                                  {selectedFreeBet.stakeReturned
                                    ? "Stake returned"
                                    : "Stake not returned"}
                                </span>
                                {selectedFreeBet.expiresAt && (
                                  <span className="ml-3">
                                    Expires:{" "}
                                    {new Date(
                                      selectedFreeBet.expiresAt
                                    ).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="rounded-md border border-muted bg-muted/50 p-3 text-muted-foreground text-sm">
                          No active free bets available
                          {selectedAccount && (
                            <span> for {selectedAccount.name}</span>
                          )}
                          .{" "}
                          <Link
                            className="text-primary hover:underline"
                            href="/bets/settings/promos/new"
                          >
                            Add one
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Odds & Stake */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="odds">Odds</Label>
                  <Input
                    disabled={isSettledEdit}
                    id="odds"
                    min="1.01"
                    onChange={(e) => updateField("odds", e.target.value)}
                    placeholder="e.g., 2.50"
                    step="any"
                    type="number"
                    value={formData.odds}
                  />
                  {errors.odds && (
                    <p className="text-destructive text-xs">{errors.odds}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stake">Stake ({formData.currency})</Label>
                  <Input
                    disabled={isSettledEdit}
                    id="stake"
                    min="0.01"
                    onChange={(e) => updateField("stake", e.target.value)}
                    placeholder="e.g., 100"
                    step="0.01"
                    type="number"
                    value={formData.stake}
                  />
                  {errors.stake && (
                    <p className="text-destructive text-xs">{errors.stake}</p>
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

              {isSettledEdit && (
                <div className="space-y-2">
                  <Label htmlFor="settlementOutcome">Correct outcome</Label>
                  <Select
                    onValueChange={(value) =>
                      updateField("settlementOutcome", value)
                    }
                    value={formData.settlementOutcome}
                  >
                    <SelectTrigger id="settlementOutcome">
                      <SelectValue placeholder="Select corrected outcome" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="won">Won</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                      <SelectItem value="push">Push</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.settlementOutcome && (
                    <p className="text-destructive text-xs">
                      {errors.settlementOutcome}
                    </p>
                  )}
                </div>
              )}

              {/* Date Placed */}
              <div className="space-y-2">
                <Label htmlFor="placedAt">Date Placed</Label>
                <Input
                  id="placedAt"
                  onChange={(e) => updateField("placedAt", e.target.value)}
                  type="datetime-local"
                  value={formData.placedAt}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">
                  {isSettledEdit ? "Correction reason" : "Notes (optional)"}
                </Label>
                <Textarea
                  id="notes"
                  onChange={(e) => updateField("notes", e.target.value)}
                  placeholder={
                    isSettledEdit
                      ? "Explain why this settled bet is being corrected..."
                      : "Any additional notes..."
                  }
                  rows={2}
                  value={formData.notes}
                />
                {errors.notes && (
                  <p className="text-destructive text-xs">{errors.notes}</p>
                )}
              </div>

              {/* Submit */}
              <Button
                className="w-full"
                disabled={isSubmitting || noAccountsForType}
                type="submit"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isEdit ? "Updating..." : "Creating..."}
                  </>
                ) : isEdit ? (
                  "Update Bet"
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
