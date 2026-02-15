"use client";
import { LinkIcon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ComponentProps, useMemo, useState } from "react";
import { toast } from "sonner";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { type MatchOption, MatchPicker } from "@/components/bets/match-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type AccountOption, applyAccountSelection } from "@/lib/bet-accounts";
import type { ParsedPair } from "@/lib/bet-parser";
import { cn } from "@/lib/utils";

const LOW_CONFIDENCE_THRESHOLD = 0.8;

type ScreenshotRecord = {
  id: string;
  url: string;
  kind: "back" | "lay";
  filename?: string | null;
};

type ParsedForm = {
  market: string;
  selection: string;
  notes?: string;
  needsReview: boolean;
  matchId?: string | null;
  matchConfidence?: string | null;
  matchCandidates?: number | null;
  back: ParsedPair["back"];
  lay: ParsedPair["lay"];
};

interface BetIngestFormProps {
  bookmakers: AccountOption[];
  exchanges: AccountOption[];
}

export function BetIngestForm({ bookmakers, exchanges }: BetIngestFormProps) {
  const router = useRouter();
  const [backFile, setBackFile] = useState<File | null>(null);
  const [layFile, setLayFile] = useState<File | null>(null);
  const [screenshots, setScreenshots] = useState<{
    back?: ScreenshotRecord;
    lay?: ScreenshotRecord;
  }>({});
  const [parsed, setParsed] = useState<ParsedForm | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const marketConfidence = resolveCombinedConfidence(parsed, "market");
  const selectionConfidence = resolveCombinedConfidence(parsed, "selection");

  const netExposure = useMemo(() => {
    if (!parsed) {
      return null;
    }
    const backProfit = parsed.back.stake * (parsed.back.odds - 1);
    const layLiability = parsed.lay.stake * (parsed.lay.odds - 1);
    return Number((backProfit - layLiability).toFixed(2));
  }, [parsed]);

  const handleUploadAndParse = async () => {
    if (!backFile || !layFile) {
      toast.error("Please select both back and lay screenshots.");
      return;
    }

    setIsUploading(true);
    setIsParsing(false);
    setIsSaving(false);

    try {
      const formData = new FormData();
      formData.append("back", backFile);
      formData.append("lay", layFile);

      const uploadResp = await fetch("/api/bets/screenshots", {
        method: "POST",
        body: formData,
      });

      if (!uploadResp.ok) {
        throw new Error("Upload failed");
      }

      const uploadJson = await uploadResp.json();
      setScreenshots({
        back: uploadJson.back,
        lay: uploadJson.lay,
      });

      setIsParsing(true);
      const parseResp = await fetch("/api/bets/autoparse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backScreenshotId: uploadJson.back.id,
          layScreenshotId: uploadJson.lay.id,
        }),
      });

      if (!parseResp.ok) {
        throw new Error("Parsing failed");
      }

      const parsedJson: ParsedPair & {
        matchId?: string | null;
        matchConfidence?: string | null;
        matchCandidates?: number | null;
      } = await parseResp.json();

      const normalizedLayCurrency = parsedJson.lay.currency
        ? parsedJson.lay.currency.toUpperCase()
        : "NOK";

      setParsed({
        market: parsedJson.back.market ?? parsedJson.lay.market,
        selection: parsedJson.back.selection ?? parsedJson.lay.selection,
        needsReview: parsedJson.needsReview,
        notes: parsedJson.notes,
        matchId: parsedJson.matchId,
        matchConfidence: parsedJson.matchConfidence,
        matchCandidates: parsedJson.matchCandidates,
        back: parsedJson.back,
        lay: {
          ...parsedJson.lay,
          currency: normalizedLayCurrency,
        },
      });

      toast.success("Screenshots parsed. Review & confirm below.");
    } catch (error) {
      console.error(error);
      toast.error("Upload or parsing failed. Please retry.");
    } finally {
      setIsUploading(false);
      setIsParsing(false);
    }
  };

  const handleSave = async () => {
    if (!parsed || !screenshots.back || !screenshots.lay) {
      toast.error("Nothing to save yet.");
      return;
    }

    setIsSaving(true);
    try {
      const resp = await fetch("/api/bets/create-matched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backScreenshotId: screenshots.back.id,
          layScreenshotId: screenshots.lay.id,
          market: parsed.market,
          selection: parsed.selection,
          matchId: parsed.matchId,
          needsReview: parsed.needsReview,
          notes: parsed.notes,
          back: parsed.back,
          lay: parsed.lay,
        }),
      });

      if (!resp.ok) {
        throw new Error("Failed to save matched bet");
      }

      toast.success("Matched bet saved.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save matched bet.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAccount = () => {
    router.push("/bets/settings/accounts/new");
  };

  const handleMatchChange = (match: MatchOption | null) => {
    setParsed((prev) =>
      prev
        ? {
            ...prev,
            matchId: match?.id ?? null,
          }
        : prev
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Upload screenshots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="back-file">Back bet (bookmaker)</Label>
                <Input
                  accept="image/png,image/jpeg"
                  id="back-file"
                  onChange={(e) => setBackFile(e.target.files?.[0] ?? null)}
                  type="file"
                />
                {screenshots.back?.url && (
                  <Image
                    alt="Back screenshot"
                    className="h-48 w-full rounded-md border object-cover"
                    height={192}
                    src={screenshots.back.url}
                    width={320}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lay-file">Lay bet (exchange)</Label>
                <Input
                  accept="image/png,image/jpeg"
                  id="lay-file"
                  onChange={(e) => setLayFile(e.target.files?.[0] ?? null)}
                  type="file"
                />
                {screenshots.lay?.url && (
                  <Image
                    alt="Lay screenshot"
                    className="h-48 w-full rounded-md border object-cover"
                    height={192}
                    src={screenshots.lay.url}
                    width={320}
                  />
                )}
              </div>
            </div>

            <Button
              disabled={isUploading || isParsing}
              onClick={handleUploadAndParse}
            >
              {isUploading || isParsing
                ? "Processing..."
                : "Upload & Auto-parse"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Parse state</CardTitle>
            <BetStatusBadge
              className="ml-2"
              status={
                parsed?.needsReview
                  ? "needs_review"
                  : parsed
                    ? "matched"
                    : "draft"
              }
            />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Market</Label>
              <ConfidenceInput
                disabled={!parsed}
                onChange={(e) =>
                  setParsed((prev) =>
                    prev
                      ? {
                          ...prev,
                          market: e.target.value,
                          back: { ...prev.back, market: e.target.value },
                          lay: { ...prev.lay, market: e.target.value },
                        }
                      : prev
                  )
                }
                placeholder="e.g. Premier League - Match Odds"
                score={marketConfidence}
                value={parsed?.market ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label>Selection</Label>
              <ConfidenceInput
                disabled={!parsed}
                onChange={(e) =>
                  setParsed((prev) =>
                    prev
                      ? {
                          ...prev,
                          selection: e.target.value,
                          back: { ...prev.back, selection: e.target.value },
                          lay: { ...prev.lay, selection: e.target.value },
                        }
                      : prev
                  )
                }
                placeholder="Team or runner"
                score={selectionConfidence}
                value={parsed?.selection ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label>Linked match (optional)</Label>
              <MatchPicker
                disabled={!parsed}
                onChange={handleMatchChange}
                placeholder="Search for a football match to link"
                value={parsed?.matchId ?? null}
              />
              {parsed?.matchId ? (
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800 text-sm">
                  <LinkIcon className="h-4 w-4 text-emerald-600" />
                  <span>
                    Linked to match
                    {parsed.matchConfidence && (
                      <span className="ml-1 text-emerald-600">
                        (confidence: {parsed.matchConfidence})
                      </span>
                    )}
                  </span>
                </div>
              ) : parsed?.matchCandidates && parsed.matchCandidates > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm">
                  We found {parsed.matchCandidates} candidate matches but did
                  not link one automatically. Please choose the correct match
                  above if applicable.
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                disabled={!parsed}
                onChange={(e) =>
                  setParsed((prev) =>
                    prev ? { ...prev, notes: e.target.value } : prev
                  )
                }
                placeholder="Add context or corrections to keep with this matched set"
                value={parsed?.notes ?? ""}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border bg-muted/50 p-3">
              <div>
                <Label htmlFor="needs-review-toggle">Needs review</Label>
                <p className="text-muted-foreground text-xs">
                  Flag this matched bet for reconciliation.
                </p>
              </div>
              <input
                checked={parsed?.needsReview ?? false}
                className="h-4 w-4 accent-amber-500 disabled:opacity-50"
                disabled={!parsed}
                id="needs-review-toggle"
                onChange={(e) =>
                  setParsed((prev) =>
                    prev ? { ...prev, needsReview: e.target.checked } : prev
                  )
                }
                type="checkbox"
              />
            </div>
            <Separator />
            {parsed && (
              <>
                <BetFields
                  accountOptions={bookmakers}
                  accountPlaceholder="Select bookmaker account"
                  allowCurrencyEdit
                  label="Back bet"
                  onAddAccount={handleAddAccount}
                  onChange={(val) =>
                    setParsed((prev) => (prev ? { ...prev, back: val } : prev))
                  }
                  value={parsed.back}
                />
                <BetFields
                  accountOptions={exchanges}
                  accountPlaceholder="Select exchange account"
                  allowCurrencyEdit
                  label="Lay bet"
                  onAddAccount={handleAddAccount}
                  onChange={(val) =>
                    setParsed((prev) => (prev ? { ...prev, lay: val } : prev))
                  }
                  value={parsed.lay}
                />
              </>
            )}
            {parsed && (
              <div className="rounded-md border bg-muted/50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>Computed net exposure</span>
                  <span className="font-semibold">
                    {netExposure !== null ? `kr ${netExposure}` : "—"}
                  </span>
                </div>
                {parsed.needsReview && (
                  <p className="mt-2 text-muted-foreground text-xs">
                    Needs user validation before marking as matched.
                  </p>
                )}
              </div>
            )}
            <Button
              disabled={isSaving || !parsed}
              onClick={handleSave}
              variant="default"
            >
              {isSaving ? "Saving..." : "Accept & save matched bet"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function BetFields({
  label,
  value,
  onChange,
  allowCurrencyEdit,
  readOnlyCurrency,
  accountOptions,
  accountPlaceholder,
  onAddAccount,
}: {
  label: string;
  value: ParsedPair["back"];
  onChange: (value: ParsedPair["back"]) => void;
  allowCurrencyEdit?: boolean;
  readOnlyCurrency?: string;
  accountOptions: AccountOption[];
  accountPlaceholder: string;
  onAddAccount: () => void;
}) {
  const currencyValue = readOnlyCurrency ?? value.currency ?? "";
  const placedAtValue = formatDateTimeLocal(value.placedAt);
  const selectedAccount =
    accountOptions.find((account) => account.id === value.accountId) ?? null;
  const showAccountWarning =
    value.unmatchedAccount && !selectedAccount && value.exchange;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-muted-foreground text-xs">
          {value.exchange} · {currencyValue || "Currency unknown"}
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">{accountPlaceholder}</Label>
          <Select
            onValueChange={(selectedId) => {
              if (selectedId === "__add_new__") {
                onAddAccount();
                return;
              }
              if (selectedId === "__clear__") {
                onChange(
                  applyAccountSelection({
                    bet: value,
                    account: null,
                    enforceCurrency: Boolean(allowCurrencyEdit),
                  })
                );
                return;
              }
              const account =
                accountOptions.find((option) => option.id === selectedId) ??
                null;
              if (!account) {
                return;
              }
              onChange(
                applyAccountSelection({
                  bet: value,
                  account,
                  enforceCurrency: Boolean(allowCurrencyEdit),
                })
              );
            }}
            value={selectedAccount?.id ?? ""}
          >
            <SelectTrigger>
              <SelectValue placeholder={accountPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {accountOptions.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                  {account.currency ? ` · ${account.currency}` : ""}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value="__add_new__">Add new account</SelectItem>
              {selectedAccount ? (
                <SelectItem value="__clear__">Clear selection</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
          {showAccountWarning ? (
            <p className="text-amber-700 text-xs">
              No matching account found for "{value.exchange}". Select or create
              one to link this bet.
            </p>
          ) : null}
        </div>
        <ConfidenceInput
          onChange={(e) =>
            onChange({
              ...value,
              odds: Number(e.target.value),
              // Clear liability override when odds change so it gets recalculated
              liability: null,
            })
          }
          placeholder="Odds"
          score={resolveConfidence(value.confidence, "odds")}
          step="any"
          type="number"
          value={value.odds}
        />
        <ConfidenceInput
          onChange={(e) =>
            onChange({
              ...value,
              stake: Number(e.target.value),
              // Clear liability override when stake changes so it gets recalculated
              liability: null,
            })
          }
          placeholder="Stake"
          score={resolveConfidence(value.confidence, "stake")}
          step="0.01"
          type="number"
          value={value.stake}
        />
        <ConfidenceInput
          onChange={(e) => {
            const nextExchange = e.target.value;
            const shouldClearAccount =
              selectedAccount && nextExchange !== selectedAccount.name;
            onChange({
              ...value,
              exchange: nextExchange,
              accountId: shouldClearAccount ? null : value.accountId,
              unmatchedAccount: shouldClearAccount
                ? true
                : value.unmatchedAccount,
            });
          }}
          placeholder="Exchange / Bookmaker"
          score={resolveConfidence(value.confidence, "exchange")}
          value={value.exchange ?? ""}
        />
        <ConfidenceInput
          disabled={!allowCurrencyEdit}
          onChange={(e) =>
            onChange({
              ...value,
              currency: e.target.value ? e.target.value.toUpperCase() : null,
            })
          }
          placeholder="Currency (e.g. EUR)"
          score={resolveConfidence(value.confidence, "currency")}
          value={currencyValue}
        />
        <ConfidenceInput
          className="md:col-span-2"
          onChange={(e) =>
            onChange({
              ...value,
              placedAt: parseDateTimeLocal(e.target.value),
            })
          }
          placeholder="Placed at"
          score={resolveConfidence(value.confidence, "placedAt")}
          type="datetime-local"
          value={placedAtValue}
        />
      </div>
    </div>
  );
}

function resolveConfidence(
  confidence: ParsedPair["back"]["confidence"] | undefined,
  field: string
) {
  const score = confidence?.[field];
  return typeof score === "number" ? score : null;
}

function resolveCombinedConfidence(parsed: ParsedForm | null, field: string) {
  if (!parsed) {
    return null;
  }

  const scores = [
    resolveConfidence(parsed.back.confidence, field),
    resolveConfidence(parsed.lay.confidence, field),
  ].filter((score): score is number => typeof score === "number");

  return scores.length > 0 ? Math.min(...scores) : null;
}

function formatDateTimeLocal(value?: string | null) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

function parseDateTimeLocal(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function ConfidenceInput({
  score,
  className,
  ...props
}: ComponentProps<typeof Input> & { score: number | null }) {
  const lowConfidence = score !== null && score < LOW_CONFIDENCE_THRESHOLD;
  const field = (
    <Input
      {...props}
      className={cn(
        className,
        lowConfidence &&
          "border-amber-300 bg-amber-50 focus-visible:ring-amber-200"
      )}
    />
  );

  if (!lowConfidence || score === null) {
    return field;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{field}</TooltipTrigger>
      <TooltipContent>Confidence: {score.toFixed(2)}</TooltipContent>
    </Tooltip>
  );
}
