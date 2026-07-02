"use client";

import { ArrowLeft, Gift, Loader2, Plus, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  accountName: string;
};

type SelectedMatchInfo = {
  id: string;
  homeTeam: string;
  awayTeam: string;
};

type LayStakeCalculation = {
  layStake: number;
  layLiability: number;
  balancedLayStake: number;
  profitIfBackWins: number;
  profitIfLayWins: number;
  commissionRate: number;
  backRateToNok: number;
  layRateToNok: number;
};

type LayStakeMode = "balanced" | "underlay" | "overlay";

export type QuickAddInitialValues = Partial<FormData>;
export type QuickAddInitialMatchInfo = SelectedMatchInfo;

function parsePositiveDecimal(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatStakeInput(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

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
      accountName: initialValues?.backBookmaker ?? defaultBookmaker,
    },
  ]);
  const [layLegs, setLayLegs] = useState<SplitLegFormData[]>([
    {
      odds: initialValues?.layOdds ?? "",
      stake: initialValues?.layStake ?? "",
      accountName: initialValues?.layExchange ?? defaultExchange,
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {}
  );
  const [selectedMatchInfo, setSelectedMatchInfo] =
    useState<SelectedMatchInfo | null>(initialMatchInfo);
  const [layStakeCalculation, setLayStakeCalculation] =
    useState<LayStakeCalculation | null>(null);
  const [isCalculatingLayStake, setIsCalculatingLayStake] = useState(false);
  const [layStakeMode, setLayStakeMode] = useState<LayStakeMode>("balanced");
  const [layStakeBias, setLayStakeBias] = useState(50);

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
    const defaultAccount =
      kind === "back" ? formData.backBookmaker : formData.layExchange;
    setLegs((prev) => [
      ...prev,
      { odds: "", stake: "", accountName: defaultAccount },
    ]);
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

  useEffect(() => {
    if (backLegs.length !== 1 || layLegs.length !== 1) {
      setLayStakeCalculation(null);
      setIsCalculatingLayStake(false);
      return;
    }

    const backOdds = parsePositiveDecimal(backLegs[0]?.odds ?? "");
    const backStake = parsePositiveDecimal(backLegs[0]?.stake ?? "");
    const layOdds = parsePositiveDecimal(layLegs[0]?.odds ?? "");

    if (
      backOdds === null ||
      backStake === null ||
      layOdds === null ||
      backOdds <= 1 ||
      layOdds <= 1 ||
      !formData.backCurrency ||
      !formData.layCurrency ||
      !formData.layExchange
    ) {
      setLayStakeCalculation(null);
      setIsCalculatingLayStake(false);
      return;
    }

    const controller = new AbortController();
    setIsCalculatingLayStake(true);

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/bets/calculate-lay-stake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            backOdds,
            backStake,
            backCurrency: formData.backCurrency,
            layOdds,
            layCurrency: formData.layCurrency,
            layExchange: formData.layExchange,
            promoType: formData.promoType || undefined,
            freeBetStakeReturned: selectedFreeBet?.stakeReturned ?? false,
            strategy: layStakeMode,
            biasPercent: layStakeMode === "balanced" ? 0 : layStakeBias,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to calculate lay stake");
        }

        const calculation = (await response.json()) as LayStakeCalculation;
        if (controller.signal.aborted) {
          return;
        }

        const nextStake = formatStakeInput(calculation.layStake);
        setLayLegs((prev) => {
          if (prev.length !== 1 || prev[0].stake === nextStake) {
            return prev;
          }
          return [{ ...prev[0], stake: nextStake }];
        });
        setFormData((prev) =>
          prev.layStake === nextStake ? prev : { ...prev, layStake: nextStake }
        );
        setLayStakeCalculation(calculation);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Lay stake calculation failed:", error);
          setLayStakeCalculation(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsCalculatingLayStake(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [
    backLegs.length,
    backLegs[0]?.odds,
    backLegs[0]?.stake,
    layLegs.length,
    layLegs[0]?.odds,
    formData.backCurrency,
    formData.layCurrency,
    formData.layExchange,
    formData.promoType,
    layStakeBias,
    layStakeMode,
    selectedFreeBet?.stakeReturned,
  ]);

  // When bookmaker changes, update currency to match and sync first leg's account
  const handleBookmakerChange = (value: string) => {
    if (value === "__add_new__") {
      router.push("/bets/settings/accounts/new?return=/bets/quick-add");
      return;
    }
    const prevBookmaker = formData.backBookmaker;
    updateField("backBookmaker", value);
    const allBackAccounts = [...bookmakers, ...exchanges];
    const selected = allBackAccounts.find((b) => b.name === value);
    if (selected?.currency) {
      updateField("backCurrency", selected.currency);
    }
    // Sync leg accounts that still match the old section-level selection
    setBackLegs((prev) =>
      prev.map((leg) =>
        leg.accountName === prevBookmaker || !leg.accountName
          ? { ...leg, accountName: value }
          : leg
      )
    );
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
      updateField("backCurrency", fb.currency);
      // Also select the bookmaker if the free bet has an account
      const fbBookmaker = fb.accountName
        ? bookmakers.find((b) => b.name === fb.accountName)
        : undefined;
      if (fbBookmaker) {
        updateField("backBookmaker", fbBookmaker.name);
      }
      setBackLegs([
        {
          odds: backLegs[0]?.odds ?? "",
          stake: fb.value.toString(),
          accountName: fbBookmaker?.name ?? formData.backBookmaker,
        },
      ]);
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
        accountName: leg.accountName || formData.backBookmaker,
      }));
      const parsedLayLegs = layLegs.map((leg) => ({
        odds: Number.parseFloat(leg.odds),
        stake: Number.parseFloat(leg.stake),
        accountName: leg.accountName || formData.layExchange,
      }));

      // Use the first leg's account as the primary bookmaker for the combined bet
      const primaryBookmaker =
        parsedBackLegs[0]?.accountName ?? formData.backBookmaker.trim();

      // Build split-account note when legs use different accounts
      const uniqueBackAccounts = new Set(
        parsedBackLegs.map((leg) => leg.accountName)
      );
      const splitAccountNote =
        parsedBackLegs.length > 1 && uniqueBackAccounts.size > 1
          ? `Back split accounts: ${parsedBackLegs
              .map(
                (leg) =>
                  `${leg.accountName} ${formData.backCurrency} ${leg.stake.toFixed(2)} @ ${leg.odds.toFixed(4)}`
              )
              .join(", ")}`
          : null;

      const uniqueLayAccounts = new Set(
        parsedLayLegs.map((leg) => leg.accountName)
      );
      const laySplitAccountNote =
        parsedLayLegs.length > 1 && uniqueLayAccounts.size > 1
          ? `Lay split accounts: ${parsedLayLegs
              .map(
                (leg) =>
                  `${leg.accountName} ${formData.layCurrency} ${leg.stake.toFixed(2)} @ ${leg.odds.toFixed(4)}`
              )
              .join(", ")}`
          : null;

      const combinedNotes =
        [formData.notes.trim(), splitAccountNote, laySplitAccountNote]
          .filter(Boolean)
          .join("\n") || undefined;

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
            bookmaker: primaryBookmaker,
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
          notes: combinedNotes,
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

  const hasNoBookmakers = bookmakers.length === 0 && exchanges.length === 0;
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
                  ? "Add at least one bookmaker or exchange account before creating matched bets."
                  : hasNoBookmakers
                    ? "Add at least one bookmaker or exchange account before creating matched bets."
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
              <h3 className="font-medium text-sm">Back Bet</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="backBookmaker">Account</Label>
                  <Select
                    onValueChange={handleBookmakerChange}
                    value={formData.backBookmaker}
                  >
                    <SelectTrigger
                      className={
                        errors.backBookmaker ? "border-destructive" : ""
                      }
                    >
                      <SelectValue placeholder="Select account..." />
                    </SelectTrigger>
                    <SelectContent>
                      {bookmakers.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Bookmakers</SelectLabel>
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
                        </SelectGroup>
                      )}
                      {exchanges.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Exchanges</SelectLabel>
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
                        </SelectGroup>
                      )}
                      {(bookmakers.length > 0 || exchanges.length > 0) && (
                        <SelectSeparator />
                      )}
                      <SelectItem value="__add_new__">
                        <span className="flex items-center gap-1 text-primary">
                          <Plus className="h-3 w-3" />
                          Add new account
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
                  <div className="space-y-2" key={index}>
                    {backLegs.length > 1 && (
                      <div className="space-y-1">
                        <Label htmlFor={`backAccount-${index}`}>
                          Account {index + 1}
                        </Label>
                        <Select
                          onValueChange={(value) => {
                            if (value === "__add_new__") {
                              router.push(
                                "/bets/settings/accounts/new?return=/bets/quick-add"
                              );
                              return;
                            }
                            updateSplitLeg("back", index, "accountName", value);
                          }}
                          value={leg.accountName}
                        >
                          <SelectTrigger id={`backAccount-${index}`}>
                            <SelectValue placeholder="Select account..." />
                          </SelectTrigger>
                          <SelectContent>
                            {bookmakers.length > 0 && (
                              <SelectGroup>
                                <SelectLabel>Bookmakers</SelectLabel>
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
                              </SelectGroup>
                            )}
                            {exchanges.length > 0 && (
                              <SelectGroup>
                                <SelectLabel>Exchanges</SelectLabel>
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
                              </SelectGroup>
                            )}
                            {(bookmakers.length > 0 ||
                              exchanges.length > 0) && <SelectSeparator />}
                            <SelectItem value="__add_new__">
                              <span className="flex items-center gap-1 text-primary">
                                <Plus className="h-3 w-3" />
                                Add new account
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                      <div className="space-y-2">
                        <Label htmlFor={`backOdds-${index}`}>
                          Odds{backLegs.length > 1 ? ` ${index + 1}` : ""}
                        </Label>
                        <Input
                          className={
                            errors.backOdds ? "border-destructive" : ""
                          }
                          id={`backOdds-${index}`}
                          min="1.01"
                          onChange={(e) =>
                            updateSplitLeg(
                              "back",
                              index,
                              "odds",
                              e.target.value
                            )
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
                          className={
                            errors.backStake ? "border-destructive" : ""
                          }
                          id={`backStake-${index}`}
                          min="0.01"
                          onChange={(e) =>
                            updateSplitLeg(
                              "back",
                              index,
                              "stake",
                              e.target.value
                            )
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
                  <div className="space-y-2" key={index}>
                    {layLegs.length > 1 && (
                      <div className="space-y-1">
                        <Label htmlFor={`layAccount-${index}`}>
                          Account {index + 1}
                        </Label>
                        <Select
                          onValueChange={(value) => {
                            if (value === "__add_new__") {
                              router.push(
                                "/bets/settings/accounts/new?return=/bets/quick-add"
                              );
                              return;
                            }
                            updateSplitLeg("lay", index, "accountName", value);
                          }}
                          value={leg.accountName}
                        >
                          <SelectTrigger id={`layAccount-${index}`}>
                            <SelectValue placeholder="Select exchange..." />
                          </SelectTrigger>
                          <SelectContent>
                            {exchanges.length > 0 && (
                              <SelectGroup>
                                <SelectLabel>Exchanges</SelectLabel>
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
                              </SelectGroup>
                            )}
                            {exchanges.length > 0 && <SelectSeparator />}
                            <SelectItem value="__add_new__">
                              <span className="flex items-center gap-1 text-primary">
                                <Plus className="h-3 w-3" />
                                Add new exchange
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
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
                          className={
                            errors.layStake ? "border-destructive" : ""
                          }
                          id={`layStake-${index}`}
                          min="0.01"
                          onChange={(e) =>
                            updateSplitLeg(
                              "lay",
                              index,
                              "stake",
                              e.target.value
                            )
                          }
                          placeholder="e.g., 99.20"
                          step="0.01"
                          type="number"
                          value={leg.stake}
                        />
                        {layLegs.length === 1 && index === 0 && (
                          <p className="text-muted-foreground text-xs">
                            {isCalculatingLayStake
                              ? "Calculating optimal lay stake..."
                              : layStakeCalculation
                                ? `${layStakeMode === "underlay" ? "Underlay" : layStakeMode === "overlay" ? "Overlay" : "Auto-calculated"} using ${formData.backCurrency}/${formData.layCurrency}${
                                    layStakeCalculation.commissionRate > 0
                                      ? ` and ${(layStakeCalculation.commissionRate * 100).toFixed(1)}% commission`
                                      : ""
                                  }.`
                                : "Enter back stake, back odds, and lay odds to auto-calculate."}
                          </p>
                        )}
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
                  </div>
                ))}
                {layLegs.length === 1 && (
                  <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["balanced", "Equal"],
                          ["underlay", "Underlay"],
                          ["overlay", "Overlay"],
                        ] as const
                      ).map(([mode, label]) => (
                        <Button
                          key={mode}
                          onClick={() => setLayStakeMode(mode)}
                          size="sm"
                          type="button"
                          variant={
                            layStakeMode === mode ? "default" : "outline"
                          }
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                    {layStakeMode !== "balanced" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label
                            className="text-muted-foreground text-xs"
                            htmlFor="layStakeBias"
                          >
                            {layStakeMode === "underlay"
                              ? "Underlay strength"
                              : "Overlay strength"}
                          </Label>
                          <span className="font-medium text-xs">
                            {layStakeBias}%
                          </span>
                        </div>
                        <Input
                          id="layStakeBias"
                          max="100"
                          min="0"
                          onChange={(e) =>
                            setLayStakeBias(Number.parseInt(e.target.value, 10))
                          }
                          step="5"
                          type="range"
                          value={layStakeBias}
                        />
                        <p className="text-muted-foreground text-xs">
                          0% keeps the equal-profit stake. 100% moves the lay
                          stake 50%{" "}
                          {layStakeMode === "underlay" ? "below" : "above"} the
                          equal stake.
                        </p>
                      </div>
                    )}
                    {layStakeCalculation && (
                      <div className="grid gap-2 text-xs sm:grid-cols-3">
                        <div>
                          <span className="text-muted-foreground">
                            Equal stake
                          </span>
                          <div className="font-medium">
                            {formData.layCurrency}{" "}
                            {layStakeCalculation.balancedLayStake.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            If back wins
                          </span>
                          <div className="font-medium">
                            NOK{" "}
                            {layStakeCalculation.profitIfBackWins.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            If lay wins
                          </span>
                          <div className="font-medium">
                            NOK {layStakeCalculation.profitIfLayWins.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
