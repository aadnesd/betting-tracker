"use client";
import Image from "next/image";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { ParsedPair } from "@/lib/bet-parser";

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
  back: ParsedPair["back"];
  lay: ParsedPair["lay"];
};

export function BetIngestForm() {
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

  const netExposure = useMemo(() => {
    if (!parsed) {
      return null;
    }
    const backProfit = parsed.back.stake * (parsed.back.odds - 1);
    const layLiability = parsed.lay.stake * (parsed.lay.odds - 1);
    return Number((layLiability - backProfit).toFixed(2));
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

      const parsedJson: ParsedPair = await parseResp.json();

      setParsed({
        market: parsedJson.back.market ?? parsedJson.lay.market,
        selection: parsedJson.back.selection ?? parsedJson.lay.selection,
        needsReview: parsedJson.needsReview,
        notes: parsedJson.notes,
        back: parsedJson.back,
        lay: parsedJson.lay,
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

  return (
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
            {isUploading || isParsing ? "Processing..." : "Upload & Auto-parse"}
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
                  : "pending"
            }
          />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Market</Label>
            <Input
              onChange={(e) =>
                setParsed((prev) =>
                  prev ? { ...prev, market: e.target.value } : prev
                )
              }
              placeholder="e.g. Premier League - Match Odds"
              value={parsed?.market ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label>Selection</Label>
            <Input
              onChange={(e) =>
                setParsed((prev) =>
                  prev ? { ...prev, selection: e.target.value } : prev
                )
              }
              placeholder="Team or runner"
              value={parsed?.selection ?? ""}
            />
          </div>
          <Separator />
          {parsed && (
            <>
              <BetFields
                label="Back bet"
                onChange={(val) =>
                  setParsed((prev) => (prev ? { ...prev, back: val } : prev))
                }
                value={parsed.back}
              />
              <BetFields
                label="Lay bet"
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
                  {netExposure !== null ? `£${netExposure}` : "—"}
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
  );
}

function BetFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ParsedPair["back"];
  onChange: (value: ParsedPair["back"]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-muted-foreground text-xs">
          {value.exchange} · conf {value.confidence?.odds ?? 0.8}
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Input
          onChange={(e) => onChange({ ...value, odds: Number(e.target.value) })}
          placeholder="Odds"
          step="0.01"
          type="number"
          value={value.odds}
        />
        <Input
          onChange={(e) =>
            onChange({ ...value, stake: Number(e.target.value) })
          }
          placeholder="Stake"
          step="0.01"
          type="number"
          value={value.stake}
        />
        <Input
          onChange={(e) => onChange({ ...value, exchange: e.target.value })}
          placeholder="Exchange / Bookmaker"
          value={value.exchange}
        />
        <Input
          onChange={(e) => onChange({ ...value, betReference: e.target.value })}
          placeholder="Bet slip reference"
          value={value.betReference ?? ""}
        />
      </div>
    </div>
  );
}
