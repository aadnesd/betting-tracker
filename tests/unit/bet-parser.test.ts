import { afterEach, describe, expect, it, vi } from "vitest";

type ParsedPairPayload = {
  back: {
    type: "back" | "lay";
    market: string;
    selection: string;
    odds: number;
    stake: number;
    liability?: number | null;
    exchange: string;
    currency?: string | null;
    placedAt?: string | null;
    confidence?: Record<string, number>;
  };
  lay: {
    type: "back" | "lay";
    market: string;
    selection: string;
    odds: number;
    stake: number;
    liability?: number | null;
    exchange: string;
    currency?: string | null;
    placedAt?: string | null;
    confidence?: Record<string, number>;
  };
  needsReview: boolean;
  notes?: string;
};

const baseEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in baseEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, baseEnv);
}

function setTestEnv(overrides: Record<string, string | undefined>) {
  delete process.env.PLAYWRIGHT;
  delete process.env.PLAYWRIGHT_TEST_BASE_URL;
  delete process.env.CI_PLAYWRIGHT;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function loadParserWithMocks(options: {
  env: Record<string, string | undefined>;
  generatedObject: ParsedPairPayload;
}) {
  vi.resetModules();
  setTestEnv(options.env);

  vi.doMock("ai", async () => {
    const actual = await vi.importActual<typeof import("ai")>("ai");
    return {
      ...actual,
      generateObject: vi
        .fn()
        .mockResolvedValue({ object: options.generatedObject }),
    };
  });
  vi.doMock("@/lib/ai/providers", () => ({
    myProvider: {
      languageModel: () => ({}),
    },
  }));

  const mod = await import("@/lib/bet-parser");
  return mod.parseMatchedBetFromScreenshots;
}

const basePair: ParsedPairPayload = {
  back: {
    type: "back",
    market: "Match Odds",
    selection: "Arsenal",
    odds: 2.5,
    stake: 10,
    liability: null,
    exchange: "Bet365",
    currency: "GBP",
    placedAt: "2024-01-01T00:00:00.000Z",
    confidence: { odds: 0.9 },
  },
  lay: {
    type: "lay",
    market: "Match Odds",
    selection: "Arsenal",
    odds: 2.4,
    stake: 11,
    liability: null,
    exchange: "Smarkets",
    currency: "GBP",
    placedAt: "2024-01-01T00:00:00.000Z",
    confidence: { odds: 0.9 },
  },
  needsReview: false,
  notes: "ok",
};

afterEach(() => {
  restoreEnv();
  vi.clearAllMocks();
  vi.resetModules();
  vi.unmock("ai");
  vi.unmock("@/lib/ai/providers");
});

describe("bet parser (stub in test env)", () => {
  it("returns deterministic stub with aligned markets", async () => {
    const parseMatchedBetFromScreenshots = await loadParserWithMocks({
      env: { PLAYWRIGHT: "true" },
      generatedObject: basePair,
    });

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

describe("bet parser (non-test env)", () => {
  it("keeps parsed lay exchange and currency when provided", async () => {
    const parseMatchedBetFromScreenshots = await loadParserWithMocks({
      env: { PLAYWRIGHT: undefined },
      generatedObject: basePair,
    });

    const parsed = await parseMatchedBetFromScreenshots({
      backImageUrl: "https://example.com/back.png",
      layImageUrl: "https://example.com/lay.png",
    });

    expect(parsed.lay.exchange).toBe("Smarkets");
    expect(parsed.lay.currency).toBe("GBP");
  });

  it("defaults lay exchange and currency only when missing", async () => {
    const parseMatchedBetFromScreenshots = await loadParserWithMocks({
      env: { PLAYWRIGHT: undefined },
      generatedObject: {
        ...basePair,
        lay: {
          ...basePair.lay,
          exchange: "",
          currency: null,
        },
      },
    });

    const parsed = await parseMatchedBetFromScreenshots({
      backImageUrl: "https://example.com/back.png",
      layImageUrl: "https://example.com/lay.png",
    });

    expect(parsed.lay.exchange).toBe("bfb247");
    expect(parsed.lay.currency).toBe("NOK");
  });
});
