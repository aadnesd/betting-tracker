import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { fxRate } from "@/lib/db/schema";

const FX_BASE_URL =
  process.env.FXRATES_API_BASE_URL?.trim() ||
  "https://api.fxratesapi.com/latest";
const TARGET_CURRENCY = "NOK";

const cache = new Map<string, { rate: number; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 300;
const STALE_FALLBACK_MS = 72 * 60 * 60 * 1000;

// Stablecoins pegged to USD - use USD rate as fallback
const USD_STABLECOINS = new Set([
  "USDT",
  "USDC",
  "DAI",
  "BUSD",
  "TUSD",
  "USDP",
  "GUSD",
  "FRAX",
]);

type FxFetchError = Error & { retryAfterMs?: number; status?: number };

const sleep = (ms: number) =>
  new Promise((resolve) =>
    setTimeout(resolve, Number.isFinite(ms) ? Math.max(1, Math.floor(ms)) : 1)
  );

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) {
    return undefined;
  }

  const asSeconds = Number.parseFloat(header);
  if (Number.isFinite(asSeconds)) {
    return Math.max(1, asSeconds * 1000);
  }

  const asDateMs = Date.parse(header);
  if (Number.isFinite(asDateMs)) {
    return Math.max(1, asDateMs - Date.now());
  }

  return undefined;
}

function getRetryDelayMs(attempt: number, retryAfterMs?: number) {
  if (retryAfterMs && Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return Math.max(1, Math.floor(retryAfterMs));
  }
  // Exponential backoff with a small jitter.
  const baseDelay = BASE_RETRY_DELAY_MS * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 100);
  return Math.max(1, baseDelay + jitter);
}

async function fetchRateFromApi(base: string): Promise<number> {
  const apiKey = process.env.FXRATES_API_KEY;
  if (!apiKey) {
    throw new Error("FXRATES_API_KEY is not configured");
  }

  const url = new URL(FX_BASE_URL);
  url.searchParams.set("base", base);
  url.searchParams.set("symbols", TARGET_CURRENCY);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const retryAfterHeader = response.headers.get("retry-after");
    const error = new Error(
      `Failed to fetch FX rate (${response.status} ${response.statusText})`
    ) as FxFetchError;
    error.status = response.status;
    const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
    if (retryAfterMs) {
      error.retryAfterMs = retryAfterMs;
    }
    throw error;
  }

  const data = (await response.json()) as {
    rates?: Record<string, number>;
    data?: Record<string, number>;
  };

  const rate = data.rates?.[TARGET_CURRENCY] ?? data.data?.[TARGET_CURRENCY];
  if (typeof rate !== "number" || Number.isNaN(rate)) {
    console.error(
      `[FX] API response missing NOK rate for ${base}:`,
      JSON.stringify(data)
    );
    throw new Error(`FX API response missing NOK rate for ${base}`);
  }

  return rate;
}

async function storeRate(base: string, rate: number) {
  const now = new Date();
  try {
    const rateValue = rate.toFixed(8);
    await db
      .insert(fxRate)
      .values({ baseCurrency: base, rateToNok: rateValue, updatedAt: now })
      .onConflictDoUpdate({
        target: fxRate.baseCurrency,
        set: { rateToNok: rateValue, updatedAt: now },
      });
  } catch (error) {
    console.error(`[FX] Failed to persist FX rate for ${base}:`, error);
  }
}

async function getStoredRate(
  base: string
): Promise<{ rate: number; updatedAt: Date } | null> {
  try {
    const [row] = await db
      .select({
        rate: fxRate.rateToNok,
        updatedAt: fxRate.updatedAt,
      })
      .from(fxRate)
      .where(eq(fxRate.baseCurrency, base))
      .limit(1);
    if (!row) {
      return null;
    }
    return {
      rate: Number.parseFloat(String(row.rate)),
      updatedAt: row.updatedAt,
    };
  } catch (error) {
    console.error(`[FX] Failed to read stored FX rate for ${base}:`, error);
    return null;
  }
}

