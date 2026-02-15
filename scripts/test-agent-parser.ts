/**
 * Test script for the agentic bet parser.
 *
 * Usage: pnpm tsx scripts/test-agent-parser.ts
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load environment variables FIRST before any other imports
const envPath = path.join(__dirname, "../.env.local");
console.log(`Loading env from: ${envPath}`);
dotenv.config({ path: envPath });

// Verify env loaded
console.log(
  `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: ${process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ? "✓ Set" : "✗ Missing"}`
);
console.log(
  `AI_GATEWAY_API_KEY: ${process.env.AI_GATEWAY_API_KEY ? "✓ Set" : "✗ Missing"}`
);

// Now import the parser (after env is loaded)
import {
  type AgentAccount,
  parseMatchedBetWithAgent,
  parseSingleBetWithAgent,
} from "../lib/bet-parser-agent";

// Mock accounts for testing
const testAccounts: AgentAccount[] = [
  {
    id: "550e8400-e29b-41d4-a716-446655440001",
    name: "Stake",
    kind: "bookmaker",
    currency: "USD",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    name: "bfb247",
    kind: "exchange",
    currency: "NOK",
  },
];

async function main() {
  const testImagesDir = path.join(__dirname, "../tests/test-images");

  // Read test images
  const image1Path = path.join(testImagesDir, "Untitled 4.png");
  const image2Path = path.join(testImagesDir, "Untitled 5.png");

  if (!fs.existsSync(image1Path) || !fs.existsSync(image2Path)) {
    console.error("Test images not found in tests/test-images/");
    process.exit(1);
  }

  // Convert images to data URLs
  const image1Buffer = fs.readFileSync(image1Path);
  const image2Buffer = fs.readFileSync(image2Path);

  const image1DataUrl = `data:image/png;base64,${image1Buffer.toString("base64")}`;
  const image2DataUrl = `data:image/png;base64,${image2Buffer.toString("base64")}`;

  console.log("=== Testing Agentic Bet Parser ===\n");
  console.log(
    `Test accounts: ${testAccounts.map((a) => `${a.name} (${a.kind})`).join(", ")}\n`
  );

  try {
    // Test image 1 as back bet
    console.log("--- Image 1 (Untitled 4.png) as BACK bet ---");
    const result1 = await parseSingleBetWithAgent({
      imageUrl: image1DataUrl,
      accounts: testAccounts,
      betKind: "back",
    });
    console.log("Result:", JSON.stringify(result1.bet, null, 2));
    console.log(
      `OCR: ${result1.ocrDurationMs}ms, LLM: ${result1.llmDurationMs}ms\n`
    );

    // Test image 2 as lay bet
    console.log("--- Image 2 (Untitled 5.png) as LAY bet ---");
    const result2 = await parseSingleBetWithAgent({
      imageUrl: image2DataUrl,
      accounts: testAccounts,
      betKind: "lay",
    });
    console.log("Result:", JSON.stringify(result2.bet, null, 2));
    console.log(
      `OCR: ${result2.ocrDurationMs}ms, LLM: ${result2.llmDurationMs}ms\n`
    );

    console.log("=== Test Complete ===");
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

main();
