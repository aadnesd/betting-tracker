import { gateway } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";
import type { ToolSet } from "ai";
import { Output, stepCountIs, ToolLoopAgent } from "ai";
import { z } from "zod";
import type { NormalizedSelection } from "@/lib/db/schema";

export type UnlinkedSettlementLookupStatus =
  | "finished"
  | "not_finished"
  | "not_found"
  | "ambiguous"
  | "not_configured"
  | "transient_error"
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
// Backup models tried in order if the primary model fails or is rate-limited.
// Lets the gateway settle on the first pass instead of flagging the bet for
// review when the primary model hits a (per-model) free-tier rate limit.
const DEFAULT_FALLBACK_MODELS = [
  "openai/gpt-5.1-thinking",
  "openai/gpt-5.3-codex",
  "openai/gpt-5.1-codex",
];
const OPENAI_GATEWAY_MODEL_PREFIX = "openai/";
const MARKET_TEAM_SPLIT_PATTERN = /\s+(?:v|vs|vs\.|-|\u2013|@)\s+/i;

export function getFallbackModels(primaryModel: string): string[] {
  const configured = process.env.UNLINKED_SETTLEMENT_SEARCH_FALLBACK_MODELS;
  const models = configured
    ? configured
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : DEFAULT_FALLBACK_MODELS;

  // Never list the primary model as its own fallback.
  return models.filter((entry) => entry !== primaryModel);
}

// Messages/codes that indicate a temporary failure: the lookup could likely
// succeed on a later run, so the bet should stay eligible rather than being
// flagged for manual review.
const TRANSIENT_ERROR_PATTERN =
  /rate.?limit|rate.?limited|free tier|too many requests|quota|overloaded|temporar|timed? ?out|timeout|econn|enotfound|etimedout|socket hang up|network|fetch failed|service unavailable|gateway timeout|\b(429|500|502|503|504)\b/i;

function getErrorStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return;
  }
  const candidate = error as { statusCode?: unknown; status?: unknown };
  const raw = candidate.statusCode ?? candidate.status;
  return typeof raw === "number" ? raw : undefined;
}

export function isTransientLookupError(error: unknown): boolean {
  const statusCode = getErrorStatusCode(error);
  if (statusCode !== undefined) {
    if (statusCode === 429 || statusCode >= 500) {
      return true;
    }
    // An explicit non-transient 4xx (e.g. 400/401/403) is a hard failure.
    if (statusCode >= 400 && statusCode < 500) {
      return false;
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return TRANSIENT_ERROR_PATTERN.test(message);
}

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
    const tools: ToolSet | undefined = model.startsWith(
      OPENAI_GATEWAY_MODEL_PREFIX
    )
      ? ({
          web_search: openai.tools.webSearch({ searchContextSize: "medium" }),
        } as unknown as ToolSet)
      : undefined;

    const agent = new ToolLoopAgent({
      model: gateway.languageModel(model),
      output: Output.object({ schema: lookupOutputSchema }),
      stopWhen: tools ? stepCountIs(2) : undefined,
      tools,
      providerOptions: {
        gateway: { models: getFallbackModels(model) },
      },
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
    const message =
      error instanceof Error
        ? `AI Gateway result lookup failed: ${error.message}`
        : "AI Gateway result lookup failed.";

    return {
      status: isTransientLookupError(error) ? "transient_error" : "error",
      confidence: "low",
      reason: message,
      sourceUrls: [],
    };
  }
}
