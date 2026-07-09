export type MatchedBetStatus = "draft" | "matched" | "settled" | "needs_review";

export type LegStatus =
  | "draft"
  | "placed"
  | "matched"
  | "settled"
  | "needs_review"
  | "error"
  | null
  | undefined;

type DeriveMatchedBetStatusParams = {
  matchedStatus: MatchedBetStatus;
  backStatus?: LegStatus;
  layStatus?: LegStatus;
  notes?: string | null;
};

export function isResolvedSingleLegMatchedBet({
  backStatus,
  layStatus,
  notes,
}: {
  backStatus?: LegStatus;
  layStatus?: LegStatus;
  notes?: string | null;
}) {
  const isMarkedResolved = notes?.startsWith("Marked resolved.") ?? false;

  return (
    isMarkedResolved &&
    ((backStatus === "settled" &&
      (layStatus === null || layStatus === undefined)) ||
      (layStatus === "settled" &&
        (backStatus === null || backStatus === undefined)))
  );
}

export function deriveMatchedBetDisplayStatus({
  matchedStatus,
  backStatus,
  layStatus,
  notes,
}: DeriveMatchedBetStatusParams): MatchedBetStatus {
  if (matchedStatus !== "matched") {
    return matchedStatus;
  }

  if (backStatus === "settled" && layStatus === "settled") {
    return "settled";
  }

  if (isResolvedSingleLegMatchedBet({ backStatus, layStatus, notes })) {
    return "settled";
  }

  return matchedStatus;
}
