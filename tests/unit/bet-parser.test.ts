import { describe, expect, it, beforeAll, vi } from "vitest";
import { parseMatchedBetFromScreenshots } from "@/lib/bet-parser";

vi.mock("@/lib/ai/providers", () => ({
  myProvider: {
    languageModel: () => ({}),
  },
}));

beforeAll(() => {
  process.env.PLAYWRIGHT = "true"; // triggers stub response in parser
});

describe("bet parser (stub in test env)", () => {
  it("returns deterministic stub with aligned markets", async () => {
    const parsed = await parseMatchedBetFromScreenshots({
      backImageUrl: "data://back",
      layImageUrl: "data://lay",
    });

    expect(parsed.needsReview).toBe(false);
    expect(parsed.back.type).toBe("back");
    expect(parsed.lay.type).toBe("lay");
    expect(parsed.back.market).toBe(parsed.lay.market);
    expect(parsed.back.selection).toBe(parsed.lay.selection);
    expect(parsed.back.odds).toBeGreaterThan(0);
    expect(parsed.lay.odds).toBeGreaterThan(0);
    expect(parsed.back.confidence?.odds).toBeGreaterThan(0);
  });
});
