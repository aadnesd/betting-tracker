export const SEQUENTIAL_LAY_TAG = "[Sequential Lay]";
export const SEQUENTIAL_LAY_STEP_TAG = "[Sequential Lay Step]";

export function isSequentialLayMatchedBet(notes: string | null | undefined) {
  return notes?.includes(SEQUENTIAL_LAY_TAG) ?? false;
}

export function isSequentialLayStepMatchedBet(
  notes: string | null | undefined
) {
  return notes?.includes(SEQUENTIAL_LAY_STEP_TAG) ?? false;
}

export function isSequentialLayRelatedMatchedBet(
  notes: string | null | undefined
) {
  return (
    isSequentialLayMatchedBet(notes) || isSequentialLayStepMatchedBet(notes)
  );
}
