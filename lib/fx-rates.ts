const FX_BASE_URL =
  process.env.FXRATES_API_BASE_URL?.trim() ||
  "https://api.fxratesapi.com/latest";
const TARGET_CURRENCY = "NOK";

const cache = new Map<string, { rate: number; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

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

  const apiKey = process.env.FXRATES_API_KEY;
  if (!apiKey) {
    throw new Error("FXRATES_API_KEY is not configured");
  }

  const url = new URL(FX_BASE_URL);
  url.searchParams.set("base", effectiveBase);
  url.searchParams.set("symbols", TARGET_CURRENCY);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch FX rate (${response.status} ${response.statusText})`
    );
  }

  const data = (await response.json()) as {
    rates?: Record<string, number>;
    data?: Record<string, number>;
  };

  const rate = data.rates?.[TARGET_CURRENCY] ?? data.data?.[TARGET_CURRENCY];
  if (typeof rate !== "number" || Number.isNaN(rate)) {
    console.error(
      `[FX] API response missing NOK rate for ${effectiveBase}:`,
      JSON.stringify(data)
    );
    throw new Error(`FX API response missing NOK rate for ${effectiveBase}`);
  }

  cache.set(effectiveBase, { rate, expiresAt: Date.now() + CACHE_TTL_MS });
  // Also cache the original currency if it's a stablecoin
  if (effectiveBase !== base) {
    cache.set(base, { rate, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return rate;
}

export async function convertAmountToNok(
  amount: number,
  currency?: string | null
): Promise<number> {
  if (!currency || currency.toUpperCase() === TARGET_CURRENCY) {
    return amount;
  }

  try {
    const rate = await fetchRate(currency);
    const converted = amount * rate;
    console.log(
      `[FX] Converted ${amount} ${currency} → ${converted.toFixed(2)} NOK (rate: ${rate})`
    );
    return converted;
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
