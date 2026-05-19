import { gateway } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";
import { Output, stepCountIs, ToolLoopAgent } from "ai";
import { z } from "zod";
import type { NormalizedSelection } from "@/lib/db/schema";

export type UnlinkedSettlementLookupStatus =
  | "finished"
  | "not_finished"
  | "not_found"
  | "ambiguous"
  | "not_configured"
  | "error";

export type UnlinkedSettlementLookupResult = {
  status: UnlinkedSettlementLookupStatus;
  confidence: "high" | "medium" | "low";
  reason: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  normalizedSelection?: NormalizedSelection | null;
  sourceUrls: string[];
};

const DEFAULT_GATEWAY_MODEL = "openai/gpt-5.4-mini";
const OPENAI_GATEWAY_MODEL_PREFIX = "openai/";
const MARKET_TEAM_SPLIT_PATTERN = /\s+(?:v|vs|vs\.|-|\u2013|@)\s+/i;

const lookupOutputSchema = z.object({
  status: z.enum(["finished", "not_finished", "not_found", "ambiguous"]),
  confidence: z.enum(["high", "medium", "low"]),
  homeTeam: z.string().nullable(),
  awayTeam: z.string().nullable(),
  homeScore: z.number().nullable(),
  awayScore: z.number().nullable(),
  normalizedSelection: z.enum(["HOME_TEAM", "AWAY_TEAM", "DRAW"]).nullable(),
  reason: z.string(),
  sourceUrls: z.array(z.string()),
});

function splitMarketTeams(market: string) {
  const parts = market
    .split(MARKET_TEAM_SPLIT_PATTERN)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);

  return parts.length >= 2 ? parts.slice(0, 2) : [];
}

function buildPrompt({
  market,
  selection,
  placedAt,
}: {
  market: string;
  selection: string;
  placedAt?: Date | null;
}) {
  const teams = splitMarketTeams(market);
  const teamHint =
    teams.length === 2
      ? `The market appears to name these teams: ${teams[0]} and ${teams[1]}.`
      : "The market may contain team names, but they were not confidently split.";
  const placedHint = placedAt
    ? `The bet was placed at ${placedAt.toISOString()}. Prefer a match played after this time and near this date.`
    : "The bet placement time is unknown.";

  return `Find the final score for this sports bet using web search.

Market: "${market}"
Selection: "${selection}"
${teamHint}
${placedHint}

Return JSON only with this shape:
{
  "status": "finished" | "not_finished" | "not_found" | "ambiguous",
  "confidence": "high" | "medium" | "low",
  "homeTeam": string | null,
  "awayTeam": string | null,
  "homeScore": number | null,
  "awayScore": number | null,
  "normalizedSelection": "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null,
  "reason": string,
  "sourceUrls": string[]
}

Rules:
- Only use status "finished" when a final score is found from reliable search results.
- Use "not_finished" for scheduled, postponed, abandoned, cancelled, or in-progress matches.
- Use "ambiguous" if multiple plausible matches fit the market/date.
- Set normalizedSelection for match-winner selections: selected home team = HOME_TEAM, selected away team = AWAY_TEAM, draw/tie = DRAW.
- If the selection is not a match-winner market, set normalizedSelection to null; the settlement code can still resolve totals, BTTS, and correct score markets from the score.
- Keep the reason concise and include the score/date evidence.`;
}

function getSourceUrls(sources: unknown) {
  if (!Array.isArray(sources)) {
    return [];
  }

  return sources.flatMap((source) => {
    if (!source || typeof source !== "object") {
      return [];
    }
    const url = (source as { url?: unknown }).url;
    return typeof url === "string" ? [url] : [];
  });
}

export async function resolveUnlinkedMatchedBetResult({
  market,
  selection,
  placedAt,
}: {
  market: string;
  selection: string;
  placedAt?: Date | null;
}): Promise<UnlinkedSettlementLookupResult> {
  if (process.env.UNLINKED_SETTLEMENT_SEARCH_MODE === "disabled") {
    return {
      status: "not_configured",
      confidence: "low",
      reason: "Unlinked settlement search is disabled.",
      sourceUrls: [],
    };
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return {
      status: "not_configured",
      confidence: "low",
      reason: "AI_GATEWAY_API_KEY is not configured for web result lookup.",
      sourceUrls: [],
    };
  }

  try {
    const model =
      process.env.UNLINKED_SETTLEMENT_SEARCH_MODEL || DEFAULT_GATEWAY_MODEL;
    const tools = model.startsWith(OPENAI_GATEWAY_MODEL_PREFIX)
      ? {
          web_search: openai.tools.webSearch({ searchContextSize: "medium" }),
        }
      : undefined;

    const agent = new ToolLoopAgent({
      model: gateway.languageModel(model),
      output: Output.object({ schema: lookupOutputSchema }),
      stopWhen: tools ? stepCountIs(2) : undefined,
      tools,
    });

    const { output, sources } = await agent.generate({
      prompt: buildPrompt({ market, selection, placedAt }),
    });

    if (!output) {
      return {
        status: "error",
        confidence: "low",
        reason: "Search response did not include structured output.",
        sourceUrls: [],
      };
    }

    const sourceUrls =
      output.sourceUrls.length > 0 ? output.sourceUrls : getSourceUrls(sources);

    return {
      status: output.status,
      confidence: output.confidence,
      reason: output.reason,
      homeTeam: output.homeTeam ?? undefined,
      awayTeam: output.awayTeam ?? undefined,
      homeScore: output.homeScore ?? undefined,
      awayScore: output.awayScore ?? undefined,
      normalizedSelection: output.normalizedSelection,
      sourceUrls,
    };
  } catch (error) {
    return {
      status: "error",
      confidence: "low",
      reason:
        error instanceof Error
          ? `AI Gateway result lookup failed: ${error.message}`
          : "AI Gateway result lookup failed.",
      sourceUrls: [],
    };
  }
}
