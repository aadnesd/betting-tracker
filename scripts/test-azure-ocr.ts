/**
 * Test Azure Document Intelligence OCR
 * 
 * Usage: 
 *   source .env.local && npx tsx scripts/test-azure-ocr.ts
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { extractTextFromImage } from "../lib/azure-ocr";

async function main() {
  console.log("=".repeat(60));
  console.log("AZURE DOCUMENT INTELLIGENCE OCR TEST");
  console.log("=".repeat(60));

  const testImagesDir = path.join(process.cwd(), "tests/test-images");
  const bet2Path = path.join(testImagesDir, "bet2.png");
  const bet3Path = path.join(testImagesDir, "bet3.png");

  // Test bet2.png
  console.log("\n--- Testing bet2.png ---");
  const bet2Image = readFileSync(bet2Path);
  console.log(`Image size: ${(bet2Image.length / 1024).toFixed(1)}KB`);

  try {
    const result1 = await extractTextFromImage(bet2Image);
    console.log(`OCR Duration: ${result1.durationMs}ms`);
    console.log(`Confidence: ${(result1.confidence * 100).toFixed(1)}%`);
    console.log(`Lines: ${result1.lines.length}`);
    console.log("\nExtracted text:");
    console.log("-".repeat(40));
    console.log(result1.text);
    console.log("-".repeat(40));
  } catch (error) {
    console.error("Error:", error);
  }

  // Test bet3.png
  console.log("\n--- Testing bet3.png ---");
  const bet3Image = readFileSync(bet3Path);
  console.log(`Image size: ${(bet3Image.length / 1024).toFixed(1)}KB`);

  try {
    const result2 = await extractTextFromImage(bet3Image);
    console.log(`OCR Duration: ${result2.durationMs}ms`);
    console.log(`Confidence: ${(result2.confidence * 100).toFixed(1)}%`);
    console.log(`Lines: ${result2.lines.length}`);
    console.log("\nExtracted text:");
    console.log("-".repeat(40));
    console.log(result2.text);
    console.log("-".repeat(40));
  } catch (error) {
    console.error("Error:", error);
  }

  console.log("\n✅ Azure OCR test completed");
}

main().catch(console.error);