async function fetchRate(fromCurrency: string): Promise<number> {
  const base = fromCurrency.toUpperCase();

  // For USD stablecoins, use USD rate directly
  const effectiveBase = USD_STABLECOINS.has(base) ? "USD" : base;

  const cached = cache.get(effectiveBase);
  if (cached && cached.expiresAt > Date.now()) {
    // Also cache the original currency if it's a stablecoin
    if (effectiveBase !== base) {
      cache.set(base, cached);
    }
    return cached.rate;
  }

  let lastError: FxFetchError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const rate = await fetchRateFromApi(effectiveBase);
      cache.set(effectiveBase, {
        rate,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      // Also cache the original currency if it's a stablecoin
      if (effectiveBase !== base) {
        cache.set(base, { rate, expiresAt: Date.now() + CACHE_TTL_MS });
      }
      await storeRate(effectiveBase, rate);
      return rate;
    } catch (error) {
      lastError = error as FxFetchError;
      if (attempt >= MAX_RETRIES) {
        break;
      }
      const delay = getRetryDelayMs(
        attempt,
        lastError?.retryAfterMs ?? undefined
      );
      await sleep(delay);
    }
  }

  const stored = await getStoredRate(effectiveBase);
  if (stored) {
    const ageMs = Date.now() - stored.updatedAt.getTime();
    if (ageMs <= STALE_FALLBACK_MS) {
      cache.set(effectiveBase, {
        rate: stored.rate,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      if (effectiveBase !== base) {
        cache.set(base, {
          rate: stored.rate,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
      }
      console.warn(
        `[FX] Using stored rate for ${effectiveBase} (${Math.round(
          ageMs / 1000
        )}s old)`
      );
      return stored.rate;
    }
  }

  throw lastError ?? new Error("Failed to fetch FX rate");
}

export async function convertAmountToNok(
  amount: number,
  currency?: string | null
): Promise<number> {
  try {
    return await convertAmountToNokStrict(amount, currency);
  } catch (error) {
    console.error(
      `[FX] Failed to convert ${amount} ${currency} to NOK:`,
      error
    );
    // Fallback: return amount unchanged (will be wrong but won't crash)
    return amount;
  }
}

/**
 * Convert amount to NOK and throw on FX lookup failure.
 * Use this when persisting normalized NOK values to avoid corrupt writes.
 */
export async function convertAmountToNokStrict(
  amount: number,
  currency?: string | null
): Promise<number> {
  if (!currency || currency.toUpperCase() === TARGET_CURRENCY) {
    return amount;
  }

  const rate = await fetchRate(currency);
  const converted = amount * rate;
  console.log(
    `[FX] Converted ${amount} ${currency} → ${converted.toFixed(2)} NOK (rate: ${rate})`
  );
  return converted;
}

/**
 * Get current FX rates for display purposes.
 * Returns rates for common currency pairs to verify API is working.
 */
export async function getDisplayRates(): Promise<{
  rates: Array<{ from: string; to: string; rate: number | null }>;
  lastUpdated: Date;
}> {
  const pairs = [
    { from: "USD", to: "NOK" },
    { from: "EUR", to: "NOK" },
    { from: "GBP", to: "NOK" },
    { from: "BTC", to: "USD" },
  ];

  const rates = await Promise.all(
    pairs.map(async ({ from, to }) => {
      try {
        // For BTC/USD, we need to fetch BTC → USD rate differently
        if (to === "USD") {
          const btcToNok = await fetchRate(from);
          const usdToNok = await fetchRate("USD");
          const rate = btcToNok / usdToNok;
          return { from, to, rate };
        }
        const rate = await fetchRate(from);
        return { from, to, rate };
      } catch {
        return { from, to, rate: null };
      }
    })
  );

  return { rates, lastUpdated: new Date() };
}
