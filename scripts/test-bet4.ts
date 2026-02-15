/**
 * Test OCR + LLM parsing + match linking with bet4lay.png
 */
import fs from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const imagePath = "tests/test-images/bet4lay.png";
  const buffer = fs.readFileSync(imagePath);
  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;

  console.log(
    `Testing with: ${imagePath} (${(buffer.length / 1024).toFixed(1)}KB)`
  );
  console.log("");

  // Step 1: OCR
  console.log("🔍 Step 1: OCR Text Extraction...");
  const { extractTextFromImage } = await import("../lib/azure-ocr");
  const ocrStart = Date.now();
  const ocrResult = await extractTextFromImage(dataUrl);
  console.log(`  Duration: ${Date.now() - ocrStart}ms`);
  console.log(
    `  Lines: ${ocrResult.lines.length}, Confidence: ${(ocrResult.confidence * 100).toFixed(0)}%`
  );
  console.log("  Full text:");
  console.log(`  "${ocrResult.text}"`);
  console.log("");

  // Step 2: Parse with LLM
  console.log("🤖 Step 2: LLM Parsing...");
  const { gateway } = await import("@ai-sdk/gateway");
  const { generateObject } = await import("ai");
  const { z } = await import("zod");

  const BetSchema = z.object({
    market: z.string().describe("The match or event name"),
    selection: z.string().describe("The team or outcome selected"),
    odds: z.number().describe("The decimal odds"),
    stake: z.number().optional().describe("The stake amount"),
    liability: z
      .number()
      .optional()
      .describe("The liability amount for lay bets"),
    currency: z.string().optional().describe("Currency code, defaults to NOK"),
    bookmaker: z.string().optional().describe("The bookmaker or exchange name"),
  });

  const llmStart = Date.now();
  const result = await generateObject({
    model: gateway.languageModel("google/gemini-2.0-flash"),
    schema: BetSchema,
    prompt: `Extract bet details from this OCR text. Currency defaults to NOK if not specified.

OCR Text:
${ocrResult.text}`,
  });
  console.log(`  Duration: ${Date.now() - llmStart}ms`);
  console.log("  Parsed:", JSON.stringify(result.object, null, 2));
  console.log("");

  // Step 3: Match Search
  if (process.env.FOOTBALL_DATA_API_TOKEN) {
    console.log("⚽ Step 3: Football Match Search...");
    const today = new Date();
    const dateFrom = new Date(today);
    dateFrom.setDate(dateFrom.getDate() - 3);
    const dateTo = new Date(today);
    dateTo.setDate(dateTo.getDate() + 7);

    const apiUrl = new URL("https://api.football-data.org/v4/matches");
    apiUrl.searchParams.set("dateFrom", dateFrom.toISOString().split("T")[0]);
    apiUrl.searchParams.set("dateTo", dateTo.toISOString().split("T")[0]);
    apiUrl.searchParams.set("competitions", "PL,CL,PD,BL1,SA,FL1");

    const searchStart = Date.now();
    const response = await fetch(apiUrl.toString(), {
      headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_API_TOKEN },
    });
    const data = (await response.json()) as {
      matches: Array<{
        homeTeam: { name: string };
        awayTeam: { name: string };
        competition: { name: string };
        utcDate: string;
      }>;
    };

    const selection = result.object.selection.toLowerCase();
    // Handle common abbreviations
    const searchTerms = [selection];
    if (selection === "man city") searchTerms.push("manchester city");
    if (selection === "man utd") searchTerms.push("manchester united");

    const matching =
      data.matches?.filter((m) =>
        searchTerms.some(
          (term) =>
            m.homeTeam.name.toLowerCase().includes(term) ||
            m.awayTeam.name.toLowerCase().includes(term)
        )
      ) || [];

    console.log(`  Duration: ${Date.now() - searchStart}ms`);
    console.log(`  Fetched: ${data.matches?.length || 0} matches`);
    console.log(`  Matching "${result.object.selection}": ${matching.length}`);

    for (const m of matching.slice(0, 5)) {
      const date = new Date(m.utcDate).toLocaleDateString();
      console.log(
        `    - ${m.homeTeam.name} vs ${m.awayTeam.name} (${m.competition.name}, ${date})`
      );
    }
  }

  console.log("");
  console.log("✅ Done!");
}

main().catch(console.error);
