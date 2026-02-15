/**
 * Integration tests for AI bet parsing using real model calls.
 *
 * These tests use actual test images and make real AI API calls.
 * Run with: pnpm test:integration
 *
 * Note: Requires AI_GATEWAY_API_KEY environment variable to be set.
 */

import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// We need to import the parser directly and call the model
// This test does NOT set PLAYWRIGHT env var, so isTestEnvironment will be false
// and we'll hit the real AI

const TEST_IMAGES_DIR = path.join(__dirname, "..", "test-images");

// Check for real AI availability - need API key and NOT be in stub mode
const hasApiKey = Boolean(
  process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY
);

// If PLAYWRIGHT* env vars are set, we're in stub mode - disable real AI tests
const isStubMode = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

const canRunRealAI = hasApiKey && !isStubMode;

function readImageAsBase64(filename: string): string {
  const imagePath = path.join(TEST_IMAGES_DIR, filename);
  const buffer = fs.readFileSync(imagePath);
  const base64 = buffer.toString("base64");
  const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mimeType};base64,${base64}`;
}

describe("AI Bet Parsing Integration", () => {
  beforeAll(() => {
    if (isStubMode) {
      console.warn(
        "⚠️ Running in stub mode (PLAYWRIGHT* env set) - AI calls will use stubs. " +
          "Set REAL_AI=true to test with real AI."
      );
    }

    if (!hasApiKey) {
      console.warn(
        "⚠️ No AI API key found. Tests will be skipped. " +
          "Set AI_GATEWAY_API_KEY or OPENAI_API_KEY to run."
      );
    }
  });

  it.skipIf(!canRunRealAI)(
    "parses bet2.png (back) and bet3.png (lay) correctly",
    { timeout: 60_000 },
    async () => {
      // Dynamic import to avoid issues with module initialization
      const { parseMatchedBetFromScreenshots } = await import(
        "@/lib/bet-parser"
      );

      const backImageUrl = readImageAsBase64("bet2.png");
      const layImageUrl = readImageAsBase64("bet3.png");

      const result = await parseMatchedBetFromScreenshots({
        backImageUrl,
        layImageUrl,
      });

      console.log("Parsed result:", JSON.stringify(result, null, 2));

      // Back bet assertions (bet2.png - USD bookmaker bet)
      expect(result.back).toBeDefined();
      expect(result.back.type).toBe("back");
      expect(result.back.stake).toBeGreaterThan(0);
      expect(result.back.odds).toBeGreaterThan(1);
      expect(result.back.currency).toBe("USD");

      // Based on user's report: back is 2300.46 USD at 1.46 odds
      expect(result.back.stake).toBeCloseTo(2300.46, 0); // Within 1 unit
      expect(result.back.odds).toBeCloseTo(1.46, 1); // Within 0.1

      // Lay bet assertions (bet3.png - NOK exchange bet)
      expect(result.lay).toBeDefined();
      expect(result.lay.type).toBe("lay");
      expect(result.lay.odds).toBeGreaterThan(1);
      expect(result.lay.currency).toBe("NOK");

      // Based on user's report: lay liability is 11036.78 NOK at 1.46 odds
      // If AI extracted correctly, liability should be set
      if (result.lay.liability) {
        expect(result.lay.liability).toBeCloseTo(11_036.78, 0);
      } else {
        // If liability not extracted, stake should be liability / (odds - 1)
        // 11036.78 / 0.46 ≈ 23992.78
        expect(result.lay.stake).toBeGreaterThan(0);
      }

      expect(result.lay.odds).toBeCloseTo(1.46, 1);

      // Verify the computed net exposure would be correct
      const backProfit = result.back.stake * (result.back.odds - 1);
      const layLiability =
        result.lay.liability ?? result.lay.stake * (result.lay.odds - 1);

      console.log("Calculated values:", {
        backStake: result.back.stake,
        backOdds: result.back.odds,
        backProfit,
        layStake: result.lay.stake,
        layOdds: result.lay.odds,
        layLiability,
        layLiabilityField: result.lay.liability,
      });

      // Liability should be around 11036.78 NOK
      expect(layLiability).toBeCloseTo(11_036.78, -1); // Within 10 units
    }
  );

  it.skipIf(!canRunRealAI)(
    "parses bet2.png as both back and lay (same image test)",
    { timeout: 60_000 },
    async () => {
      const { parseMatchedBetFromScreenshots } = await import(
        "@/lib/bet-parser"
      );

      const imageUrl = readImageAsBase64("bet2.png");

      const result = await parseMatchedBetFromScreenshots({
        backImageUrl: imageUrl,
        layImageUrl: imageUrl,
      });

      console.log("Same image result:", JSON.stringify(result, null, 2));

      // Both should parse the same bet slip
      expect(result.back.stake).toBeCloseTo(result.lay.stake, 0);
      expect(result.back.odds).toBeCloseTo(result.lay.odds, 1);
    }
  );
});
