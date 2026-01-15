/**
 * Match linking module for automatic football match detection during AI autoparse.
 * 
 * Simplified flow:
 * 1. Take the market string from parsed bet (e.g., "Man Utd v Man City")
 * 2. Fuzzy search FootballMatch DB using trigram similarity
 * 3. LLM selects the correct match from candidates
 * 
 * The LLM handles team name variations directly (Man Utd = Manchester United).
 * No need for manual parsing or dictionaries - fuzzy search + LLM does the work.
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

/**
 * Search for candidate matches using fuzzy trigram search.
 * The search term can be the full market string - trigram will find similar team names.
 */
export async function findCandidateMatches({
  market,
  betDate,
}: {
  market: string;
  betDate?: Date | null;
}): Promise<MatchCandidate[]> {
  if (!market || market.trim().length < 3) {
    return [];
  }
  
  const fromDate = betDate ?? new Date();
  
  try {
    // Use fuzzy search with the market string directly
    // Trigram similarity will match "Man Utd" to "Manchester United"
    const matches = await searchFootballMatches({
      searchTerm: market,
      fromDate,
      limit: 15,
      similarityThreshold: 0.15, // Low threshold to cast wide net, LLM will filter
    });
    
    return matches.map(m => ({
      id: m.id,
      externalId: m.externalId,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      competition: m.competition,
      matchDate: m.matchDate,
      status: m.status,
      similarity: m.similarity,
    }));
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
 * 2. LLM picks the best match (always, even for single candidate)
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

    console.log(`[match-linking] Found ${candidates.length} candidates for "${market}"`);

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
