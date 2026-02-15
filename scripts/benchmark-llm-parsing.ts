/**
 * Benchmark different LLM models for bet parsing performance.
 *
 * Uses pre-extracted OCR text to isolate LLM performance.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

import { gateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import { z } from "zod";

// Pre-extracted OCR text from bet2.png and bet3.png
const BACK_BET_TEXT = `5
3:25 PM 11/23/2025
0
Elche CF - Real Madrid
00
Sun, Nov 23 9:00 PM
1×2
Real Madrid
1.46
6
Stake
6
Odds
1.46
Stake
$2,300.46 ₮
Est. Payout
$3,358.67
T
:
Cashout $2,163.88`;

const LAY_BET_TEXT = `ay (Bet Against)
che v Real Madrid
eal Madrid 1.46
Backer's Odds
Backer's Stake
23993.00
atch Odds
ubmitted: 15:25 23-Nov-25
Liability
11036.78
Ref: 205308393
$
av (Bet Against)
Backer's
Backer's
Liability`;

const MODELS = [
  "google/gemini-2.0-flash",
  "google/gemini-2.0-flash",
  "google/gemini-2.0-flash",
];

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

const SYSTEM_PROMPT =
  "You are a precise matched-betting parser. Parse betting slip text extracted via OCR. Extract exact numbers. If data is missing or unclear, set conservative defaults and mark needsReview=true. Return confidence scores (0-1) for each field based on how clear the OCR text is.";

const USER_PROMPT = `Parse these two betting slip texts:

BACK BET (from bookmaker):
"""
${BACK_BET_TEXT}
"""

LAY BET (from exchange):
"""
${LAY_BET_TEXT}
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

Flag needsReview=true if the markets or selections don't align between back and lay.`;

interface BenchmarkResult {
  model: string;
  durationMs: number;
  success: boolean;
  error?: string;
  rawResponse?: unknown;
  result?: z.infer<typeof pairSchema>;
}

async function benchmarkModel(modelId: string): Promise<BenchmarkResult> {
  console.log(`\n🔄 Testing: ${modelId}`);
  const startTime = Date.now();

  try {
    const { object } = await generateObject({
      model: gateway.languageModel(modelId),
      schema: pairSchema,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_PROMPT },
      ],
    });

    const durationMs = Date.now() - startTime;
    const result = pairSchema.parse(object);

    console.log(`   ✅ Completed in ${durationMs}ms`);

    return {
      model: modelId,
      durationMs,
      success: true,
      result,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Try to extract any partial response for debugging
    let rawResponse: unknown;
    if (error && typeof error === "object" && "response" in error) {
      rawResponse = (error as { response?: unknown }).response;
    }
    if (error && typeof error === "object" && "text" in error) {
      rawResponse = (error as { text?: unknown }).text;
    }
    if (error && typeof error === "object" && "cause" in error) {
      const cause = (error as { cause?: unknown }).cause;
      if (cause && typeof cause === "object" && "text" in cause) {
        rawResponse = (cause as { text?: unknown }).text;
      }
    }

    console.log(
      `   ❌ Failed after ${durationMs}ms: ${errorMessage.substring(0, 100)}`
    );

    return {
      model: modelId,
      durationMs,
      success: false,
      error: errorMessage,
      rawResponse,
    };
  }
}

async function main() {
  console.log("============================================================");
  console.log("LLM MODEL BENCHMARK FOR BET PARSING");
  console.log("============================================================");
  console.log("\nUsing pre-extracted OCR text to isolate LLM performance.");
  console.log(`Testing ${MODELS.length} models...`);

  const results: BenchmarkResult[] = [];

  for (const model of MODELS) {
    const result = await benchmarkModel(model);
    results.push(result);
  }

  // Summary table
  console.log("\n============================================================");
  console.log("BENCHMARK RESULTS");
  console.log("============================================================\n");

  console.log("| Model | Time | Status | Back Odds | Lay Odds | Lay Stake |");
  console.log("|-------|------|--------|-----------|----------|-----------|");

  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    const backOdds = r.result?.back.odds ?? "N/A";
    const layOdds = r.result?.lay.odds ?? "N/A";
    const layStake = r.result?.lay.stake ?? "N/A";
    console.log(
      `| ${r.model.padEnd(30)} | ${String(r.durationMs).padStart(6)}ms | ${status} | ${String(backOdds).padStart(9)} | ${String(layOdds).padStart(8)} | ${String(layStake).padStart(9)} |`
    );
  }

  // Detailed outputs
  console.log("\n============================================================");
  console.log("DETAILED OUTPUTS");
  console.log("============================================================");

  for (const r of results) {
    console.log(`\n--- ${r.model} ---`);
    if (r.success && r.result) {
      console.log("Duration:", r.durationMs + "ms");
      console.log("\nBack bet:");
      console.log(JSON.stringify(r.result.back, null, 2));
      console.log("\nLay bet:");
      console.log(JSON.stringify(r.result.lay, null, 2));
      console.log("\nNeeds review:", r.result.needsReview);
      if (r.result.notes) console.log("Notes:", r.result.notes);
    } else {
      console.log("Duration:", r.durationMs + "ms");
      console.log("Error:", r.error);
      if (r.rawResponse) {
        console.log("\nRaw response (for debugging):");
        console.log(
          typeof r.rawResponse === "string"
            ? r.rawResponse
            : JSON.stringify(r.rawResponse, null, 2)
        );
      }
    }
  }

  // Winner
  const successfulResults = results.filter((r) => r.success);
  if (successfulResults.length > 0) {
    const fastest = successfulResults.reduce((a, b) =>
      a.durationMs < b.durationMs ? a : b
    );
    console.log(
      "\n============================================================"
    );
    console.log(`🏆 FASTEST: ${fastest.model} at ${fastest.durationMs}ms`);
    console.log("============================================================");
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
