/**
 * Test script to verify ToolLoopAgent with structured output and tools.
 *
 * Usage: pnpm tsx scripts/test-toolloop-agent.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env.local") });

import { gateway } from "@ai-sdk/gateway";
import { Output, stepCountIs, ToolLoopAgent, tool } from "ai";
import { z } from "zod";

// Simple weather tool for testing
const getWeatherTool = tool({
  description: "Get the current weather for a city",
  inputSchema: z.object({
    city: z.string().describe("The city to get weather for"),
  }),
  execute: async (input: { city: string }) => {
    console.log(`[tool] getWeather called for: ${input.city}`);
    // Mock weather data
    const temps: Record<string, number> = {
      oslo: -5,
      london: 8,
      "new york": 2,
      tokyo: 12,
    };
    const temp = temps[input.city.toLowerCase()] ?? 15;
    return `Weather in ${input.city}: ${temp}°C, partly cloudy`;
  },
});

// Structured output schema
const travelAdviceSchema = z.object({
  destination: z.string().describe("The recommended destination"),
  reasoning: z.string().describe("Why this destination is recommended"),
  packingList: z.array(z.string()).describe("Items to pack"),
  weatherSummary: z.string().describe("Summary of expected weather"),
});

async function main() {
  console.log("=== Testing ToolLoopAgent with Structured Output ===\n");

  // Test with multiple models to see which works
  const models = ["openai/gpt-4o-mini", "anthropic/claude-3-5-haiku-latest"];

  for (const modelName of models) {
    console.log(`\n--- Testing with ${modelName} ---\n`);

    try {
      const agent = new ToolLoopAgent({
        model: gateway.languageModel(modelName),
        instructions: `You are a travel advisor. When asked about travel destinations, 
use the getWeather tool to check weather conditions before making recommendations.

CRITICAL: After getting weather data for the requested cities, you MUST stop calling tools
and provide your final structured recommendation immediately.`,
        output: Output.object({
          schema: travelAdviceSchema,
        }),
        stopWhen: stepCountIs(5),
        tools: {
          getWeather: getWeatherTool,
        },
      });

      const result = await agent.generate({
        prompt:
          "Check the weather for Oslo and Tokyo, then recommend which one I should visit if I want warmth.",
      });

      console.log(`Steps taken: ${result.steps.length}`);
      console.log(
        `Tool calls made: ${result.steps.filter((s) => s.toolCalls?.length).length}`
      );

      if (result.output) {
        console.log("✅ Structured Output received:");
        console.log(JSON.stringify(result.output, null, 2));
      } else {
        console.log("❌ No structured output generated!");
      }
    } catch (error) {
      console.error(
        `❌ Error with ${modelName}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log("\n=== Test Complete ===");
}

main();
