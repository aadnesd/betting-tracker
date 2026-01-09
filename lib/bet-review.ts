export const NEEDS_REVIEW_CONFIDENCE = 0.7;

export type ConfidenceMap = Record<string, number> | null | undefined;

export type LowConfidenceField = {
  leg: "back" | "lay";
  field: string;
  score: number;
};

function collectLowConfidence(
  leg: "back" | "lay",
  confidence?: ConfidenceMap
): LowConfidenceField[] {
  if (!confidence) {
    return [];
  }

  return Object.entries(confidence)
    .filter(([, score]) => score < NEEDS_REVIEW_CONFIDENCE)
    .map(([field, score]) => ({ leg, field, score }));
}

export function evaluateNeedsReview({
  explicitFlag,
  backConfidence,
  layConfidence,
}: {
  explicitFlag?: boolean;
  backConfidence?: ConfidenceMap;
  layConfidence?: ConfidenceMap;
}) {
  const lowConfidence = [
    ...collectLowConfidence("back", backConfidence),
    ...collectLowConfidence("lay", layConfidence),
  ];
  const flagged = Boolean(explicitFlag);

  return {
    needsReview: flagged || lowConfidence.length > 0,
    flagged,
    lowConfidence,
  };
}

export function formatNeedsReviewNote({
  flagged,
  lowConfidence,
}: {
  flagged: boolean;
  lowConfidence: LowConfidenceField[];
}) {
  if (!flagged && lowConfidence.length === 0) {
    return null;
  }

  const reasons: string[] = [];

  if (flagged) {
    reasons.push("flagged for review");
  }

  if (lowConfidence.length > 0) {
    const fields = lowConfidence.map(
      ({ leg, field, score }) => `${leg}.${field} (${score.toFixed(2)})`
    );
    reasons.push(
      `low confidence < ${NEEDS_REVIEW_CONFIDENCE}: ${fields.join(", ")}`
    );
  }

  return `Needs review: ${reasons.join("; ")}`;
}
