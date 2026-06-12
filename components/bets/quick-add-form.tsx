"use client";

import { ArrowLeft, Gift, Loader2, Plus, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ValueWithTooltip } from "@/components/bets/calculation-tooltip";
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

type QuickAddFormProps = {
  bookmakers: AccountOption[];
  exchanges: AccountOption[];
  freeBets?: FreeBetOption[];
  initialValues?: Partial<FormData>;
  copiedFromMatchedBetId?: string;
  initialMatchInfo?: SelectedMatchInfo | null;
};

type FormData = {
  market: string;
  selection: string;
  matchId: string;
  unlinkedMatchDate: string;
  normalizedSelection: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | "";
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
};

type SplitLegFormData = {
  odds: string;
  stake: string;
};

type SelectedMatchInfo = {
  id: string;
  homeTeam: string;
  awayTeam: string;
};

export type QuickAddInitialValues = Partial<FormData>;
export type QuickAddInitialMatchInfo = SelectedMatchInfo;

export function QuickAddForm({
  bookmakers,
  exchanges,
  freeBets = [],
  initialValues,
  copiedFromMatchedBetId,
  initialMatchInfo = null,
}: QuickAddFormProps) {
  const router = useRouter();

  // Pick default selections based on available accounts
  const defaultBookmaker = bookmakers.length > 0 ? bookmakers[0].name : "";
  const defaultExchange = exchanges.length > 0 ? exchanges[0].name : "";
  const defaultBackCurrency =
    bookmakers.length > 0 ? (bookmakers[0].currency ?? "NOK") : "NOK";
  const defaultLayCurrency =
    exchanges.length > 0 ? (exchanges[0].currency ?? "NOK") : "NOK";

  const [formData, setFormData] = useState<FormData>({
    market: "",
    selection: "",
    matchId: "",
    unlinkedMatchDate: "",
    normalizedSelection: "",
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
    ...initialValues,
  });
  const [backLegs, setBackLegs] = useState<SplitLegFormData[]>([
    {
      odds: initialValues?.backOdds ?? "",
      stake: initialValues?.backStake ?? "",
    },
  ]);
  const [layLegs, setLayLegs] = useState<SplitLegFormData[]>([
    {
      odds: initialValues?.layOdds ?? "",
      stake: initialValues?.layStake ?? "",
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {}
  );
  const [selectedMatchInfo, setSelectedMatchInfo] =
    useState<SelectedMatchInfo | null>(initialMatchInfo);

  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const updateSplitLeg = (
    kind: "back" | "lay",
    index: number,
    field: keyof SplitLegFormData,
    value: string
  ) => {
    const setLegs = kind === "back" ? setBackLegs : setLayLegs;
    setLegs((prev) =>
      prev.map((leg, legIndex) =>
        legIndex === index ? { ...leg, [field]: value } : leg
      )
    );
  };

  const addSplitLeg = (kind: "back" | "lay") => {
    const setLegs = kind === "back" ? setBackLegs : setLayLegs;
    setLegs((prev) => [...prev, { odds: "", stake: "" }]);
  };

  const removeSplitLeg = (kind: "back" | "lay", index: number) => {
    const setLegs = kind === "back" ? setBackLegs : setLayLegs;
    setLegs((prev) => prev.filter((_, legIndex) => legIndex !== index));
  };

  // Filter available free bets based on selected bookmaker
  const availableFreeBets = useMemo(() => {
    const selectedBookmaker = bookmakers.find(
      (b) => b.name === formData.backBookmaker
    );
    if (!selectedBookmaker) {
      return freeBets;
    }
    // Show free bets for the selected bookmaker's account
    return freeBets.filter(
      (fb) => fb.accountId === selectedBookmaker.id || !fb.accountId
    );
  }, [bookmakers, formData.backBookmaker, freeBets]);

  // Get selected free bet details
  const selectedFreeBet = useMemo(() => {
    if (!formData.freeBetId) {
      return null;
    }
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
      const currentFreeBet = freeBets.find(
        (fb) => fb.id === formData.freeBetId
      );
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
      setBackLegs([
        { odds: backLegs[0]?.odds ?? "", stake: fb.value.toString() },
      ]);
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

  // When match is selected, auto-fill the market field and store team info
  const handleMatchChange = (match: MatchOption | null) => {
    if (match) {
      updateField("matchId", match.id);
      updateField("market", match.label);
      setSelectedMatchInfo({
        id: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
      });
    } else {
      updateField("matchId", "");
      updateField("normalizedSelection", "");
      updateField("selection", "");
      setSelectedMatchInfo(null);
    }
  };

  // When normalized selection is picked, update the selection text too
  const handleNormalizedSelectionChange = (
    value: "HOME_TEAM" | "AWAY_TEAM" | "DRAW"
  ) => {
    updateField("normalizedSelection", value);
    if (selectedMatchInfo) {
      if (value === "HOME_TEAM") {
        updateField("selection", `${selectedMatchInfo.homeTeam} to Win`);
      } else if (value === "AWAY_TEAM") {
        updateField("selection", `${selectedMatchInfo.awayTeam} to Win`);
      } else {
        updateField("selection", "Draw");
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
    if (
      !formData.matchId &&
      formData.unlinkedMatchDate &&
      Number.isNaN(Date.parse(formData.unlinkedMatchDate))
    ) {
      newErrors.unlinkedMatchDate = "Enter a valid match date";
    }
    const validBackLegs = backLegs.every(
      (leg) =>
        leg.odds &&
        Number.parseFloat(leg.odds) > 1 &&
        leg.stake &&
        Number.parseFloat(leg.stake) > 0
    );
    const validLayLegs = layLegs.every(
      (leg) =>
        leg.odds &&
        Number.parseFloat(leg.odds) > 1 &&
        leg.stake &&
        Number.parseFloat(leg.stake) > 0
    );

    if (!validBackLegs) {
      newErrors.backOdds = "Valid odds (> 1.0) required";
    }
    if (!validBackLegs) {
      newErrors.backStake = "Valid stake required";
    }
    if (!formData.backBookmaker.trim()) {
      newErrors.backBookmaker = "Bookmaker is required";
    }
    if (!validLayLegs) {
      newErrors.layOdds = "Valid odds (> 1.0) required";
    }
    if (!validLayLegs) {
      newErrors.layStake = "Valid stake required";
    }
    if (!formData.layExchange.trim()) {
      newErrors.layExchange = "Exchange is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculateLayLiability = (): number | null => {
    if (
      layLegs.some((leg) => {
        const odds = Number.parseFloat(leg.odds);
        const stake = Number.parseFloat(leg.stake);
        return Number.isNaN(odds) || Number.isNaN(stake) || odds <= 1;
      })
    ) {
      return null;
    }
    return layLegs.reduce(
      (total, leg) =>
        total +
        Number.parseFloat(leg.stake) * (Number.parseFloat(leg.odds) - 1),
      0
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors below");
      return;
    }

    setIsSubmitting(true);

    try {
      const parsedBackLegs = backLegs.map((leg) => ({
        odds: Number.parseFloat(leg.odds),
        stake: Number.parseFloat(leg.stake),
      }));
      const parsedLayLegs = layLegs.map((leg) => ({
        odds: Number.parseFloat(leg.odds),
        stake: Number.parseFloat(leg.stake),
      }));

      const response = await fetch("/api/bets/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market: formData.market.trim(),
          selection: formData.selection.trim(),
          matchId: formData.matchId || undefined,
          unlinkedMatchDate:
            !formData.matchId && formData.unlinkedMatchDate
              ? // Default to end of the match day (23:59 local) so auto-settle
                // runs the day after the match has been played.
                new Date(`${formData.unlinkedMatchDate}T23:59:00`).toISOString()
              : undefined,
          normalizedSelection: formData.normalizedSelection || undefined,
          promoType: formData.promoType || undefined,
          freeBetId: formData.freeBetId || undefined,
          back: {
            odds: parsedBackLegs[0]?.odds ?? 0,
            stake: parsedBackLegs[0]?.stake ?? 0,
            bookmaker: formData.backBookmaker.trim(),
            currency: formData.backCurrency,
            legs: parsedBackLegs,
          },
          lay: {
            odds: parsedLayLegs[0]?.odds ?? 0,
            stake: parsedLayLegs[0]?.stake ?? 0,
            exchange: formData.layExchange.trim(),
            currency: formData.layCurrency,
            legs: parsedLayLegs,
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
          className="inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
          href="/bets"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Add Matched Bet</CardTitle>
          <CardDescription>
            {copiedFromMatchedBetId
              ? "Copied values from an existing matched bet. Review and adjust before creating."
              : "Manually enter a matched bet without uploading screenshots"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(hasNoBookmakers || hasNoExchanges) && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="font-medium text-amber-900">
                Set up your accounts first
              </h3>
              <p className="mt-1 text-amber-800 text-sm">
                {hasNoBookmakers && hasNoExchanges
                  ? "Add at least one bookmaker and one exchange account before creating matched bets."
                  : hasNoBookmakers
                    ? "Add at least one bookmaker account before creating matched bets."
                    : "Add at least one exchange account before creating matched bets."}
              </p>
              <Button asChild className="mt-3" size="sm">
                <Link href="/bets/settings/accounts/new">
                  <Plus className="mr-1 h-4 w-4" />
                  Add Account
                </Link>
              </Button>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Market Details */}
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                Market Details
                <Trophy className="h-4 w-4 text-amber-500" />
              </h3>

              {/* Match Picker - optional link to synced football match */}
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

              {!formData.matchId && (
                <div className="space-y-2">
                  <Label htmlFor="unlinkedMatchDate">
                    Match Date (optional)
                  </Label>
                  <Input
                    className={
                      errors.unlinkedMatchDate ? "border-destructive" : ""
                    }
                    id="unlinkedMatchDate"
                    onChange={(e) =>
                      updateField("unlinkedMatchDate", e.target.value)
                    }
                    type="date"
                    value={formData.unlinkedMatchDate}
                  />
                  {errors.unlinkedMatchDate && (
                    <p className="text-destructive text-xs">
                      {errors.unlinkedMatchDate}
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    Auto-settlement for unlinked bets runs the day after this
                    date (defaults to 23:59 on the match day).
                  </p>
                </div>
              )}

              {/* Normalized Selection - shown when match is linked */}
              {selectedMatchInfo && (
                <div className="space-y-2">
                  <Label>Match Odds Selection (for auto-settle)</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="min-w-[100px] flex-1"
                      onClick={() =>
                        handleNormalizedSelectionChange("HOME_TEAM")
                      }
                      size="sm"
                      type="button"
                      variant={
                        formData.normalizedSelection === "HOME_TEAM"
                          ? "default"
                          : "outline"
                      }
                    >
                      {selectedMatchInfo.homeTeam}
                    </Button>
                    <Button
                      className="min-w-[80px] flex-1"
                      onClick={() => handleNormalizedSelectionChange("DRAW")}
                      size="sm"
                      type="button"
                      variant={
                        formData.normalizedSelection === "DRAW"
                          ? "default"
                          : "outline"
                      }
                    >
                      Draw
                    </Button>
                    <Button
                      className="min-w-[100px] flex-1"
                      onClick={() =>
                        handleNormalizedSelectionChange("AWAY_TEAM")
                      }
                      size="sm"
                      type="button"
                      variant={
                        formData.normalizedSelection === "AWAY_TEAM"
                          ? "default"
                          : "outline"
                      }
                    >
                      {selectedMatchInfo.awayTeam}
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Select your bet pick for reliable auto-settlement
                  </p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="market">Market</Label>
                  <Input
                    className={errors.market ? "border-destructive" : ""}
                    id="market"
                    onChange={(e) => updateField("market", e.target.value)}
                    placeholder="e.g., Man Utd vs Liverpool"
                    value={formData.market}
                  />
                  {errors.market && (
                    <p className="text-destructive text-xs">{errors.market}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="selection">Selection</Label>
                  <Input
                    className={errors.selection ? "border-destructive" : ""}
                    id="selection"
                    onChange={(e) => updateField("selection", e.target.value)}
                    placeholder="e.g., Man Utd to Win"
                    value={formData.selection}
                  />
                  {errors.selection && (
                    <p className="text-destructive text-xs">
                      {errors.selection}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="promoType">Promo Type (optional)</Label>
                <Select
                  onValueChange={handlePromoTypeChange}
                  value={formData.promoType}
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
              {(formData.promoType === "Free Bet" ||
                formData.promoType === "Risk-Free Bet") && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2" htmlFor="freeBet">
                    <Gift className="h-4 w-4 text-emerald-600" />
                    Use a Free Bet (optional)
                  </Label>
                  {availableFreeBets.length > 0 ? (
                    <>
                      <Select
                        onValueChange={handleFreeBetChange}
                        value={formData.freeBetId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a free bet to use..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableFreeBets.map((fb) => (
                            <SelectItem key={fb.id} value={fb.id}>
                              <span className="flex items-center gap-2">
                                {fb.name}
                                <span className="font-medium text-emerald-600">
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
                            Value: {selectedFreeBet.currency}{" "}
                            {selectedFreeBet.value.toFixed(2)}
                            {selectedFreeBet.minOdds && (
                              <span className="ml-3">
                                Min odds: {selectedFreeBet.minOdds.toFixed(2)}
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
                      {formData.backBookmaker && (
                        <span> for {formData.backBookmaker}</span>
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
            </div>

            {/* Back Bet */}
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-medium text-sm">Back Bet (Bookmaker)</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="backBookmaker">Bookmaker</Label>
                  <Select
                    onValueChange={handleBookmakerChange}
                    value={formData.backBookmaker}
                  >
                    <SelectTrigger
                      className={
                        errors.backBookmaker ? "border-destructive" : ""
                      }
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
                    <p className="text-destructive text-xs">
                      {errors.backBookmaker}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="backCurrency">Currency</Label>
                  <Select
                    onValueChange={(value) =>
                      updateField("backCurrency", value)
                    }
                    value={formData.backCurrency}
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
              <div className="space-y-3">
                {backLegs.map((leg, index) => (
                  <div
                    className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
                    key={index}
                  >
                    <div className="space-y-2">
                      <Label htmlFor={`backOdds-${index}`}>
                        Odds{backLegs.length > 1 ? ` ${index + 1}` : ""}
                      </Label>
                      <Input
                        className={errors.backOdds ? "border-destructive" : ""}
                        id={`backOdds-${index}`}
                        min="1.01"
                        onChange={(e) =>
                          updateSplitLeg("back", index, "odds", e.target.value)
                        }
                        placeholder="e.g., 2.50"
                        step="any"
                        type="number"
                        value={leg.odds}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`backStake-${index}`}>
                        Stake{backLegs.length > 1 ? ` ${index + 1}` : ""}
                      </Label>
                      <Input
                        className={errors.backStake ? "border-destructive" : ""}
                        id={`backStake-${index}`}
                        min="0.01"
                        onChange={(e) =>
                          updateSplitLeg("back", index, "stake", e.target.value)
                        }
                        placeholder="e.g., 100"
                        step="0.01"
                        type="number"
                        value={leg.stake}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        aria-label="Remove back split"
                        disabled={backLegs.length === 1}
                        onClick={() => removeSplitLeg("back", index)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {(errors.backOdds || errors.backStake) && (
                  <p className="text-destructive text-xs">
                    {errors.backOdds ?? errors.backStake}
                  </p>
                )}
                <Button
                  onClick={() => addSplitLeg("back")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add Back Split
                </Button>
              </div>
            </div>

            {/* Lay Bet */}
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-medium text-sm">Lay Bet (Exchange)</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="layExchange">Exchange</Label>
                  <Select
                    onValueChange={handleExchangeChange}
                    value={formData.layExchange}
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
                    <p className="text-destructive text-xs">
                      {errors.layExchange}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="layCurrency">Currency</Label>
                  <Select
                    onValueChange={(value) => updateField("layCurrency", value)}
                    value={formData.layCurrency}
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
              <div className="space-y-3">
                {layLegs.map((leg, index) => (
                  <div
                    className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
                    key={index}
                  >
                    <div className="space-y-2">
                      <Label htmlFor={`layOdds-${index}`}>
                        Odds{layLegs.length > 1 ? ` ${index + 1}` : ""}
                      </Label>
                      <Input
                        className={errors.layOdds ? "border-destructive" : ""}
                        id={`layOdds-${index}`}
                        min="1.01"
                        onChange={(e) =>
                          updateSplitLeg("lay", index, "odds", e.target.value)
                        }
                        placeholder="e.g., 2.52"
                        step="any"
                        type="number"
                        value={leg.odds}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`layStake-${index}`}>
                        Stake{layLegs.length > 1 ? ` ${index + 1}` : ""}
                      </Label>
                      <Input
                        className={errors.layStake ? "border-destructive" : ""}
                        id={`layStake-${index}`}
                        min="0.01"
                        onChange={(e) =>
                          updateSplitLeg("lay", index, "stake", e.target.value)
                        }
                        placeholder="e.g., 99.20"
                        step="0.01"
                        type="number"
                        value={leg.stake}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        aria-label="Remove lay split"
                        disabled={layLegs.length === 1}
                        onClick={() => removeSplitLeg("lay", index)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {(errors.layOdds || errors.layStake) && (
                  <p className="text-destructive text-xs">
                    {errors.layOdds ?? errors.layStake}
                  </p>
                )}
                <Button
                  onClick={() => addSplitLeg("lay")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add Lay Split
                </Button>
              </div>
              {layLiability !== null && (
                <p className="text-muted-foreground text-sm">
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
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Any additional notes..."
                rows={2}
                value={formData.notes}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <Button
                className="flex-1"
                disabled={isSubmitting}
                onClick={() => router.push("/bets")}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={isSubmitting || hasNoBookmakers || hasNoExchanges}
                type="submit"
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
