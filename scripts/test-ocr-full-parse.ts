import fs from "fs";
import path from "path";
import { isOcrConfigured, parseMatchedBetWithOcr } from "../lib/bet-parser-ocr";

async function main() {
  console.log("============================================================");
  console.log("FULL OCR + LLM PARSING INTEGRATION TEST");
  console.log("============================================================");

  // Check OCR configuration
  console.log("\n--- Configuration Check ---");
  const configured = isOcrConfigured();
  console.log("OCR Configured:", configured);
  
  if (!configured) {
    console.log("❌ Azure OCR not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY");
    process.exit(1);
  }

  // Load test images and convert to data URLs
  const backPath = path.join(process.cwd(), "tests/test-images/bet2.png");
  const layPath = path.join(process.cwd(), "tests/test-images/bet3.png");

  const backBuffer = fs.readFileSync(backPath);
  const layBuffer = fs.readFileSync(layPath);
  
  // Convert to data URLs (base64)
  const backDataUrl = `data:image/png;base64,${backBuffer.toString("base64")}`;
  const layDataUrl = `data:image/png;base64,${layBuffer.toString("base64")}`;
  
  console.log("\nTest images:");
  console.log("  - Back bet:", `bet2.png (${(backBuffer.length / 1024).toFixed(1)}KB)`);
  console.log("  - Lay bet:", `bet3.png (${(layBuffer.length / 1024).toFixed(1)}KB)`);

  // Run full parse (OCR + LLM)
  console.log("\n--- Running Full Parse (OCR + LLM) ---");
  console.log("This will:");
  console.log("  1. Extract text from both images using Azure OCR");
  console.log("  2. Send extracted text to LLM for structured parsing");
  console.log("  3. Return parsed bet data");
  console.log("");

  const startTime = Date.now();
  
  try {
    const result = await parseMatchedBetWithOcr({
      backImageUrl: backDataUrl,
      layImageUrl: layDataUrl,
    });
    const totalDuration = Date.now() - startTime;

    console.log("\n--- Parse Results ---");
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log(`Needs Review: ${result.needsReview}`);
    
    console.log("\n📊 BACK BET:");
    console.log("----------------------------------------");
    console.log(JSON.stringify(result.back, null, 2));
    console.log("----------------------------------------");
    
    console.log("\n📊 LAY BET:");
    console.log("----------------------------------------");
    console.log(JSON.stringify(result.lay, null, 2));
    console.log("----------------------------------------");

    // Verify parsed data
    console.log("\n--- Data Verification ---");
    const backOk = result.back.odds !== undefined && result.back.stake !== undefined;
    const layOk = result.lay.odds !== undefined && result.lay.stake !== undefined;
    const marketMatch = result.back.market === result.lay.market || 
                        result.back.selection === result.lay.selection;
    
    console.log("Back bet has odds & stake:", backOk ? "✅" : "❌");
    console.log("Lay bet has odds & stake:", layOk ? "✅" : "❌");
    console.log("Markets/selections align:", marketMatch ? "✅" : "⚠️");
    
    // Expected values check
    const expectedOdds = 1.46;
    const backOddsCorrect = Math.abs((result.back.odds || 0) - expectedOdds) < 0.01;
    const layOddsCorrect = Math.abs((result.lay.odds || 0) - expectedOdds) < 0.01;
    
    console.log(`Back odds = ${expectedOdds}:`, backOddsCorrect ? `✅ (${result.back.odds})` : `❌ (got ${result.back.odds})`);
    console.log(`Lay odds = ${expectedOdds}:`, layOddsCorrect ? `✅ (${result.lay.odds})` : `❌ (got ${result.lay.odds})`);

    // Summary
    console.log("\n============================================================");
    console.log("SUMMARY");
    console.log("============================================================");
    console.log(`Total time: ${totalDuration}ms`);
    console.log(`  - Includes: OCR (~5s) + LLM parsing`);
    const allChecks = backOk && layOk && backOddsCorrect && layOddsCorrect;
    console.log(`Data quality: ${allChecks ? "✅ All checks passed" : "⚠️ Some checks need review"}`);
    console.log(`Needs review: ${result.needsReview}`);
    console.log("\n✅ Full integration test completed");

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`\n❌ Parse failed after ${totalDuration}ms`);
    console.error("Error:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error("\nStack:", error.stack);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e.message);
  console.error(e.stack);
  process.exit(1);
});
