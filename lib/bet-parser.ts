import { generateObject } from "ai";
import { z } from "zod";
import { myProvider } from "@/lib/ai/providers";
import { isTestEnvironment } from "@/lib/constants";

export type ParsedBet = {
  type: "back" | "lay";
  market: string;
  selection: string;
  odds: number;
  stake: number;
  exchange: string;
  potentialReturn?: number | null;
  betReference?: string | null;
  placedAt?: string | null;
  confidence?: Record<string, number>;
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
  exchange: z.string(),
  potentialReturn: z.number().optional().nullable(),
  betReference: z.string().optional().nullable(),
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
    potentialReturn:
      bet.potentialReturn === undefined || bet.potentialReturn === null
        ? null
        : Number(bet.potentialReturn),
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
    try {
      const { object } = await generateObject({
        model: myProvider.languageModel("chat-model"),
        schema: pairSchema,
        messages: [
          {
            role: "system",
            content:
              "You are a precise matched-betting parser. Extract exact numbers from the screenshots. If data is missing, set a conservative default and mark needsReview.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Parse the BACK bet screenshot. Return numeric odds/stake as numbers, include betReference if present.",
              },
              { type: "image", image: params.backImageUrl },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Parse the LAY bet screenshot from the exchange. Ensure market and selection align with the back bet if visible.",
              },
              { type: "image", image: params.layImageUrl },
            ],
          },
          {
            role: "user",
            content:
              "Return JSON only. Include confidence per field between 0-1. Flag needsReview=true if anything is uncertain or the markets do not align.",
          },
        ],
      });

      const pair = pairSchema.parse(object);
      return {
        ...pair,
        back: normalizeNumbers(pair.back),
        lay: normalizeNumbers(pair.lay),
      };
    } catch (err) {
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
    return {
      needsReview: false,
      notes: "Test environment stub response",
      back: {
        type: "back",
        market: "Premier League - Match Odds",
        selection: "Arsenal",
        odds: 2.4,
        stake: 20,
        exchange: "Bet365",
        potentialReturn: 48,
        betReference: "BACK-STUB",
        placedAt: new Date().toISOString(),
        confidence: {
          market: 0.9,
          selection: 0.92,
          odds: 0.95,
          stake: 0.95,
          exchange: 0.8,
        },
      },
      lay: {
        type: "lay",
        market: "Premier League - Match Odds",
        selection: "Arsenal",
        odds: 2.32,
        stake: 21,
        exchange: "Betfair Exchange",
        potentialReturn: 21,
        betReference: "LAY-STUB",
        placedAt: new Date().toISOString(),
        confidence: {
          market: 0.9,
          selection: 0.92,
          odds: 0.9,
          stake: 0.9,
          exchange: 0.85,
        },
      },
    };
  }

  const parsed = await callModelWithRetry({ backImageUrl, layImageUrl });

  // Cross-validate the pair; flag needsReview when markets diverge.
  const marketsAlign =
    parsed.back.market.toLowerCase().trim() ===
      parsed.lay.market.toLowerCase().trim() &&
    parsed.back.selection.toLowerCase().trim() ===
      parsed.lay.selection.toLowerCase().trim();

  return {
    ...parsed,
    needsReview: parsed.needsReview || !marketsAlign,
    notes: marketsAlign
      ? parsed.notes
      : "Markets or selections differ between back and lay slips.",
  };
}
