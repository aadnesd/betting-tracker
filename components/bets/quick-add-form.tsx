"use client";

import { ArrowLeft, Gift, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ValueWithTooltip } from "@/components/bets/calculation-tooltip";
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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

export interface AccountOption {
  id: string;
  name: string;
  kind: "bookmaker" | "exchange";
  currency: string | null;
}

export interface FreeBetOption {
  id: string;
  name: string;
  value: number;
  currency: string;
  accountId: string | null;
  accountName: string | null;
  expiresAt: string | null;
  minOdds: number | null;
}

interface QuickAddFormProps {
  bookmakers: AccountOption[];
  exchanges: AccountOption[];
  freeBets?: FreeBetOption[];
}

interface FormData {
  market: string;
  selection: string;
  promoType: string;
  freeBetId: string;
  backOdds: string;
  backStake: string;
  backBookmaker: string;
  backCurrency: string;
  layOdds: string;
  layStake: string;
  layExchange: string;
  layCurrency: string;
  notes: string;
}

export function QuickAddForm({ bookmakers, exchanges, freeBets = [] }: QuickAddFormProps) {
  const router = useRouter();

  // Pick default selections based on available accounts
  const defaultBookmaker = bookmakers.length > 0 ? bookmakers[0].name : "";
  const defaultExchange = exchanges.length > 0 ? exchanges[0].name : "";
  const defaultBackCurrency = bookmakers.length > 0 
    ? (bookmakers[0].currency ?? "NOK") 
    : "NOK";
  const defaultLayCurrency = exchanges.length > 0 
    ? (exchanges[0].currency ?? "NOK") 
    : "NOK";

  const [formData, setFormData] = useState<FormData>({
    market: "",
    selection: "",
    promoType: "",
    freeBetId: "",
    backOdds: "",
    backStake: "",
    backBookmaker: defaultBookmaker,
    backCurrency: defaultBackCurrency,
    layOdds: "",
    layStake: "",
    layExchange: defaultExchange,
    layCurrency: defaultLayCurrency,
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {}
  );

  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  // Filter available free bets based on selected bookmaker
  const availableFreeBets = useMemo(() => {
    const selectedBookmaker = bookmakers.find(
      (b) => b.name === formData.backBookmaker
    );
    if (!selectedBookmaker) return freeBets;
    // Show free bets for the selected bookmaker's account
    return freeBets.filter(
      (fb) => fb.accountId === selectedBookmaker.id || !fb.accountId
    );
  }, [bookmakers, formData.backBookmaker, freeBets]);

  // Get selected free bet details
  const selectedFreeBet = useMemo(() => {
    if (!formData.freeBetId) return null;
    return freeBets.find((fb) => fb.id === formData.freeBetId) ?? null;
  }, [formData.freeBetId, freeBets]);

  // When bookmaker changes, update currency to match account's currency
  const handleBookmakerChange = (value: string) => {
    if (value === "__add_new__") {
      router.push("/bets/settings/accounts/new?return=/bets/quick-add");
      return;
    }
    updateField("backBookmaker", value);
    const selected = bookmakers.find((b) => b.name === value);
    if (selected?.currency) {
      updateField("backCurrency", selected.currency);
    }
    // Clear free bet selection when bookmaker changes
    if (formData.freeBetId) {
      const currentFreeBet = freeBets.find((fb) => fb.id === formData.freeBetId);
      if (currentFreeBet && currentFreeBet.accountId !== selected?.id) {
        updateField("freeBetId", "");
      }
    }
  };

  // When promo type changes, clear free bet if not "Free Bet" type
  const handlePromoTypeChange = (value: string) => {
    updateField("promoType", value);
    if (value !== "Free Bet" && value !== "Risk-Free Bet") {
      updateField("freeBetId", "");
    }
  };

  // When free bet is selected, auto-fill stake and currency
  const handleFreeBetChange = (freeBetId: string) => {
    updateField("freeBetId", freeBetId);
    const fb = freeBets.find((f) => f.id === freeBetId);
    if (fb) {
      updateField("backStake", fb.value.toString());
      updateField("backCurrency", fb.currency);
      // Also select the bookmaker if the free bet has an account
      if (fb.accountName) {
        const bookmaker = bookmakers.find((b) => b.name === fb.accountName);
        if (bookmaker) {
          updateField("backBookmaker", bookmaker.name);
        }
      }
    }
  };

  // When exchange changes, update currency to match account's currency
  const handleExchangeChange = (value: string) => {
    if (value === "__add_new__") {
      router.push("/bets/settings/accounts/new?return=/bets/quick-add");
      return;
    }
    updateField("layExchange", value);
    const selected = exchanges.find((e) => e.name === value);
    if (selected?.currency) {
      updateField("layCurrency", selected.currency);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.market.trim()) {
      newErrors.market = "Market is required";
    }
    if (!formData.selection.trim()) {
      newErrors.selection = "Selection is required";
    }
    if (!formData.backOdds || Number.parseFloat(formData.backOdds) <= 1) {
      newErrors.backOdds = "Valid odds (> 1.0) required";
    }
    if (!formData.backStake || Number.parseFloat(formData.backStake) <= 0) {
      newErrors.backStake = "Valid stake required";
    }
    if (!formData.backBookmaker.trim()) {
      newErrors.backBookmaker = "Bookmaker is required";
    }
    if (!formData.layOdds || Number.parseFloat(formData.layOdds) <= 1) {
      newErrors.layOdds = "Valid odds (> 1.0) required";
    }
    if (!formData.layStake || Number.parseFloat(formData.layStake) <= 0) {
      newErrors.layStake = "Valid stake required";
    }
    if (!formData.layExchange.trim()) {
      newErrors.layExchange = "Exchange is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculateLayLiability = (): number | null => {
    const odds = Number.parseFloat(formData.layOdds);
    const stake = Number.parseFloat(formData.layStake);
    if (Number.isNaN(odds) || Number.isNaN(stake) || odds <= 1) {
      return null;
    }
    return stake * (odds - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors below");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/bets/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market: formData.market.trim(),
          selection: formData.selection.trim(),
          promoType: formData.promoType || undefined,
          freeBetId: formData.freeBetId || undefined,
          back: {
            odds: Number.parseFloat(formData.backOdds),
            stake: Number.parseFloat(formData.backStake),
            bookmaker: formData.backBookmaker.trim(),
            currency: formData.backCurrency,
          },
          lay: {
            odds: Number.parseFloat(formData.layOdds),
            stake: Number.parseFloat(formData.layStake),
            exchange: formData.layExchange.trim(),
            currency: formData.layCurrency,
          },
          notes: formData.notes.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create bet");
      }

      toast.success(
        formData.freeBetId 
          ? "Matched bet created and free bet marked as used!" 
          : "Matched bet created successfully!"
      );
      router.push("/bets");
    } catch (error) {
      console.error("Quick add error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create bet"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const layLiability = calculateLayLiability();

  const hasNoBookmakers = bookmakers.length === 0;
  const hasNoExchanges = exchanges.length === 0;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/bets"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Add Matched Bet</CardTitle>
          <CardDescription>
            Manually enter a matched bet without uploading screenshots
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(hasNoBookmakers || hasNoExchanges) && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="font-medium text-amber-900">Set up your accounts first</h3>
              <p className="text-sm text-amber-800 mt-1">
                {hasNoBookmakers && hasNoExchanges
                  ? "Add at least one bookmaker and one exchange account before creating matched bets."
                  : hasNoBookmakers
                    ? "Add at least one bookmaker account before creating matched bets."
                    : "Add at least one exchange account before creating matched bets."}
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link href="/bets/settings/accounts/new">
                  <Plus className="mr-1 h-4 w-4" />
                  Add Account
                </Link>
              </Button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Market Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Market Details
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="market">Market</Label>
                  <Input
                    id="market"
                    placeholder="e.g., Man Utd vs Liverpool"
                    value={formData.market}
                    onChange={(e) => updateField("market", e.target.value)}
                    className={errors.market ? "border-destructive" : ""}
                  />
                  {errors.market && (
                    <p className="text-xs text-destructive">{errors.market}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="selection">Selection</Label>
                  <Input
                    id="selection"
                    placeholder="e.g., Man Utd to Win"
                    value={formData.selection}
                    onChange={(e) => updateField("selection", e.target.value)}
                    className={errors.selection ? "border-destructive" : ""}
                  />
                  {errors.selection && (
                    <p className="text-xs text-destructive">
                      {errors.selection}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="promoType">Promo Type (optional)</Label>
                <Select
                  value={formData.promoType}
                  onValueChange={handlePromoTypeChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select promo type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PROMO_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Free Bet Selector - shown when promo type is Free Bet or Risk-Free Bet */}
              {(formData.promoType === "Free Bet" || formData.promoType === "Risk-Free Bet") && (
                <div className="space-y-2">
                  <Label htmlFor="freeBet" className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-emerald-600" />
                    Use a Free Bet (optional)
                  </Label>
                  {availableFreeBets.length > 0 ? (
                    <>
                      <Select
                        value={formData.freeBetId}
                        onValueChange={handleFreeBetChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a free bet to use..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableFreeBets.map((fb) => (
                            <SelectItem key={fb.id} value={fb.id}>
                              <span className="flex items-center gap-2">
                                {fb.name}
                                <span className="text-emerald-600 font-medium">
                                  {fb.currency} {fb.value.toFixed(2)}
                                </span>
                                {fb.accountName && (
                                  <span className="text-muted-foreground text-xs">
                                    @ {fb.accountName}
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
                            Value: {selectedFreeBet.currency} {selectedFreeBet.value.toFixed(2)}
                            {selectedFreeBet.minOdds && (
                              <span className="ml-3">Min odds: {selectedFreeBet.minOdds.toFixed(2)}</span>
                            )}
                            {selectedFreeBet.expiresAt && (
                              <span className="ml-3">
                                Expires: {new Date(selectedFreeBet.expiresAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-md border border-muted bg-muted/50 p-3 text-sm text-muted-foreground">
                      No active free bets available
                      {formData.backBookmaker && (
                        <span> for {formData.backBookmaker}</span>
                      )}
                      .{" "}
                      <Link href="/bets/settings/promos/new" className="text-primary hover:underline">
                        Add one
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Back Bet */}
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="text-sm font-medium">Back Bet (Bookmaker)</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="backBookmaker">Bookmaker</Label>
                  <Select
                    value={formData.backBookmaker}
                    onValueChange={handleBookmakerChange}
                  >
                    <SelectTrigger
                      className={errors.backBookmaker ? "border-destructive" : ""}
                    >
                      <SelectValue placeholder="Select bookmaker..." />
                    </SelectTrigger>
                    <SelectContent>
                      {bookmakers.map((bm) => (
                        <SelectItem key={bm.id} value={bm.name}>
                          {bm.name}
                          {bm.currency && (
                            <span className="ml-2 text-muted-foreground text-xs">
                              ({bm.currency})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                      {bookmakers.length > 0 && <SelectSeparator />}
                      <SelectItem value="__add_new__">
                        <span className="flex items-center gap-1 text-primary">
                          <Plus className="h-3 w-3" />
                          Add new bookmaker
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.backBookmaker && (
                    <p className="text-xs text-destructive">
                      {errors.backBookmaker}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="backCurrency">Currency</Label>
                  <Select
                    value={formData.backCurrency}
                    onValueChange={(value) =>
                      updateField("backCurrency", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NOK">NOK</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="SEK">SEK</SelectItem>
                      <SelectItem value="DKK">DKK</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="backOdds">Odds</Label>
                  <Input
                    id="backOdds"
                    type="number"
                    step="0.01"
                    min="1.01"
                    placeholder="e.g., 2.50"
                    value={formData.backOdds}
                    onChange={(e) => updateField("backOdds", e.target.value)}
                    className={errors.backOdds ? "border-destructive" : ""}
                  />
                  {errors.backOdds && (
                    <p className="text-xs text-destructive">{errors.backOdds}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="backStake">Stake</Label>
                  <Input
                    id="backStake"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g., 100"
                    value={formData.backStake}
                    onChange={(e) => updateField("backStake", e.target.value)}
                    className={errors.backStake ? "border-destructive" : ""}
                  />
                  {errors.backStake && (
                    <p className="text-xs text-destructive">
                      {errors.backStake}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Lay Bet */}
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="text-sm font-medium">Lay Bet (Exchange)</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="layExchange">Exchange</Label>
                  <Select
                    value={formData.layExchange}
                    onValueChange={handleExchangeChange}
                  >
                    <SelectTrigger
                      className={errors.layExchange ? "border-destructive" : ""}
                    >
                      <SelectValue placeholder="Select exchange..." />
                    </SelectTrigger>
                    <SelectContent>
                      {exchanges.map((ex) => (
                        <SelectItem key={ex.id} value={ex.name}>
                          {ex.name}
                          {ex.currency && (
                            <span className="ml-2 text-muted-foreground text-xs">
                              ({ex.currency})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                      {exchanges.length > 0 && <SelectSeparator />}
                      <SelectItem value="__add_new__">
                        <span className="flex items-center gap-1 text-primary">
                          <Plus className="h-3 w-3" />
                          Add new exchange
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.layExchange && (
                    <p className="text-xs text-destructive">
                      {errors.layExchange}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="layCurrency">Currency</Label>
                  <Select
                    value={formData.layCurrency}
                    onValueChange={(value) => updateField("layCurrency", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NOK">NOK</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="SEK">SEK</SelectItem>
                      <SelectItem value="DKK">DKK</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="layOdds">Odds</Label>
                  <Input
                    id="layOdds"
                    type="number"
                    step="0.01"
                    min="1.01"
                    placeholder="e.g., 2.52"
                    value={formData.layOdds}
                    onChange={(e) => updateField("layOdds", e.target.value)}
                    className={errors.layOdds ? "border-destructive" : ""}
                  />
                  {errors.layOdds && (
                    <p className="text-xs text-destructive">{errors.layOdds}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="layStake">Stake</Label>
                  <Input
                    id="layStake"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g., 99.20"
                    value={formData.layStake}
                    onChange={(e) => updateField("layStake", e.target.value)}
                    className={errors.layStake ? "border-destructive" : ""}
                  />
                  {errors.layStake && (
                    <p className="text-xs text-destructive">
                      {errors.layStake}
                    </p>
                  )}
                </div>
              </div>
              {layLiability !== null && (
                <p className="text-sm text-muted-foreground">
                  <ValueWithTooltip type="layLiability">
                    Lay Liability:{" "}
                    <span className="font-medium">
                      {formData.layCurrency} {layLiability.toFixed(2)}
                    </span>
                  </ValueWithTooltip>
                </p>
              )}
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

            {/* Actions */}
            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => router.push("/bets")}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="flex-1" 
                disabled={isSubmitting || hasNoBookmakers || hasNoExchanges}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Matched Bet"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
