"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

const POPULAR_BOOKMAKERS = [
  "bet365",
  "Unibet",
  "Betway",
  "William Hill",
  "Paddy Power",
  "Betfair Sportsbook",
  "888sport",
  "Other",
] as const;

const EXCHANGES = [
  { value: "bfb247", label: "Betfair B247" },
  { value: "betfair", label: "Betfair Exchange" },
  { value: "smarkets", label: "Smarkets" },
  { value: "betdaq", label: "Betdaq" },
] as const;

interface FormData {
  market: string;
  selection: string;
  promoType: string;
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

const initialFormData: FormData = {
  market: "",
  selection: "",
  promoType: "",
  backOdds: "",
  backStake: "",
  backBookmaker: "",
  backCurrency: "NOK",
  layOdds: "",
  layStake: "",
  layExchange: "bfb247",
  layCurrency: "NOK",
  notes: "",
};

export default function QuickAddPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>(initialFormData);
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
          back: {
            odds: Number.parseFloat(formData.backOdds),
            stake: Number.parseFloat(formData.backStake),
            bookmaker: formData.backBookmaker.trim(),
            currency: formData.backCurrency,
          },
          lay: {
            odds: Number.parseFloat(formData.layOdds),
            stake: Number.parseFloat(formData.layStake),
            exchange: formData.layExchange,
            currency: formData.layCurrency,
          },
          notes: formData.notes.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create bet");
      }

      toast.success("Matched bet created successfully!");
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
                  onValueChange={(value) => updateField("promoType", value)}
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
            </div>

            {/* Back Bet */}
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="text-sm font-medium">Back Bet (Bookmaker)</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="backBookmaker">Bookmaker</Label>
                  <Select
                    value={formData.backBookmaker}
                    onValueChange={(value) =>
                      updateField("backBookmaker", value)
                    }
                  >
                    <SelectTrigger
                      className={errors.backBookmaker ? "border-destructive" : ""}
                    >
                      <SelectValue placeholder="Select bookmaker..." />
                    </SelectTrigger>
                    <SelectContent>
                      {POPULAR_BOOKMAKERS.map((bm) => (
                        <SelectItem key={bm} value={bm}>
                          {bm}
                        </SelectItem>
                      ))}
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
                    onValueChange={(value) => updateField("layExchange", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXCHANGES.map((ex) => (
                        <SelectItem key={ex.value} value={ex.value}>
                          {ex.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
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
