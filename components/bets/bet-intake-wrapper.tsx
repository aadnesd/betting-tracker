"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScreenshotIntakeForm } from "@/components/bets/screenshot-intake-form";
import { BetReviewForm } from "@/components/bets/bet-review-form";
import type { AccountOption } from "@/lib/bet-accounts";
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
  matchId?: string | null;
  matchConfidence?: string | null;
  matchCandidates?: number | null;
  normalizedSelection?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  back: ParsedPair["back"];
  lay: ParsedPair["lay"];
};

interface IntakeData {
  backScreenshotId: string;
  layScreenshotId: string;
  parsedData: ParsedPair & {
    matchId?: string | null;
    matchConfidence?: string | null;
    matchCandidates?: number | null;
    normalizedSelection?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    notes?: string;
    needsReview: boolean;
  };
  screenshots: {
    back?: ScreenshotRecord;
    lay?: ScreenshotRecord;
  };
}

interface BetIntakeWrapperProps {
  bookmakers: AccountOption[];
  exchanges: AccountOption[];
}

/**
 * Wrapper component that orchestrates the two-phase bet intake:
 * 1. ScreenshotIntakeForm - handles paste/drop/upload and auto-parsing
 * 2. BetReviewForm - handles review/edit and save
 */
export function BetIntakeWrapper({
  bookmakers,
  exchanges,
}: BetIntakeWrapperProps) {
  const router = useRouter();
  const [intakeData, setIntakeData] = useState<IntakeData | null>(null);
  const [phase, setPhase] = useState<"intake" | "review">("intake");

  const handleParseComplete = (data: {
    backScreenshotId: string;
    layScreenshotId: string;
    parsedData: unknown;
  }) => {
    const parsed = data.parsedData as ParsedPair & {
      matchId?: string | null;
      matchConfidence?: string | null;
      matchCandidates?: number | null;
      normalizedSelection?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
      notes?: string;
      needsReview: boolean;
    };

    // Build screenshot records with URLs from the API response
    // Note: The actual URLs come from the screenshots API response
    // For now, we'll use the IDs and fetch URLs separately if needed
    const screenshotData: IntakeData = {
      backScreenshotId: data.backScreenshotId,
      layScreenshotId: data.layScreenshotId,
      parsedData: parsed,
      screenshots: {},
    };

    setIntakeData(screenshotData);
    setPhase("review");
  };

  const handleBack = () => {
    setPhase("intake");
    setIntakeData(null);
  };

  const handleSaveComplete = () => {
    // Navigate to dashboard or bet list
    router.push("/bets");
  };

  if (phase === "review" && intakeData) {
    return (
      <BetReviewForm
        backScreenshotId={intakeData.backScreenshotId}
        layScreenshotId={intakeData.layScreenshotId}
        parsedData={intakeData.parsedData}
        bookmakers={bookmakers}
        exchanges={exchanges}
        onBack={handleBack}
        onSaveComplete={handleSaveComplete}
      />
    );
  }

  return <ScreenshotIntakeForm onParseComplete={handleParseComplete} />;
}
