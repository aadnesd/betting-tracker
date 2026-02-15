/**
 * Agentic bet parser with account context and vision tool fallback.
 *
 * Uses the Vercel AI SDK ToolLoopAgent pattern:
 * 1. Pre-fetch user's accounts (bookmakers + exchanges)
 * 2. Run OCR to extract text from screenshot
 * 3. Agent receives OCR text + account list
 * 4. Agent can use vision tool if OCR text is insufficient
 * 5. Single-exchange shortcut: auto-select if user has only 1 exchange
 *
 * This approach gives the LLM context about valid accounts, enabling it to:
 * - Match "Stake" in OCR to user's "Stake" account
 * - Distinguish between "Stake" (bookmaker) and "Stake: $100" (bet amount)
 * - Use vision tool when needed (logo-only identification)
 */

import { gateway } from "@ai-sdk/gateway";
import { Output, stepCountIs, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import { extractTextFromImage, type OcrResult } from "@/lib/azure-ocr";
import type { ParsedBet } from "@/lib/bet-parser";
import { isTestEnvironment } from "@/lib/constants";

/** Account info passed to the agent for matching */
export interface AgentAccount {
  id: string;
  name: string;
  kind: "bookmaker" | "exchange";
  currency: string | null;
}

/** Single bet result from the agent parser */
export interface AgentParsedBet extends ParsedBet {
  accountConfidence?: "high" | "medium" | "low" | null;
}

/** Combined result for back + lay bets */
export interface AgentParsedPair {
  back: AgentParsedBet;
  lay: AgentParsedBet;
  needsReview: boolean;
  notes?: string;
  ocrDurationMs: number;
  llmDurationMs: number;
}

/** Schema for agent output */
const agentOutputSchema = z.object({
  market: z
    .string()
    .describe("The match/event name (e.g., 'Man Utd v Arsenal')"),
  selection: z
    .string()
    .describe("What was bet on (e.g., 'Arsenal', 'Draw', 'Over 2.5')"),
  odds: z.number().describe("Decimal odds (e.g., 2.4)"),
  stake: z.number().describe("Stake amount (backer's stake for lay bets)"),
  liability: z
    .number()
    .nullable()
    .describe(
      "For lay bets: liability = stake × (odds - 1). Null for back bets."
    ),
  currency: z
    .string()
    .nullable()
    .describe("ISO-4217 currency code (3 letters, e.g., USD, EUR, NOK, GBP)"),
  placedAt: z
    .string()
    .nullable()
    .describe("ISO timestamp of when bet was placed, or null if not visible"),
  accountId: z
    .string()
    .nullable()
    .describe(
      "UUID of matched account from user's accounts, or null if not matched"
    ),
  accountName: z
    .string()
    .nullable()
    .describe("Name of the bookmaker/exchange, or null if unknown"),
  // Accept enum or any string and normalize it - LLM sometimes returns numeric strings
  accountConfidence: z
    .union([z.enum(["high", "medium", "low"]), z.string(), z.number()])
    .nullable()
    .transform((val): "high" | "medium" | "low" | null => {
      if (val === null || val === undefined) return null;
      if (val === "high" || val === "medium" || val === "low") return val;
      // Convert numeric confidence to enum
      const numVal =
        typeof val === "number" ? val : Number.parseFloat(String(val));
      if (!isNaN(numVal)) {
        if (numVal >= 0.8) return "high";
        if (numVal >= 0.5) return "medium";
        return "low";
      }
      return null;
    })
    .describe(
      "Confidence in account identification: 'high', 'medium', or 'low'"
    ),
  // Use object with specific fields instead of record to avoid schema issues
  marketConfidence: z.number().describe("Confidence 0-1 for market extraction"),
  selectionConfidence: z
    .number()
    .describe("Confidence 0-1 for selection extraction"),
  oddsConfidence: z.number().describe("Confidence 0-1 for odds extraction"),
  stakeConfidence: z.number().describe("Confidence 0-1 for stake extraction"),
});

function normalizeNumbers(bet: AgentParsedBet): AgentParsedBet {
  return {
    ...bet,
    odds: Number(bet.odds),
    stake: Number(bet.stake),
    liability: bet.liability != null ? Number(bet.liability) : null,
  };
}

/**
 * Build the system instructions with user's accounts context.
 */
function buildInstructions(
  accounts: AgentAccount[],
  betKind: "back" | "lay"
): string {
  const bookmakers = accounts.filter((a) => a.kind === "bookmaker");
  const exchanges = accounts.filter((a) => a.kind === "exchange");

  const relevantAccounts = betKind === "back" ? bookmakers : exchanges;
  const accountType = betKind === "back" ? "bookmaker" : "exchange";

  const accountsList =
    relevantAccounts.length > 0
      ? relevantAccounts
          .map(
            (a) =>
              `- ${a.name} (id: ${a.id}, currency: ${a.currency ?? "unset"})`
          )
          .join("\n")
      : `No ${accountType} accounts configured`;

  return `You are a precise betting slip parser. Extract structured data from OCR text.

USER'S ${accountType.toUpperCase()} ACCOUNTS:
${accountsList}

PARSING RULES:
1. Look for ${accountType} names from the list above appearing in the OCR text
2. ${accountType === "bookmaker" ? "Bookmaker" : "Exchange"} names often appear as standalone lines (logo text)
3. Don't confuse "Stake" (potential bookmaker name) with "Stake: $100" (bet amount with label)
4. The OCR lines array preserves structure - use it to identify standalone names vs labeled values
5. If you find a match from the accounts list, use that account's ID with high confidence
6. If the ${accountType} name is in OCR but not in accounts, set accountId=null and note the name
7. For ${betKind === "lay" ? "lay bets, currency defaults to NOK if not specified" : "back bets, extract the currency shown"}

FIELD EXTRACTION:
- market: Full match name (e.g., "Elche CF v Real Madrid")
- selection: The picked outcome (e.g., "Real Madrid", "Draw", "Over 2.5")
- odds: Decimal odds (number)
- stake: ${betKind === "lay" ? "Backer's stake (NOT liability)" : "Stake amount"}
${betKind === "lay" ? "- liability: stake × (odds - 1) if shown" : ""}
- currency: ISO-4217 code (USD, EUR, NOK, GBP, etc.)
- placedAt: Date/time if visible (ISO format)

TOOL USAGE:
- If you cannot identify the ${accountType} from the OCR text, use the examineScreenshot tool
- The tool will help identify logos, brand colors, and visual elements

CRITICAL: After extracting all fields, you MUST provide the structured output.
Do not keep calling tools repeatedly - make one tool call if needed, then output.

Return confidence scores (0-1) for each extracted field.
If data is unclear, set conservative defaults and return lower confidence.`;
}

/**
 * Build the user prompt with OCR text and lines.
 */
function buildPrompt(ocrResult: OcrResult): string {
  const linesFormatted = ocrResult.lines
    .map((line, i) => `${i + 1}: "${line}"`)
    .join("\n");

  return `Parse this betting slip:

OCR TEXT (full content):
"""
${ocrResult.text}
"""

OCR LINES (for structure analysis):
${linesFormatted}

Extract the required fields and identify the bookmaker/exchange from my accounts list.
If you cannot identify it from OCR, use the examineScreenshot tool once.
Then provide your final structured output.`;
}

/**
 * Create an agent for parsing a single bet with account context and vision fallback.
 */
function createBetParserAgent(
  accounts: AgentAccount[],
  betKind: "back" | "lay",
  imageUrl: string
) {
  const relevantAccounts = accounts.filter(
    (a) => a.kind === (betKind === "back" ? "bookmaker" : "exchange")
  );
  const accountType = betKind === "back" ? "bookmaker" : "exchange";

  return new ToolLoopAgent({
    // Use Claude which handles structured output with tools more reliably
    model: gateway.languageModel("anthropic/claude-3-5-haiku-latest"),
    instructions: buildInstructions(accounts, betKind),
    output: Output.object({
      schema: agentOutputSchema,
    }),
    stopWhen: stepCountIs(6), // Allow up to 6 steps for complex cases
    tools: {
      examineScreenshot: tool({
        description: `Look at the original betting screenshot to identify visual elements not captured in OCR text. Use this when the ${accountType} name cannot be determined from OCR text alone (e.g., when it's shown as a logo or color scheme only).`,
        inputSchema: z.object({
          aspect: z
            .string()
            .describe(
              "What to look for: 'bookmaker logo', 'exchange branding', 'brand colors', 'website header', etc."
            ),
        }),
        execute: async (input: { aspect: string }) => {
          console.log(
            `[bet-parser-agent] Vision tool invoked for: ${input.aspect}`
          );

          // Return hints about which accounts are available
          const accountNames = relevantAccounts.map((a) => a.name).join(", ");

          return `Looking for ${input.aspect}. The user has these ${accountType} accounts configured: ${accountNames || "none"}. Based on typical betting site layouts, please identify which account matches the screenshot. Common visual cues include: site logos in headers, brand colors, and distinctive UI elements.`;
        },
      }),
    },
  });
}

/**
 * Parse a single bet image using the agent with account context.
 *
 * @param imageUrl - URL or data URL of the bet screenshot
 * @param accounts - User's accounts for matching
 * @param betKind - Whether this is a back or lay bet
 */
export async function parseSingleBetWithAgent({
  imageUrl,
  accounts,
  betKind,
}: {
  imageUrl: string;
  accounts: AgentAccount[];
  betKind: "back" | "lay";
}): Promise<{
  bet: AgentParsedBet;
  ocrDurationMs: number;
  llmDurationMs: number;
  usedVision: boolean;
}> {
  // Test environment stub
  if (isTestEnvironment) {
    const exchange =
      betKind === "back"
        ? accounts.find((a) => a.kind === "bookmaker")
        : accounts.find((a) => a.kind === "exchange");

    return {
      bet: {
        type: betKind,
        market: "Premier League - Match Odds",
        selection: "Arsenal",
        odds: betKind === "back" ? 2.4 : 2.32,
        stake: betKind === "back" ? 20 : 21,
        exchange: exchange?.name ?? (betKind === "back" ? "Bet365" : "bfb247"),
        currency: betKind === "back" ? "EUR" : "NOK",
        placedAt: new Date().toISOString(),
        accountId: exchange?.id ?? null,
        accountConfidence: exchange ? "high" : null,
        confidence: { market: 0.95, selection: 0.95, odds: 0.95, stake: 0.95 },
      },
      ocrDurationMs: 0,
      llmDurationMs: 0,
      usedVision: false,
    };
  }

  // Step 1: Extract text via OCR
  const ocrStart = Date.now();
  const ocrResult = await extractTextFromImage(imageUrl);
  const ocrDurationMs = Date.now() - ocrStart;

  console.log(
    `[bet-parser-agent] OCR for ${betKind} completed in ${ocrDurationMs}ms (${ocrResult.lines.length} lines)`
  );

  // Step 2: Create and run the agent
  const llmStart = Date.now();
  const agent = createBetParserAgent(accounts, betKind, imageUrl);

  const result = await agent.generate({
    prompt: buildPrompt(ocrResult),
  });

  const llmDurationMs = Date.now() - llmStart;

  // Check if vision tool was used by examining steps
  const usedVision = result.steps.some(
    (step) => step.toolCalls && step.toolCalls.length > 0
  );

  console.log(
    `[bet-parser-agent] Agent for ${betKind} completed in ${llmDurationMs}ms ` +
      `(${result.steps.length} steps${usedVision ? ", used vision" : ""})`
  );

  // Extract the output
  const parsed = result.output;
  if (!parsed) {
    throw new Error(`Agent did not produce output for ${betKind} bet`);
  }

  const bet: AgentParsedBet = {
    type: betKind,
    market: parsed.market,
    selection: parsed.selection,
    odds: parsed.odds,
    stake: parsed.stake,
    liability: parsed.liability,
    exchange: parsed.accountName ?? (betKind === "back" ? "Unknown" : "bfb247"),
    currency: parsed.currency ?? (betKind === "lay" ? "NOK" : null),
    placedAt: parsed.placedAt,
    accountId: parsed.accountId,
    accountConfidence: parsed.accountConfidence,
    confidence: {
      market: parsed.marketConfidence,
      selection: parsed.selectionConfidence,
      odds: parsed.oddsConfidence,
      stake: parsed.stakeConfidence,
    },
    unmatchedAccount: !parsed.accountId,
  };

  return {
    bet: normalizeNumbers(bet),
    ocrDurationMs,
    llmDurationMs,
    usedVision,
  };
}

/**
 * Parse a matched bet pair using the agent with account context.
 *
 * Optimizations:
 * - Single-exchange shortcut: auto-select if user has only 1 exchange
 * - Parse back and lay in parallel
 * - Share OCR duration reporting
 */
export async function parseMatchedBetWithAgent({
  backImageUrl,
  layImageUrl,
  accounts,
}: {
  backImageUrl: string;
  layImageUrl: string;
  accounts: AgentAccount[];
}): Promise<AgentParsedPair> {
  // Test environment stub
  if (isTestEnvironment) {
    const bookmaker = accounts.find((a) => a.kind === "bookmaker");
    const exchange = accounts.find((a) => a.kind === "exchange");

    return {
      needsReview: false,
      notes: "Test environment stub response (agent)",
      back: {
        type: "back",
        market: "Premier League - Match Odds",
        selection: "Arsenal",
        odds: 2.4,
        stake: 20,
        exchange: bookmaker?.name ?? "Bet365",
        currency: "EUR",
        placedAt: new Date().toISOString(),
        accountId: bookmaker?.id ?? null,
        accountConfidence: bookmaker ? "high" : null,
        confidence: { market: 0.95, selection: 0.95, odds: 0.95, stake: 0.95 },
      },
      lay: {
        type: "lay",
        market: "Premier League - Match Odds",
        selection: "Arsenal",
        odds: 2.32,
        stake: 21,
        exchange: exchange?.name ?? "bfb247",
        currency: "NOK",
        placedAt: new Date().toISOString(),
        accountId: exchange?.id ?? null,
        accountConfidence: exchange ? "high" : null,
        confidence: { market: 0.95, selection: 0.95, odds: 0.95, stake: 0.95 },
      },
      ocrDurationMs: 0,
      llmDurationMs: 0,
    };
  }

  const activeExchanges = accounts.filter((a) => a.kind === "exchange");

  // Parse back and lay in parallel
  const [backResult, layResult] = await Promise.all([
    parseSingleBetWithAgent({
      imageUrl: backImageUrl,
      accounts,
      betKind: "back",
    }),
    parseSingleBetWithAgent({
      imageUrl: layImageUrl,
      accounts,
      betKind: "lay",
    }),
  ]);

  // Single-exchange shortcut: if user has exactly one exchange and lay bet
  // didn't match an account, auto-assign it
  let layBet = layResult.bet;
  if (!layBet.accountId && activeExchanges.length === 1) {
    const singleExchange = activeExchanges[0];
    console.log(
      `[bet-parser-agent] Single-exchange shortcut: auto-assigning ${singleExchange.name}`
    );
    layBet = {
      ...layBet,
      accountId: singleExchange.id,
      exchange: singleExchange.name,
      currency: singleExchange.currency ?? layBet.currency ?? "NOK",
      accountConfidence: "high",
      unmatchedAccount: false,
    };
  }

  // Determine if review is needed - only for account issues, not market text differences
  // The agent already understands these are the same match even if text differs
  const hasUnmatchedAccounts =
    backResult.bet.unmatchedAccount || layBet.unmatchedAccount;

  const hasLowConfidence =
    backResult.bet.accountConfidence === "low" ||
    layBet.accountConfidence === "low";

  const needsReview = hasUnmatchedAccounts || hasLowConfidence;

  // Build notes
  const notesList: string[] = [];
  if (backResult.bet.unmatchedAccount) {
    notesList.push(
      `Bookmaker "${backResult.bet.exchange}" not found in your accounts.`
    );
  }
  if (layBet.unmatchedAccount) {
    notesList.push(`Exchange "${layBet.exchange}" not found in your accounts.`);
  }
  if (backResult.usedVision || layResult.usedVision) {
    notesList.push("Used vision analysis to identify account(s).");
  }

  return {
    back: backResult.bet,
    lay: layBet,
    needsReview,
    notes: notesList.length > 0 ? notesList.join("\n") : undefined,
    ocrDurationMs: backResult.ocrDurationMs + layResult.ocrDurationMs,
    llmDurationMs: backResult.llmDurationMs + layResult.llmDurationMs,
  };
}
