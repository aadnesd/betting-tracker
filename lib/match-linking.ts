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
 * Use LLM to select the correct match from candidates.
 * The LLM understands team name variations and can match based on context.
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
}): Promise<{ matchIndex: number; confidence: "high" | "medium" | "low" }> {
  const candidateList = candidates
    .map((c, i) => {
      const dateStr = c.matchDate.toISOString().split("T")[0];
      const timeStr = c.matchDate.toISOString().split("T")[1].slice(0, 5);
      const simScore = c.similarity ? ` (sim: ${(c.similarity * 100).toFixed(0)}%)` : "";
      return `${i + 1}. ${c.homeTeam} vs ${c.awayTeam} | ${c.competition || "Unknown"} | ${dateStr} ${timeStr} UTC${simScore}`;
    })
    .join("\n");

  const prompt = `You are matching a betting slip to a football match in our database.

PARSED BET FROM SCREENSHOT:
- Market: "${market}"
- Selection: "${selection}"
- Bet Date: "${betDate ?? "unknown"}"

CANDIDATE MATCHES FROM DATABASE:
${candidateList}

TASK: Which match (1-${candidates.length}) does this bet belong to?

RULES:
1. Match team names even with variations (Man Utd = Manchester United, Real = Real Madrid, etc.)
2. The bet date should be on or before the match date
3. Return 0 if no match is clearly correct

Respond with ONLY a single number (1-${candidates.length} for a match, or 0 for no match).`;

  try {
    const { text } = await generateText({
      model: myProvider.languageModel("chat-model-fast"),
      messages: [{ role: "user", content: prompt }],
    });

    const matchIndex = Number.parseInt(text.trim(), 10);

    if (Number.isNaN(matchIndex) || matchIndex < 0 || matchIndex > candidates.length) {
      console.warn(`[match-linking] LLM returned invalid response: "${text}"`);
      return { matchIndex: 0, confidence: "low" };
    }

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

    return { matchIndex, confidence };
  } catch (error) {
    console.error("[match-linking] LLM selection failed:", error);
    return { matchIndex: 0, confidence: "low" };
  }
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

      return {
        matchId: candidate.id,
        matchConfidence: "high",
        matchCandidates: 1,
        linkedMatch: candidate,
      };
    }

    // Always use LLM to select the match
    const { matchIndex, confidence } = await selectMatchWithLLM({
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
      };
    }

    const selectedMatch = candidates[matchIndex - 1];
    console.log(
      `[match-linking] LLM selected: ${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam} (confidence: ${confidence})`
    );
    
    return {
      matchId: selectedMatch.id,
      matchConfidence: confidence,
      matchCandidates: candidates.length,
      linkedMatch: selectedMatch,
    };
  } catch (error) {
    console.error("[match-linking] Failed to link bet to match:", error);
    return {
      matchId: null,
      matchConfidence: null,
      matchCandidates: 0,
    };
  }
}
