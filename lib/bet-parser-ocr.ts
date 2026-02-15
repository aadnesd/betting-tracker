/**
 * OCR-based bet parser for faster parsing.
 *
 * Strategy:
 * 1. Use Azure Document Intelligence for fast, accurate text extraction
 * 2. Use a lightweight LLM to parse the structured data from extracted text
 *
 * This is significantly faster than sending images to a vision LLM.
 */

import { gateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import { z } from "zod";
import { extractTextFromImages } from "@/lib/azure-ocr";
import type { ParsedBet, ParsedPair } from "@/lib/bet-parser";
import { isTestEnvironment } from "@/lib/constants";

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

/**
 * Parse matched bet from screenshots using OCR + LLM.
 *
 * This is faster than using vision LLMs because:
 * 1. Azure OCR is optimized for text extraction (~1-2 sec)
 * 2. Text-only LLM calls are much faster than vision calls
 */
export async function parseMatchedBetWithOcr({
  backImageUrl,
  layImageUrl,
}: {
  backImageUrl: string;
  layImageUrl: string;
}): Promise<ParsedPair & { ocrDurationMs: number; llmDurationMs: number }> {
  // Skip in test environment
  if (isTestEnvironment) {
    return {
      needsReview: false,
      notes: "Test environment stub response (OCR)",
      back: {
        type: "back",
        market: "Premier League - Match Odds",
        selection: "Arsenal",
        odds: 2.4,
        stake: 20,
        exchange: "Bet365",
        currency: "EUR",
        placedAt: new Date().toISOString(),
        confidence: { market: 0.95, selection: 0.95, odds: 0.95, stake: 0.95 },
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
        confidence: { market: 0.95, selection: 0.95, odds: 0.95, stake: 0.95 },
      },
      ocrDurationMs: 0,
      llmDurationMs: 0,
    };
  }

  // Step 1: Extract text from both images in parallel
  const ocrStart = Date.now();
  const [backOcr, layOcr] = await extractTextFromImages([
    backImageUrl,
    layImageUrl,
  ]);
  const ocrDurationMs = Date.now() - ocrStart;

  console.log(
    `[bet-parser-ocr] OCR completed in ${ocrDurationMs}ms (back: ${backOcr.durationMs}ms, lay: ${layOcr.durationMs}ms)`
  );

  // Step 2: Use LLM to parse the extracted text
  const llmStart = Date.now();

  const { object } = await generateObject({
    model: gateway.languageModel("google/gemini-2.0-flash"),
    schema: pairSchema,
    messages: [
      {
        role: "system",
        content:
          "You are a precise matched-betting parser. Parse betting slip text extracted via OCR. " +
          "Extract exact numbers. If data is missing or unclear, set conservative defaults and mark needsReview=true. " +
          "Return confidence scores (0-1) for each field based on how clear the OCR text is.",
      },
      {
        role: "user",
        content: `Parse these two betting slip texts:

BACK BET (from bookmaker):
"""
${backOcr.text}
"""

LAY BET (from exchange):
"""
${layOcr.text}
"""

Extract:
- market: The match/event name (e.g., "Elche CF v Real Madrid")
- selection: What was bet on (e.g., "Real Madrid")
- odds: The decimal odds
- stake: The stake amount (for lay bets, this is the backer's stake, NOT liability)
- liability: For lay bets only, the liability amount
- exchange: The bookmaker/exchange name
- currency: ISO-4217 code (USD, EUR, NOK, GBP, etc.)

IMPORTANT DEFAULTS:
- For lay bets, if you see "Backer's Stake" that's the stake field. "Liability" is separate.
- Lay bet currency defaults to NOK if not explicitly specified in the text.
- If exchange name is unclear, use "Bookmaker" for back bets and "Exchange" for lay bets.

Flag needsReview=true if the markets or selections don't align between back and lay.`,
      },
    ],
  });

  const llmDurationMs = Date.now() - llmStart;
  console.log(`[bet-parser-ocr] LLM parsing completed in ${llmDurationMs}ms`);

  const pair = pairSchema.parse(object);

  // Apply defaults for lay bet
  const layWithDefaults: ParsedBet = {
    ...normalizeNumbers(pair.lay),
    exchange: pair.lay.exchange?.trim() ? pair.lay.exchange : "bfb247",
    currency: pair.lay.currency?.trim() ? pair.lay.currency : "NOK",
  };

  // Cross-validate the pair
  const marketsAlign =
    pair.back.market.toLowerCase().trim() ===
      layWithDefaults.market.toLowerCase().trim() &&
    pair.back.selection.toLowerCase().trim() ===
      layWithDefaults.selection.toLowerCase().trim();

  return {
    back: normalizeNumbers(pair.back),
    lay: layWithDefaults,
    needsReview: pair.needsReview || !marketsAlign,
    notes: marketsAlign
      ? pair.notes
      : "Markets or selections differ between back and lay slips.",
    ocrDurationMs,
    llmDurationMs,
  };
}

/**
 * Check if Azure Document Intelligence is configured.
 */
export function isOcrConfigured(): boolean {
  return !!(
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT &&
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
  );
}
