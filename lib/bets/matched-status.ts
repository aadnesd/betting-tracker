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
};

export function deriveMatchedBetDisplayStatus({
  matchedStatus,
  backStatus,
  layStatus,
}: DeriveMatchedBetStatusParams): MatchedBetStatus {
  if (
    matchedStatus === "matched" &&
    backStatus === "settled" &&
    layStatus === "settled"
  ) {
    return "settled";
  }

  return matchedStatus;
}
