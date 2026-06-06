import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockLimit, mockBatchRows } = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockBatchRows: vi.fn(),
}));

vi.mock("@/lib/db/connection", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        // `where` resolves to the batched rows (getStoredRates awaits it
        // directly) while also exposing `.limit` for single-row getStoredRate.
        where: vi.fn(() => {
          const builder = Promise.resolve(
            mockBatchRows()
          ) as Promise<unknown> & {
            limit: typeof mockLimit;
          };
          builder.limit = mockLimit;
          return builder;
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  fxRate: {
    baseCurrency: "baseCurrency",
    rateToNok: "rateToNok",
    updatedAt: "updatedAt",
  },
}));

// Parse the requested base currency out of the fxratesapi URL.
function baseFromUrl(url: string): string {
  return new URL(url).searchParams.get("base") ?? "";
}

const originalFetch = global.fetch;

async function loadModule() {
  vi.resetModules();
  return await import("@/lib/fx-rates");
}

describe("getRatesToNok / convertWithRates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FXRATES_API_KEY = "test-key";
    // No stored rate by default → forces an API fetch.
    mockLimit.mockResolvedValue([]);
    mockBatchRows.mockReturnValue([]);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("resolves each distinct non-NOK currency once and never fetches NOK", async () => {
    const rateByBase: Record<string, number> = { EUR: 11.5, GBP: 13.2 };
    const fetchMock = vi.fn((input: string | URL) => {
      const base = baseFromUrl(String(input));
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => null },
        json: () => Promise.resolve({ rates: { NOK: rateByBase[base] } }),
      } as unknown as Response);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getRatesToNok, convertWithRates } = await loadModule();

    // Duplicates + NOK should collapse to two distinct fetches (EUR, GBP).
    const rates = await getRatesToNok([
      "EUR",
      "eur",
      "GBP",
      "NOK",
      null,
      undefined,
    ]);

    const fetchedBases = fetchMock.mock.calls
      .map((call) => baseFromUrl(String(call[0])))
      .sort();
    expect(fetchedBases).toEqual(["EUR", "GBP"]);
    expect(fetchedBases).not.toContain("NOK");

    expect(rates.get("NOK")).toBe(1);
    expect(rates.get("EUR")).toBe(11.5);
    expect(rates.get("GBP")).toBe(13.2);

    // convertWithRates is synchronous and uses the resolved map.
    expect(convertWithRates(10, "EUR", rates)).toBeCloseTo(115);
    expect(convertWithRates(10, "NOK", rates)).toBe(10);
    // Unknown currency falls back to amount unchanged (rate of 1).
    expect(convertWithRates(10, "ZZZ", rates)).toBe(10);
  });

  it("uses a stored rate ~60min old without hitting the FX API (24h freshness)", async () => {
    // Stored rate served from the single batched read primed up front.
    mockBatchRows.mockReturnValue([
      {
        base: "EUR",
        rate: "9.99",
        updatedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    ]);
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getRatesToNok } = await loadModule();

    const rates = await getRatesToNok(["EUR"]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(rates.get("EUR")).toBeCloseTo(9.99);
  });

  it("primes many currencies from one batched read and skips the FX API", async () => {
    mockBatchRows.mockReturnValue([
      { base: "EUR", rate: "11.5", updatedAt: new Date() },
      { base: "GBP", rate: "13.2", updatedAt: new Date() },
      { base: "USD", rate: "10.7", updatedAt: new Date() },
    ]);
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getRatesToNok, convertWithRates } = await loadModule();

    // USDT is a USD stablecoin → resolves from the primed USD rate.
    const rates = await getRatesToNok(["EUR", "GBP", "USDT", "NOK"]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(rates.get("EUR")).toBeCloseTo(11.5);
    expect(rates.get("GBP")).toBeCloseTo(13.2);
    expect(rates.get("USDT")).toBeCloseTo(10.7);
    expect(convertWithRates(2, "USDT", rates)).toBeCloseTo(21.4);
  });

  it("ignores a stale stored rate from the batch (older than 24h) and fetches", async () => {
    mockBatchRows.mockReturnValue([
      {
        base: "EUR",
        rate: "8.0",
        updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      },
    ]);
    // getStoredRate fallback also returns the stale row; force API fetch.
    mockLimit.mockResolvedValue([
      {
        rate: "8.0",
        updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      },
    ]);
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => null },
        json: () => Promise.resolve({ rates: { NOK: 11.9 } }),
      } as unknown as Response)
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getRatesToNok } = await loadModule();

    const rates = await getRatesToNok(["EUR"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rates.get("EUR")).toBeCloseTo(11.9);
  });
});
