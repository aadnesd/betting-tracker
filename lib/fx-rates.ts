const FX_BASE_URL =
  process.env.FXRATES_API_BASE_URL?.trim() || "https://api.fxratesapi.com/latest";
const TARGET_CURRENCY = "NOK";

const cache = new Map<string, { rate: number; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchRate(fromCurrency: string): Promise<number> {
  const base = fromCurrency.toUpperCase();
  const cached = cache.get(base);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rate;
  }

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
    throw new Error("FX API response missing NOK rate");
  }

  cache.set(base, { rate, expiresAt: Date.now() + CACHE_TTL_MS });
  return rate;
}

export async function convertAmountToNok(
  amount: number,
  currency?: string | null
): Promise<number> {
  if (!currency || currency.toUpperCase() === TARGET_CURRENCY) {
    return amount;
  }

  const rate = await fetchRate(currency);
  return amount * rate;
}
