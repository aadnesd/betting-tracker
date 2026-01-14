/**
 * Match linking module for automatic football match detection during AI autoparse.
 * 
 * Flow:
 * 1. OCR/AI parsing extracts market, selection, and placedAt from bet screenshots
 * 2. Fuzzy search FootballMatch DB using team names from the market string
 * 3. LLM compares parsed bet with candidate matches and picks the best match
 * 
 * The LLM is good at handling team name variations (Man Utd vs Manchester United)
 * and can use the match date from the bet to disambiguate.
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
}

export interface MatchLinkResult {
  matchId: string | null;
  matchConfidence: "high" | "medium" | "low" | null;
  matchCandidates: number;
  linkedMatch?: MatchCandidate;
}

/**
 * Extract words that could be team names from a market string.
 * Returns an array of search terms to query the FootballMatch table.
 * 
 * Examples:
 * - "Elche v Real Madrid" → ["Elche", "Real Madrid"]
 * - "Premier League - Man Utd v Man City" → ["Man Utd", "Man City"]
 */
export function extractSearchTermsFromMarket(market: string): string[] {
  const terms: string[] = [];
  
  // Try to split by match separators
  const matchSeparators = [" v ", " vs ", " - "];
  
  for (const sep of matchSeparators) {
    const sepIndex = market.indexOf(sep);
    if (sepIndex !== -1) {
      // Take parts before and after the separator
      let beforePart = market.slice(0, sepIndex).trim();
      let afterPart = market.slice(sepIndex + sep.length).trim();
      
      // If beforePart contains " - " (competition prefix), take the last part
      const lastDash = beforePart.lastIndexOf(" - ");
      if (lastDash !== -1 && sep !== " - ") {
        beforePart = beforePart.slice(lastDash + 3).trim();
      }
      
      // Filter out market type keywords
      const marketKeywords = ["match odds", "over", "under", "btts", "goals", "handicap"];
      if (!marketKeywords.some(kw => beforePart.toLowerCase().includes(kw))) {
        terms.push(beforePart);
      }
      if (!marketKeywords.some(kw => afterPart.toLowerCase().includes(kw))) {
        terms.push(afterPart);
      }
      
      if (terms.length > 0) break;
    }
  }
  
  return terms.filter(t => t.length >= 3);
}

/**
 * Search for candidate matches in the FootballMatch table.
 * Uses LIKE search on team names.
 */
export async function findCandidateMatches({
  market,
  betDate,
}: {
  market: string;
  betDate?: Date | null;
}): Promise<MatchCandidate[]> {
  const searchTerms = extractSearchTermsFromMarket(market);
  
  if (searchTerms.length === 0) {
    return [];
  }
  
  const candidates: MatchCandidate[] = [];
  const seenIds = new Set<string>();
  
  // Search for each term, looking forward from bet date
  const fromDate = betDate ?? new Date();
  
  for (const term of searchTerms) {
    try {
      const matches = await searchFootballMatches({
        searchTerm: term,
        fromDate,
        limit: 10,
      });
      
      for (const match of matches) {
        if (!seenIds.has(match.id)) {
          seenIds.add(match.id);
          candidates.push({
            id: match.id,
            externalId: match.externalId,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            competition: match.competition,
            matchDate: match.matchDate,
            status: match.status,
          });
        }
      }
    } catch (error) {
      console.warn(`[match-linking] Search failed for "${term}":`, error);
    }
  }
  
  // Sort by match date (soonest first)
  candidates.sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
  
  return candidates.slice(0, 10); // Limit to 10 candidates for LLM
}

/**
 * Use LLM to select the correct match from candidates.
 * The LLM compares parsed bet data with database matches including dates.
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
      return `${i + 1}. ${c.homeTeam} vs ${c.awayTeam} | ${c.competition || "Unknown"} | ${dateStr} ${timeStr} UTC | Status: ${c.status}`;
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
1. The team names in the market should match the fixture (e.g., "Elche v Real Madrid" matches "Elche CF vs Real Madrid")
2. The bet date should be on or before the match date
3. Team name variations are OK (Man Utd = Manchester United, Real = Real Madrid, etc.)
4. Return 0 if no match is clearly correct

Respond with ONLY a number (1-${candidates.length} for a match, or 0 for no match).`;

  try {
    const { text } = await generateText({
      model: myProvider.languageModel("chat-model-fast"),
      messages: [{ role: "user", content: prompt }],
    });

    const matchIndex = parseInt(text.trim(), 10);

    if (Number.isNaN(matchIndex) || matchIndex < 0 || matchIndex > candidates.length) {
      console.warn(`[match-linking] LLM returned invalid response: "${text}"`);
      return { matchIndex: 0, confidence: "low" };
    }

    // Determine confidence based on number of candidates
    let confidence: "high" | "medium" | "low";
    if (matchIndex === 0) {
      confidence = "low";
    } else if (candidates.length === 1) {
      confidence = "high";
    } else {
      confidence = "medium";
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
 * 1. Extract team names from market string
 * 2. Search FootballMatch table for candidates
 * 3. If single match → auto-link with high confidence
 * 4. If multiple matches → LLM picks the best match using dates
 * 5. If no matches → return null
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

    // Find candidate matches from DB
    const candidates = await findCandidateMatches({
      market,
      betDate: parsedBetDate,
    });

    // Case 1: No matches found
    if (candidates.length === 0) {
      return {
        matchId: null,
        matchConfidence: null,
        matchCandidates: 0,
      };
    }

    // Case 2: Single match → auto-link with high confidence
    if (candidates.length === 1) {
      return {
        matchId: candidates[0].id,
        matchConfidence: "high",
        matchCandidates: 1,
        linkedMatch: candidates[0],
      };
    }

    // Case 3: Multiple matches → LLM picks the best one
    const { matchIndex, confidence } = await selectMatchWithLLM({
      market,
      selection,
      betDate,
      candidates,
    });

    if (matchIndex === 0) {
      return {
        matchId: null,
        matchConfidence: "low",
        matchCandidates: candidates.length,
      };
    }

    const selectedMatch = candidates[matchIndex - 1];
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
