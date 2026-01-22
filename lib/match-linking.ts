/**
 * Match linking module for automatic football match detection during AI autoparse.
 *
 * Flow:
 * 1. Normalize common team name abbreviations (Man Utd → Manchester United, etc.)
 * 2. Fuzzy search FootballMatch DB using trigram similarity across market/selection
 * 3. Auto-link if a single candidate is found, otherwise use LLM disambiguation
 */

import { generateText } from "ai";
import { myProvider } from "@/lib/ai/providers";
import { searchFootballMatches } from "@/lib/db/queries";

import type { NormalizedSelection } from "@/lib/db/schema";

export interface MatchCandidate {
  id: string;
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  competition: string | null;
  matchDate: Date;
  status: string;
  similarity?: number;
}

export interface MatchLinkResult {
  matchId: string | null;
  matchConfidence: "high" | "medium" | "low" | null;
  matchCandidates: number;
  linkedMatch?: MatchCandidate;
  /** Normalized selection for Match Odds: HOME_TEAM, AWAY_TEAM, DRAW */
  normalizedSelection?: NormalizedSelection | null;
}

const TEAM_NAME_NORMALIZATION: Record<string, string> = {
  "man utd": "Manchester United",
  "man united": "Manchester United",
  "man city": "Manchester City",
  spurs: "Tottenham Hotspur",
  arsenal: "Arsenal FC",
  chelsea: "Chelsea FC",
  liverpool: "Liverpool FC",
  newcastle: "Newcastle United",
  "west ham": "West Ham United",
  wolves: "Wolverhampton Wanderers",
  brighton: "Brighton & Hove Albion",
  villa: "Aston Villa",
  palace: "Crystal Palace",
  forest: "Nottingham Forest",
  bournemouth: "AFC Bournemouth",
  fulham: "Fulham FC",
  brentford: "Brentford FC",
  everton: "Everton FC",
  leeds: "Leeds United",
  leicester: "Leicester City",
  southampton: "Southampton FC",
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTeamNames(input: string) {
  let normalized = input;

  for (const [key, value] of Object.entries(TEAM_NAME_NORMALIZATION)) {
    const pattern = new RegExp(`\\b${escapeRegExp(key)}\\b`, "gi");
    normalized = normalized.replace(pattern, value);
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function splitMarketTeams(market: string) {
  const parts = market
    .split(/\s+(?:v|vs|vs\.|-|–|@)\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 2);

  return parts.length >= 2 ? parts : [];
}

function buildSearchTerms({
  market,
  selection,
}: {
  market?: string;
  selection?: string;
}) {
  const terms = new Set<string>();

  if (market) {
    const normalizedMarket = normalizeTeamNames(market);
    if (normalizedMarket.length >= 3) {
      terms.add(normalizedMarket);
    }
    splitMarketTeams(normalizedMarket).forEach((team) => terms.add(team));
  }

  if (selection) {
    const normalizedSelection = normalizeTeamNames(selection);
    if (normalizedSelection.length >= 3) {
      terms.add(normalizedSelection);
    }
  }

  return Array.from(terms);
}

/**
 * Search for candidate matches using fuzzy trigram search.
 * Tries the normalized market, split team names, and selection to widen matches.
 */
export async function findCandidateMatches({
  market,
  selection,
  betDate,
}: {
  market: string;
  selection?: string;
  betDate?: Date | null;
}): Promise<MatchCandidate[]> {
  const searchTerms = buildSearchTerms({ market, selection });

  if (searchTerms.length === 0) {
    return [];
  }

  const fromDate = betDate ?? new Date();

  try {
    const results = await Promise.all(
      searchTerms.map((term) =>
        searchFootballMatches({
          searchTerm: term,
          fromDate,
          limit: 10,
          similarityThreshold: 0.15, // Low threshold to cast wide net, LLM will filter
        })
      )
    );

    const candidateMap = new Map<string, MatchCandidate>();

    for (const matches of results) {
      for (const match of matches) {
        const existing = candidateMap.get(match.id);
        const similarity = match.similarity ?? 0;

        if (existing) {
          candidateMap.set(match.id, {
            ...existing,
            similarity: Math.max(existing.similarity ?? 0, similarity),
          });
        } else {
          candidateMap.set(match.id, {
            id: match.id,
            externalId: match.externalId,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            competition: match.competition,
            matchDate: match.matchDate,
            status: match.status,
            similarity: match.similarity,
          });
        }
      }
    }

    return Array.from(candidateMap.values())
      .sort((a, b) => {
        const simDiff = (b.similarity ?? 0) - (a.similarity ?? 0);
        if (simDiff !== 0) {
          return simDiff;
        }
        return a.matchDate.getTime() - b.matchDate.getTime();
      })
      .slice(0, 15);
  } catch (error) {
    console.warn(`[match-linking] Search failed for "${market}":`, error);
    return [];
  }
}

/**
 * Use LLM to select the correct match from candidates and normalize the selection.
 * The LLM understands team name variations and can match based on context.
 * Also determines if the selection is HOME_TEAM, AWAY_TEAM, or DRAW for Match Odds markets.
 */
export async function selectMatchWithLLM({
  market,
  selection,
  betDate,
  candidates,
}: {
  market: string;
  selection: string;
  betDate?: string | null;
  candidates: MatchCandidate[];
}): Promise<{
  matchIndex: number;
  confidence: "high" | "medium" | "low";
  normalizedSelection: NormalizedSelection | null;
}> {
  const candidateList = candidates
    .map((c, i) => {
      const dateStr = c.matchDate.toISOString().split("T")[0];
      const timeStr = c.matchDate.toISOString().split("T")[1].slice(0, 5);
      const simScore = c.similarity ? ` (sim: ${(c.similarity * 100).toFixed(0)}%)` : "";
      return `${i + 1}. ${c.homeTeam} vs ${c.awayTeam} | ${c.competition || "Unknown"} | ${dateStr} ${timeStr} UTC${simScore}`;
    })
    .join("\n");

  console.log(`[match-linking] LLM prompt candidates:\n${candidateList}`);

  const prompt = `You are matching a betting slip to a football match in our database.

PARSED BET FROM SCREENSHOT:
- Market: "${market}"
- Selection: "${selection}"
- Bet Date: "${betDate ?? "unknown"}"

CANDIDATE MATCHES FROM DATABASE:
${candidateList}

TASK: 
1. Which match (1-${candidates.length}) does this bet belong to? Return 0 if no match is clearly correct.
2. For Match Odds (1X2) bets, determine if the selection is HOME_TEAM, AWAY_TEAM, or DRAW.

RULES:
1. Match team names even with variations (Man Utd = Manchester United, Real = Real Madrid, etc.)
2. The bet date should be on or before the match date
3. For selection normalization:
   - If the selection mentions the HOME team (listed first) → HOME_TEAM
   - If the selection mentions the AWAY team (listed second) → AWAY_TEAM
   - If the selection is "Draw", "X", "Tie", or similar → DRAW
   - If it's not a 1X2/Match Odds bet or you can't determine → null

Respond with JSON only: {"matchIndex": N, "normalizedSelection": "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null}`;

  try {
    const { text } = await generateText({
      model: myProvider.languageModel("chat-model-fast"),
      messages: [{ role: "user", content: prompt }],
    });

    // Parse JSON response
    let parsed: { matchIndex: number; normalizedSelection: NormalizedSelection | null };
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: try parsing as a simple number (backwards compatibility)
        const matchIndex = Number.parseInt(text.trim(), 10);
        parsed = { matchIndex: Number.isNaN(matchIndex) ? 0 : matchIndex, normalizedSelection: null };
      }
    } catch {
      console.warn(`[match-linking] Failed to parse LLM JSON response: "${text}"`);
      const matchIndex = Number.parseInt(text.trim(), 10);
      parsed = { matchIndex: Number.isNaN(matchIndex) ? 0 : matchIndex, normalizedSelection: null };
    }

    const { matchIndex, normalizedSelection } = parsed;

    if (matchIndex < 0 || matchIndex > candidates.length) {
      console.warn(`[match-linking] LLM returned invalid match index: ${matchIndex}`);
      return { matchIndex: 0, confidence: "low", normalizedSelection: null };
    }

    // Validate normalizedSelection
    const validSelections: (NormalizedSelection | null)[] = ["HOME_TEAM", "AWAY_TEAM", "DRAW", null];
    const validatedSelection = validSelections.includes(normalizedSelection) ? normalizedSelection : null;

    // Confidence based on similarity score if available
    let confidence: "high" | "medium" | "low";
    if (matchIndex === 0) {
      confidence = "low";
    } else {
      const selectedMatch = candidates[matchIndex - 1];
      if (selectedMatch.similarity && selectedMatch.similarity > 0.5) {
        confidence = "high";
      } else if (selectedMatch.similarity && selectedMatch.similarity > 0.3) {
        confidence = "medium";
      } else {
        confidence = "medium"; // LLM selected but low similarity - trust LLM
      }
    }

    return { matchIndex, confidence, normalizedSelection: validatedSelection };
  } catch (error) {
    console.error("[match-linking] LLM selection failed:", error);
    return { matchIndex: 0, confidence: "low", normalizedSelection: null };
  }
}

/**
 * Determine normalized selection for a single candidate without LLM call.
 * Used when we auto-link to a single candidate.
 */
function determineNormalizedSelection(
  selection: string,
  match: MatchCandidate
): NormalizedSelection | null {
  const normalizedSelection = selection.toLowerCase().trim();
  const homeTeam = match.homeTeam.toLowerCase();
  const awayTeam = match.awayTeam.toLowerCase();

  // Check for draw
  if (
    normalizedSelection === "draw" ||
    normalizedSelection === "x" ||
    normalizedSelection === "tie" ||
    normalizedSelection.includes("draw")
  ) {
    return "DRAW";
  }

  // Check if selection mentions home team
  const homeWords = homeTeam.split(/\s+/);
  const awayWords = awayTeam.split(/\s+/);

  // Check for significant words from team names
  for (const word of homeWords) {
    if (word.length >= 4 && normalizedSelection.includes(word)) {
      return "HOME_TEAM";
    }
  }

  for (const word of awayWords) {
    if (word.length >= 4 && normalizedSelection.includes(word)) {
      return "AWAY_TEAM";
    }
  }

  // Couldn't determine - will need LLM for this
  return null;
}

/**
 * Main entry point: link a parsed bet to a football match.
 * 
 * 1. Fuzzy search FootballMatch table for candidates
 * 2. Auto-link if a single candidate is found
 * 3. LLM picks the best match when multiple candidates remain
 * 3. Return match ID and confidence
 */
export async function linkBetToMatch({
  market,
  selection,
  betDate,
}: {
  market: string;
  selection: string;
  betDate?: string | null;
}): Promise<MatchLinkResult> {
  try {
    // Parse bet date if provided
    const parsedBetDate = betDate ? new Date(betDate) : null;

    // Find candidate matches from DB using fuzzy search
    const candidates = await findCandidateMatches({
      market,
      selection,
      betDate: parsedBetDate,
    });

    // No matches found
    if (candidates.length === 0) {
      console.log(`[match-linking] No candidates found for "${market}"`);
      return {
        matchId: null,
        matchConfidence: null,
        matchCandidates: 0,
        normalizedSelection: null,
      };
    }

    console.log(
      `[match-linking] Found ${candidates.length} candidates for "${market}"`
    );

    if (candidates.length === 1) {
      const candidate = candidates[0];
      console.log(
        `[match-linking] Auto-linked single candidate: ${candidate.homeTeam} vs ${candidate.awayTeam}`
      );

      // Try to determine normalized selection without LLM
      const normalizedSel = determineNormalizedSelection(selection, candidate);

      return {
        matchId: candidate.id,
        matchConfidence: "high",
        matchCandidates: 1,
        linkedMatch: candidate,
        normalizedSelection: normalizedSel,
      };
    }

    // Always use LLM to select the match
    const { matchIndex, confidence, normalizedSelection } = await selectMatchWithLLM({
      market,
      selection,
      betDate,
      candidates,
    });

    if (matchIndex === 0) {
      console.log(`[match-linking] LLM found no confident match`);
      return {
        matchId: null,
        matchConfidence: "low",
        matchCandidates: candidates.length,
        normalizedSelection: null,
      };
    }

    const selectedMatch = candidates[matchIndex - 1];
    console.log(
      `[match-linking] LLM selected: ${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam} (confidence: ${confidence}, normalizedSelection: ${normalizedSelection})`
    );
    
    return {
      matchId: selectedMatch.id,
      matchConfidence: confidence,
      matchCandidates: candidates.length,
      linkedMatch: selectedMatch,
      normalizedSelection,
    };
  } catch (error) {
    console.error("[match-linking] Failed to link bet to match:", error);
    return {
      matchId: null,
      matchConfidence: null,
      matchCandidates: 0,
      normalizedSelection: null,
    };
  }
}
