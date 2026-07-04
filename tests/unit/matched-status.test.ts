import { describe, expect, it } from "vitest";
import { deriveMatchedBetDisplayStatus } from "@/lib/bets/matched-status";

describe("deriveMatchedBetDisplayStatus", () => {
  it("keeps matched status when either leg is still unsettled", () => {
    expect(
      deriveMatchedBetDisplayStatus({
        matchedStatus: "matched",
        backStatus: "settled",
        layStatus: "matched",
      })
    ).toBe("matched");
  });

  it("treats stale matched parents as settled when both legs are settled", () => {
    expect(
      deriveMatchedBetDisplayStatus({
        matchedStatus: "matched",
        backStatus: "settled",
        layStatus: "settled",
      })
    ).toBe("settled");
  });

  it("preserves non-matched parent statuses", () => {
    expect(
      deriveMatchedBetDisplayStatus({
        matchedStatus: "settled",
        backStatus: "settled",
        layStatus: "settled",
      })
    ).toBe("settled");
  });
});
