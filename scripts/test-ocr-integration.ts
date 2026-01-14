import fs from "fs";
import path from "path";
import { extractTextFromImages } from "../lib/azure-ocr";
import { isOcrConfigured } from "../lib/bet-parser-ocr";

async function main() {
  console.log("============================================================");
  console.log("OCR + LLM PARSER INTEGRATION TEST");
  console.log("============================================================");

  // Check OCR configuration
  console.log("\n--- Configuration Check ---");
  const configured = isOcrConfigured();
  console.log("OCR Configured:", configured);
  
  if (!configured) {
    console.log("❌ Azure OCR not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY");
    process.exit(1);
  }

  // Load test images
  const backPath = path.join(process.cwd(), "tests/test-images/bet2.png");
  const layPath = path.join(process.cwd(), "tests/test-images/bet3.png");

  const backBuffer = fs.readFileSync(backPath);
  const layBuffer = fs.readFileSync(layPath);
  
  console.log("\nTest images:");
  console.log("  - Back bet:", backPath, `(${(backBuffer.length / 1024).toFixed(1)}KB)`);
  console.log("  - Lay bet:", layPath, `(${(layBuffer.length / 1024).toFixed(1)}KB)`);

  // Test OCR extraction
  console.log("\n--- Step 1: OCR Text Extraction (parallel) ---");
  const ocrStart = Date.now();
  const [backResult, layResult] = await extractTextFromImages([backBuffer, layBuffer]);
  const ocrDuration = Date.now() - ocrStart;

  const backText = backResult.text;
  const layText = layResult.text;

  console.log(`OCR Duration: ${ocrDuration}ms (both images in parallel)`);
  console.log(`Back OCR: ${backResult.durationMs}ms, ${backResult.lines.length} lines, ${(backResult.confidence * 100).toFixed(0)}% confidence`);
  console.log(`Lay OCR: ${layResult.durationMs}ms, ${layResult.lines.length} lines, ${(layResult.confidence * 100).toFixed(0)}% confidence`);
  
  console.log(`\nBack bet text (${backText.length} chars):`);
  console.log("----------------------------------------");
  console.log(backText);
  console.log("----------------------------------------");
  
  console.log(`\nLay bet text (${layText.length} chars):`);
  console.log("----------------------------------------");
  console.log(layText);
  console.log("----------------------------------------");

  // Verify extracted content
  console.log("\n--- Step 2: Content Verification ---");
  const backHasOdds = backText.includes("1.46");
  const backHasTeam = backText.toLowerCase().includes("real madrid");
  const layHasOdds = layText.includes("1.46");
  const layHasLiability = layText.toLowerCase().includes("liability");
  
  console.log("Back bet contains odds (1.46):", backHasOdds ? "✅" : "❌");
  console.log("Back bet contains team (Real Madrid):", backHasTeam ? "✅" : "❌");
  console.log("Lay bet contains odds (1.46):", layHasOdds ? "✅" : "❌");
  console.log("Lay bet contains liability:", layHasLiability ? "✅" : "❌");

  // Summary
  console.log("\n============================================================");
  console.log("SUMMARY");
  console.log("============================================================");
  console.log(`Total OCR time: ${ocrDuration}ms`);
  console.log(`Average per image: ${Math.round(ocrDuration / 2)}ms`);
  console.log(`Content extraction: ${backHasOdds && backHasTeam && layHasOdds && layHasLiability ? "✅ All checks passed" : "⚠️ Some checks failed"}`);
  console.log("\n✅ OCR integration test completed");
}

main().catch((e) => {
  console.error("Error:", e.message);
  console.error(e.stack);
  process.exit(1);
});
