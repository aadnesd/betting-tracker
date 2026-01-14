/**
 * End-to-end integration test for the full bet parsing flow:
 * 1. OCR text extraction from screenshots (Azure Document Intelligence)
 * 2. LLM parsing of extracted text (Google Gemini)
 * 3. Football match linking (football-data.org API)
 *
 * Run with: npx tsx tests/integration/ocr-parse-match.test.ts
 *
 * Requires:
 * - AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
 * - AZURE_DOCUMENT_INTELLIGENCE_KEY
 * - AI_GATEWAY_API_KEY
 * - FOOTBALL_DATA_API_TOKEN (optional, for match linking)
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

// Load environment variables
config({ path: ".env.local" });

const TEST_IMAGES_DIR = path.join(__dirname, "..", "test-images");

interface TestResult {
  step: string;
  success: boolean;
  durationMs: number;
  data?: unknown;
  error?: string;
}

async function runTest(): Promise<void> {
  console.log("============================================================");
  console.log("END-TO-END OCR → PARSE → MATCH INTEGRATION TEST");
  console.log("============================================================");
  console.log("");

  const results: TestResult[] = [];
  const totalStart = Date.now();

  // Step 0: Check configuration
  console.log("📋 Step 0: Configuration Check");
  console.log("------------------------------------------------------------");
  
  const hasOcr = Boolean(
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT &&
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
  );
  const hasAi = Boolean(process.env.AI_GATEWAY_API_KEY);
  const hasFootball = Boolean(process.env.FOOTBALL_DATA_API_TOKEN);

  console.log(`  Azure OCR: ${hasOcr ? "✅" : "❌"}`);
  console.log(`  AI Gateway: ${hasAi ? "✅" : "❌"}`);
  console.log(`  Football API: ${hasFootball ? "✅ (optional)" : "⚠️ (optional, skipping match link)"}`);
  console.log("");

  if (!hasOcr || !hasAi) {
    console.log("❌ Missing required configuration. Cannot run test.");
    process.exit(1);
  }

  // Load test images
  const backPath = path.join(TEST_IMAGES_DIR, "bet2.png");
  const layPath = path.join(TEST_IMAGES_DIR, "bet3.png");
  
  const backBuffer = fs.readFileSync(backPath);
  const layBuffer = fs.readFileSync(layPath);
  
  const backDataUrl = `data:image/png;base64,${backBuffer.toString("base64")}`;
  const layDataUrl = `data:image/png;base64,${layBuffer.toString("base64")}`;

  console.log(`  Back image: bet2.png (${(backBuffer.length / 1024).toFixed(1)}KB)`);
  console.log(`  Lay image: bet3.png (${(layBuffer.length / 1024).toFixed(1)}KB)`);
  console.log("");

  // Step 1: OCR Text Extraction
  console.log("🔍 Step 1: OCR Text Extraction (Azure Document Intelligence)");
  console.log("------------------------------------------------------------");
  
  let backText = "";
  let layText = "";
  
  try {
    const { extractTextFromImages } = await import("@/lib/azure-ocr");
    
    const ocrStart = Date.now();
    const [backResult, layResult] = await extractTextFromImages([backDataUrl, layDataUrl]);
    const ocrDuration = Date.now() - ocrStart;
    
    backText = backResult.text;
    layText = layResult.text;
    
    console.log(`  Duration: ${ocrDuration}ms (parallel extraction)`);
    console.log(`  Back: ${backResult.lines.length} lines, ${(backResult.confidence * 100).toFixed(0)}% confidence`);
    console.log(`  Lay: ${layResult.lines.length} lines, ${(layResult.confidence * 100).toFixed(0)}% confidence`);
    console.log("");
    console.log("  Back text preview:");
    console.log(`    "${backText.substring(0, 100).replace(/\n/g, " ")}..."`);
    console.log("  Lay text preview:");
    console.log(`    "${layText.substring(0, 100).replace(/\n/g, " ")}..."`);
    console.log("");
    
    results.push({
      step: "OCR Extraction",
      success: true,
      durationMs: ocrDuration,
      data: { backLines: backResult.lines.length, layLines: layResult.lines.length },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ OCR failed: ${msg}`);
    results.push({ step: "OCR Extraction", success: false, durationMs: 0, error: msg });
    printSummary(results, totalStart);
    process.exit(1);
  }

  // Step 2: LLM Parsing
  console.log("🤖 Step 2: LLM Parsing (Google Gemini 2.0 Flash)");
  console.log("------------------------------------------------------------");
  
  let parsedData: {
    back: { market: string; selection: string; odds: number; stake: number; currency?: string | null };
    lay: { market: string; selection: string; odds: number; stake: number; liability?: number | null; currency?: string | null };
    needsReview: boolean;
  } | null = null;
  
  try {
    const { parseMatchedBetWithOcr } = await import("@/lib/bet-parser-ocr");
    
    const parseStart = Date.now();
    const result = await parseMatchedBetWithOcr({
      backImageUrl: backDataUrl,
      layImageUrl: layDataUrl,
    });
    const parseDuration = Date.now() - parseStart;
    
    parsedData = result;
    
    console.log(`  Duration: ${parseDuration}ms (OCR: ${result.ocrDurationMs}ms, LLM: ${result.llmDurationMs}ms)`);
    console.log("");
    console.log("  Parsed Back Bet:");
    console.log(`    Market: ${result.back.market}`);
    console.log(`    Selection: ${result.back.selection}`);
    console.log(`    Odds: ${result.back.odds}`);
    console.log(`    Stake: ${result.back.stake} ${result.back.currency || "?"}`);
    console.log("");
    console.log("  Parsed Lay Bet:");
    console.log(`    Market: ${result.lay.market}`);
    console.log(`    Selection: ${result.lay.selection}`);
    console.log(`    Odds: ${result.lay.odds}`);
    console.log(`    Stake: ${result.lay.stake} ${result.lay.currency || "?"}`);
    console.log(`    Liability: ${result.lay.liability || "N/A"}`);
    console.log("");
    console.log(`  Needs Review: ${result.needsReview}`);
    if (result.notes) console.log(`  Notes: ${result.notes}`);
    console.log("");
    
    // Verify expected values
    const expectedOdds = 1.46;
    const expectedBackStake = 2300.46;
    const expectedLayLiability = 11036.78;
    
    const oddsMatch = Math.abs(result.back.odds - expectedOdds) < 0.01 && Math.abs(result.lay.odds - expectedOdds) < 0.01;
    const stakeMatch = Math.abs(result.back.stake - expectedBackStake) < 1;
    const liabilityMatch = result.lay.liability && Math.abs(result.lay.liability - expectedLayLiability) < 1;
    const layCurrencyNok = result.lay.currency === "NOK";
    
    console.log("  Verification:");
    console.log(`    Odds correct (1.46): ${oddsMatch ? "✅" : "❌"} (back: ${result.back.odds}, lay: ${result.lay.odds})`);
    console.log(`    Back stake correct (~2300.46): ${stakeMatch ? "✅" : "❌"} (${result.back.stake})`);
    console.log(`    Lay liability correct (~11036.78): ${liabilityMatch ? "✅" : "⚠️"} (${result.lay.liability})`);
    console.log(`    Lay currency is NOK: ${layCurrencyNok ? "✅" : "❌"} (${result.lay.currency})`);
    console.log("");
    
    results.push({
      step: "LLM Parsing",
      success: oddsMatch && stakeMatch,
      durationMs: parseDuration,
      data: {
        backOdds: result.back.odds,
        layOdds: result.lay.odds,
        backStake: result.back.stake,
        layLiability: result.lay.liability,
        layCurrency: result.lay.currency,
        needsReview: result.needsReview,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ Parsing failed: ${msg}`);
    results.push({ step: "LLM Parsing", success: false, durationMs: 0, error: msg });
    printSummary(results, totalStart);
    process.exit(1);
  }

  // Step 3: Football Match Linking (optional)
  if (hasFootball && parsedData) {
    console.log("⚽ Step 3: Football Match Search (football-data.org API)");
    console.log("------------------------------------------------------------");
    
    try {
      // Extract team names from market
      const market = parsedData.back.market;
      const selection = parsedData.back.selection;
      
      console.log(`  Market: "${market}"`);
      console.log(`  Selection: "${selection}"`);
      console.log("");
      
      const searchStart = Date.now();
      
      // Call football-data.org API directly to search for matches
      // This tests whether we can find the match from the parsed data
      const apiToken = process.env.FOOTBALL_DATA_API_TOKEN;
      const today = new Date();
      const dateFrom = new Date(today);
      dateFrom.setDate(dateFrom.getDate() - 3); // Last 3 days
      const dateTo = new Date(today);
      dateTo.setDate(dateTo.getDate() + 7); // Next 7 days (10 day limit on API)
      
      const apiUrl = new URL("https://api.football-data.org/v4/matches");
      apiUrl.searchParams.set("dateFrom", dateFrom.toISOString().split("T")[0]);
      apiUrl.searchParams.set("dateTo", dateTo.toISOString().split("T")[0]);
      // Search across major competitions
      apiUrl.searchParams.set("competitions", "PL,CL,PD,BL1,SA,FL1");
      
      console.log(`  Fetching matches from ${dateFrom.toISOString().split("T")[0]} to ${dateTo.toISOString().split("T")[0]}...`);
      
      const response = await fetch(apiUrl.toString(), {
        headers: {
          "X-Auth-Token": apiToken!,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Football API returned ${response.status}: ${await response.text()}`);
      }
      
      const data = await response.json() as {
        matches: Array<{
          id: number;
          homeTeam: { name: string };
          awayTeam: { name: string };
          competition: { name: string };
          status: string;
          utcDate: string;
        }>;
      };
      
      const searchDuration = Date.now() - searchStart;
      
      // Search for matches involving the selection (e.g., "Real Madrid")
      const matchingMatches = data.matches.filter((m) => 
        m.homeTeam.name.toLowerCase().includes(selection.toLowerCase()) ||
        m.awayTeam.name.toLowerCase().includes(selection.toLowerCase())
      );
      
      console.log(`  API Duration: ${searchDuration}ms`);
      console.log(`  Total matches fetched: ${data.matches.length}`);
      console.log(`  Matches involving "${selection}": ${matchingMatches.length}`);
      console.log("");
      
      if (matchingMatches.length > 0) {
        console.log("  Matching fixtures:");
        for (const match of matchingMatches.slice(0, 5)) {
          const date = new Date(match.utcDate).toLocaleDateString();
          console.log(`    - ${match.homeTeam.name} vs ${match.awayTeam.name} (${match.competition.name}, ${date}, ${match.status})`);
        }
      } else {
        console.log(`  No upcoming matches found for "${selection}" in major competitions.`);
        console.log("  (This match may be in a league not in our sync list, e.g., La Liga 2)");
      }
      console.log("");
      
      results.push({
        step: "Match Linking",
        success: true,
        durationMs: searchDuration,
        data: { 
          totalMatches: data.matches.length, 
          matchingMatches: matchingMatches.length,
          selection,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ⚠️ Match linking failed: ${msg}`);
      console.log("    (This is optional - the bet was still parsed correctly)");
      console.log("");
      results.push({ step: "Match Linking", success: false, durationMs: 0, error: msg });
    }
  } else if (!hasFootball) {
    console.log("⚽ Step 3: Football Match Linking (SKIPPED - no API token)");
    console.log("------------------------------------------------------------");
    console.log("  Set FOOTBALL_DATA_API_TOKEN to enable match linking.");
    console.log("");
  }

  printSummary(results, totalStart);
}

function printSummary(results: TestResult[], totalStart: number): void {
  const totalDuration = Date.now() - totalStart;
  
  console.log("============================================================");
  console.log("SUMMARY");
  console.log("============================================================");
  console.log("");
  console.log("| Step | Status | Duration |");
  console.log("|------|--------|----------|");
  
  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    console.log(`| ${r.step.padEnd(16)} | ${status}     | ${String(r.durationMs).padStart(6)}ms |`);
  }
  
  console.log("");
  console.log(`Total time: ${totalDuration}ms`);
  
  const allSuccess = results.every(r => r.success);
  if (allSuccess) {
    console.log("");
    console.log("✅ All steps completed successfully!");
  } else {
    const failed = results.filter(r => !r.success);
    console.log("");
    console.log(`❌ ${failed.length} step(s) failed: ${failed.map(f => f.step).join(", ")}`);
  }
}

runTest().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
