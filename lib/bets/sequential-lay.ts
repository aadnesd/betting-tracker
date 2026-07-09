export const SEQUENTIAL_LAY_TAG = "[Sequential Lay]";

export function isSequentialLayMatchedBet(notes: string | null | undefined) {
  return notes?.includes(SEQUENTIAL_LAY_TAG) ?? false;
}
