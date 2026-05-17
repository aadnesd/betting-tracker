import { gateway } from "@ai-sdk/gateway";
import { generateText } from "ai";
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

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_GATEWAY_MODEL = "perplexity/sonar";
const MARKET_TEAM_SPLIT_PATTERN = /\s+(?:v|vs|vs\.|-|\u2013|@)\s+/i;
const JSON_OBJECT_PATTERN = /\{[\s\S]*\}/;

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

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string") {
    return direct;
  }

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }
      const text = (contentItem as { text?: unknown }).text;
      if (typeof text === "string") {
        chunks.push(text);
      }
    }
  }

  return chunks.join("\n");
}

function parseLookupJson(text: string): UnlinkedSettlementLookupResult {
  const jsonMatch = text.match(JSON_OBJECT_PATTERN);
  if (!jsonMatch) {
    return {
      status: "error",
      confidence: "low",
      reason: "Search response did not include JSON.",
      sourceUrls: [],
    };
  }

  try {
    const parsed = JSON.parse(
      jsonMatch[0]
    ) as Partial<UnlinkedSettlementLookupResult>;
    const statuses: UnlinkedSettlementLookupStatus[] = [
      "finished",
      "not_finished",
      "not_found",
      "ambiguous",
      "not_configured",
      "error",
    ];
    const status = statuses.includes(
      parsed.status as UnlinkedSettlementLookupStatus
    )
      ? (parsed.status as UnlinkedSettlementLookupStatus)
      : "error";
    const confidence =
      parsed.confidence === "high" || parsed.confidence === "medium"
        ? parsed.confidence
        : "low";
    const normalizedSelection =
      parsed.normalizedSelection === "HOME_TEAM" ||
      parsed.normalizedSelection === "AWAY_TEAM" ||
      parsed.normalizedSelection === "DRAW"
        ? parsed.normalizedSelection
        : null;
    const sourceUrls = Array.isArray(parsed.sourceUrls)
      ? parsed.sourceUrls.filter(
          (url): url is string => typeof url === "string"
        )
      : [];

    return {
      status,
      confidence,
      reason:
        typeof parsed.reason === "string"
          ? parsed.reason
          : "No explanation returned.",
      homeTeam:
        typeof parsed.homeTeam === "string" ? parsed.homeTeam : undefined,
      awayTeam:
        typeof parsed.awayTeam === "string" ? parsed.awayTeam : undefined,
      homeScore:
        typeof parsed.homeScore === "number" ? parsed.homeScore : undefined,
      awayScore:
        typeof parsed.awayScore === "number" ? parsed.awayScore : undefined,
      normalizedSelection,
      sourceUrls,
    };
  } catch {
    return {
      status: "error",
      confidence: "low",
      reason: "Search response JSON could not be parsed.",
      sourceUrls: [],
    };
  }
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

  if (process.env.AI_GATEWAY_API_KEY) {
    try {
      const { text } = await generateText({
        model: gateway.languageModel(
          process.env.UNLINKED_SETTLEMENT_SEARCH_MODEL || DEFAULT_GATEWAY_MODEL
        ),
        prompt: buildPrompt({ market, selection, placedAt }),
      });

      return parseLookupJson(text);
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      status: "not_configured",
      confidence: "low",
      reason:
        "AI_GATEWAY_API_KEY or OPENAI_API_KEY is not configured for web result lookup.",
      sourceUrls: [],
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.UNLINKED_SETTLEMENT_SEARCH_MODEL || DEFAULT_MODEL,
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        input: buildPrompt({ market, selection, placedAt }),
      }),
    });

    if (!response.ok) {
      return {
        status: "error",
        confidence: "low",
        reason: `OpenAI web search failed with status ${response.status}.`,
        sourceUrls: [],
      };
    }

    const payload = await response.json();
    return parseLookupJson(extractResponseText(payload));
  } catch (error) {
    return {
      status: "error",
      confidence: "low",
      reason:
        error instanceof Error
          ? `OpenAI web search failed: ${error.message}`
          : "OpenAI web search failed.",
      sourceUrls: [],
    };
  }
}
