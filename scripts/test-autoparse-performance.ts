/**
 * Performance test script for the autoparse endpoint.
 *
 * Tests the actual AI parsing flow with real images to measure:
 * 1. Image upload time (Vercel Blob)
 * 2. AI parsing time (the main bottleneck)
 * 3. Database operations
 *
 * Usage:
 *   npx tsx scripts/test-autoparse-performance.ts
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function measureTime<T>(
  name: string,
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await fn();
  const durationMs = Date.now() - start;
  console.log(`[${name}] ${durationMs}ms`);
  return { result, durationMs };
}

async function testWithImages(backPath: string, layPath: string) {
  console.log("\n" + "=".repeat(60));
  console.log(
    `Testing with: ${path.basename(backPath)} / ${path.basename(layPath)}`
  );
  console.log("=".repeat(60));

  // Read images
  const backImage = readFileSync(backPath);
  const layImage = readFileSync(layPath);

  console.log(`Back image size: ${(backImage.length / 1024).toFixed(1)}KB`);
  console.log(`Lay image size: ${(layImage.length / 1024).toFixed(1)}KB`);

  // Step 1: Upload screenshots
  const formData = new FormData();
  formData.append(
    "back",
    new Blob([backImage], { type: "image/png" }),
    path.basename(backPath)
  );
  formData.append(
    "lay",
    new Blob([layImage], { type: "image/png" }),
    path.basename(layPath)
  );

  const uploadResult = await measureTime("1. Upload screenshots", async () => {
    const res = await fetch(`${BASE_URL}/api/bets/screenshots`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upload failed: ${res.status} - ${text}`);
    }
    return res.json();
  });

  console.log(
    "   Upload response:",
    JSON.stringify(uploadResult.result, null, 2)
  );

  // Step 2: Autoparse
  const autoparseResult = await measureTime("2. Autoparse (AI)", async () => {
    const res = await fetch(`${BASE_URL}/api/bets/autoparse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        backScreenshotId: uploadResult.result.back.id,
        layScreenshotId: uploadResult.result.lay.id,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Autoparse failed: ${res.status} - ${text}`);
    }
    return res.json();
  });

  console.log("\n   Autoparse response:");
  console.log("   Back:", JSON.stringify(autoparseResult.result.back, null, 2));
  console.log("   Lay:", JSON.stringify(autoparseResult.result.lay, null, 2));
  console.log("   Needs Review:", autoparseResult.result.needsReview);

  // Summary
  console.log("\n" + "-".repeat(60));
  console.log("TIMING SUMMARY:");
  console.log(`  Upload:    ${uploadResult.durationMs}ms`);
  console.log(`  Autoparse: ${autoparseResult.durationMs}ms`);
  console.log(
    `  TOTAL:     ${uploadResult.durationMs + autoparseResult.durationMs}ms`
  );
  console.log("-".repeat(60));

  return {
    upload: uploadResult.durationMs,
    autoparse: autoparseResult.durationMs,
    total: uploadResult.durationMs + autoparseResult.durationMs,
  };
}

async function main() {
  console.log("=".repeat(60));
  console.log("AUTOPARSE PERFORMANCE TEST");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("=".repeat(60));

  const testImagesDir = path.join(process.cwd(), "tests/test-images");

  try {
    // Test with bet2.png (using same image for both back and lay for now)
    const bet2Path = path.join(testImagesDir, "bet2.png");
    const bet3Path = path.join(testImagesDir, "bet3.png");

    await testWithImages(bet2Path, bet3Path);

    console.log("\n✅ Performance test completed");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
