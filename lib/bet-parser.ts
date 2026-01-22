import { generateObject } from "ai";
import { z } from "zod";
import { myProvider } from "@/lib/ai/providers";
import { isTestEnvironment } from "@/lib/constants";

// Re-export OCR-based parser for use when Azure is configured
export { parseMatchedBetWithOcr, isOcrConfigured } from "@/lib/bet-parser-ocr";

export type ParsedBet = {
  type: "back" | "lay";
  market: string;
  selection: string;
  odds: number;
  stake: number;
  /** For lay bets, the liability shown on the exchange (stake × (odds - 1)) */
  liability?: number | null;
  exchange: string;
  currency?: string | null;
  placedAt?: string | null;
  confidence?: Record<string, number>;
  /** Matched account ID from user's accounts (populated by autoparse) */
  accountId?: string | null;
  /** Flag indicating the parsed exchange name did not match any user account */
  unmatchedAccount?: boolean;
};

export type ParsedPair = {
  back: ParsedBet;
  lay: ParsedBet;
  needsReview: boolean;
  notes?: string;
};

const confidenceShape = z
  .record(z.string(), z.number().min(0).max(1))
  .optional();

const betSchema = z.object({
  type: z.enum(["back", "lay"]),
  market: z.string(),
  selection: z.string(),
  odds: z.number(),
  stake: z.number(),
  liability: z.number().optional().nullable(),
  exchange: z.string(),
  currency: z.string().length(3).optional().nullable(),
  placedAt: z.string().optional().nullable(),
  confidence: confidenceShape,
});

const pairSchema = z.object({
  back: betSchema,
  lay: betSchema,
  needsReview: z.boolean(),
  notes: z.string().optional(),
});

function normalizeNumbers(bet: ParsedBet): ParsedBet {
  return {
    ...bet,
    odds: Number(bet.odds),
    stake: Number(bet.stake),
    liability: bet.liability != null ? Number(bet.liability) : null,
  };
}

async function callModelWithRetry(params: {
  backImageUrl: string;
  layImageUrl: string;
  maxAttempts?: number;
}): Promise<ParsedPair> {
  const attempts = params.maxAttempts ?? 2;
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    const attemptStart = Date.now();
    try {
      const { object } = await generateObject({
        model: myProvider.languageModel("chat-model"),
        schema: pairSchema,
        messages: [
          {
            role: "system",
            content:
              "You are a precise matched-betting parser. Extract exact numbers from betting slip screenshots. " +
              "For lay bets (exchanges), distinguish between STAKE (backer's stake) and LIABILITY (stake × (odds-1)). " +
              "If data is missing, set a conservative default and mark needsReview. " +
              "Return JSON with confidence scores (0-1) per field.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Parse these two betting screenshots:\n\n" +
                  "BACK BET (Image 1): Extract market, selection, odds, stake, bookmaker name, and ISO-4217 currency code.\n\n" +
                  "LAY BET (Image 2): Extract market, selection, odds, stake (NOT liability), bookmaker/exchange name. " +
                  "If only liability is shown, compute stake = liability ÷ (odds - 1). Currency is typically NOK.\n\n" +
                  "Ensure market and selection align between both bets. Flag needsReview=true if uncertain or misaligned.",
              },
              { type: "image", image: params.backImageUrl },
              { type: "image", image: params.layImageUrl },
            ],
          },
        ],
      });

      const pair = pairSchema.parse(object);
      const attemptMs = Date.now() - attemptStart;
      console.log(`[bet-parser] AI model call attempt ${i + 1} completed in ${attemptMs}ms`);
      return {
        ...pair,
        back: normalizeNumbers(pair.back),
        lay: normalizeNumbers(pair.lay),
      };
    } catch (err) {
      const attemptMs = Date.now() - attemptStart;
      console.log(`[bet-parser] AI model call attempt ${i + 1} failed after ${attemptMs}ms`);
      lastError = err;
    }
  }

  throw lastError;
}

export async function parseMatchedBetFromScreenshots({
  backImageUrl,
  layImageUrl,
}: {
  backImageUrl: string;
  layImageUrl: string;
}): Promise<ParsedPair> {
  if (isTestEnvironment) {
    const backName = extractFilenameFromDataUrl(backImageUrl);
    const layName = extractFilenameFromDataUrl(layImageUrl);
    const scenario = resolveTestScenario(backName, layName);

    if (scenario === "error") {
      throw new Error("Unable to parse betting slip");
    }

    const lowConfidence = scenario === "low";
    const confidence = lowConfidence
      ? {
          market: 0.62,
          selection: 0.66,
          odds: 0.58,
          stake: 0.63,
          exchange: 0.69,
          currency: 0.6,
          placedAt: 0.55,
        }
      : {
          market: 0.92,
          selection: 0.9,
          odds: 0.94,
          stake: 0.93,
          exchange: 0.88,
          currency: 0.86,
          placedAt: 0.9,
        };

    return {
      needsReview: lowConfidence,
      notes: lowConfidence
        ? "Test environment stub response (low confidence)"
        : "Test environment stub response",
      back: {
        type: "back",
        market: "Premier League - Match Odds",
        selection: "Arsenal",
        odds: 2.4,
        stake: 20,
        exchange: "Bet365",
        currency: "EUR",
        placedAt: new Date().toISOString(),
        confidence,
      },
      lay: {
        type: "lay",
        market: "Premier League - Match Odds",
        selection: "Arsenal",
        odds: 2.32,
        stake: 21,
        exchange: "bfb247",
        currency: "NOK",
        placedAt: new Date().toISOString(),
        confidence,
      },
    };
  }

  const parsed = await callModelWithRetry({ backImageUrl, layImageUrl });
  const layWithDefaults: ParsedBet = {
    ...parsed.lay,
    exchange: parsed.lay.exchange?.trim()
      ? parsed.lay.exchange
      : "bfb247",
    currency: parsed.lay.currency?.trim()
      ? parsed.lay.currency
      : "NOK",
  };

  // Cross-validate the pair; flag needsReview when markets diverge.
  const marketsAlign =
    parsed.back.market.toLowerCase().trim() ===
      layWithDefaults.market.toLowerCase().trim() &&
    parsed.back.selection.toLowerCase().trim() ===
      layWithDefaults.selection.toLowerCase().trim();

  return {
    back: parsed.back,
    lay: layWithDefaults,
    needsReview: parsed.needsReview || !marketsAlign,
    notes: marketsAlign
      ? parsed.notes
      : "Markets or selections differ between back and lay slips.",
  };
}

function extractFilenameFromDataUrl(value: string) {
  if (!value.startsWith("data:")) {
    return null;
  }

  const match = value.match(/;name=([^;]+);/);

  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function resolveTestScenario(backName?: string | null, layName?: string | null) {
  const combined = [backName, layName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (combined.includes("cat") || combined.includes("non-bet")) {
    return "error";
  }

  if (combined.includes("bet3") || combined.includes("low")) {
    return "low";
  }

  return "happy";
}
