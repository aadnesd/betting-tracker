/**
 * End-to-end test for automatic football match linking during AI autoparse.
 *
 * Tests the simplified approach (mirrors lib/match-linking.ts):
 * 1. Fuzzy search using pg_trgm trigram similarity
 * 2. LLM always selects from candidates (no auto-link)
 * 3. No manual market parsing - fuzzy search handles team name variations
 *
 * This script replicates the logic locally to bypass server-only guards.
 */

import { gateway } from "@ai-sdk/gateway";
import { generateText } from "ai";
import { config } from "dotenv";
import { and, asc, gte, type SQL, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: ".env.local" });

// Direct DB connection (bypassing server-only guard)
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

// Import schema directly
import { footballMatch } from "../lib/db/schema";

// Types matching lib/match-linking.ts
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
 * Mirrors searchFootballMatches from lib/db/queries.ts
 * Uses trigram similarity for fuzzy matching.
 */
async function searchFootballMatches({
  searchTerm,
  fromDate,
  limit = 20,
  similarityThreshold = 0.2,
}: {
  searchTerm: string;
  fromDate?: Date;
  limit?: number;
  /** Minimum similarity score (0-1). Lower = more fuzzy. Default 0.2 */
  similarityThreshold?: number;
}) {
  const term = searchTerm.trim();

  // Use trigram similarity for fuzzy matching
  // GREATEST picks the higher similarity between home and away team
  const conditions: SQL<unknown>[] = [
    sql`(
      similarity(${footballMatch.homeTeam}, ${term}) > ${similarityThreshold}
      OR similarity(${footballMatch.awayTeam}, ${term}) > ${similarityThreshold}
    )`,
  ];

  if (fromDate) {
    conditions.push(gte(footballMatch.matchDate, fromDate));
  }

  const rows = await db
    .select({
      id: footballMatch.id,
      externalId: footballMatch.externalId,
      homeTeam: footballMatch.homeTeam,
      awayTeam: footballMatch.awayTeam,
      competition: footballMatch.competition,
      competitionCode: footballMatch.competitionCode,
      matchDate: footballMatch.matchDate,
      status: footballMatch.status,
      homeScore: footballMatch.homeScore,
      awayScore: footballMatch.awayScore,
      lastSyncedAt: footballMatch.lastSyncedAt,
      // Include similarity score for ordering
      similarity: sql<number>`GREATEST(
        similarity(${footballMatch.homeTeam}, ${term}),
        similarity(${footballMatch.awayTeam}, ${term})
      )`.as("similarity"),
    })
    .from(footballMatch)
    .where(and(...conditions))
    // Order by similarity (best matches first), then by date
    .orderBy(
      sql`GREATEST(similarity(${footballMatch.homeTeam}, ${term}), similarity(${footballMatch.awayTeam}, ${term})) DESC`,
      asc(footballMatch.matchDate)
    )
    .limit(limit);

  return rows;
}

/**
 * Mirrors findCandidateMatches from lib/match-linking.ts
 * Search for candidate matches using fuzzy trigram search.
 */
async function findCandidateMatches({
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

    return matches.map((m) => ({
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
 * Mirrors selectMatchWithLLM from lib/match-linking.ts
 * Use LLM to select the correct match from candidates.
 */
async function selectMatchWithLLM({
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
      const simScore = c.similarity
        ? ` (sim: ${(c.similarity * 100).toFixed(0)}%)`
        : "";
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

  console.log("\n  📤 LLM Prompt:");
  console.log("  ---");
  console.log(
    prompt
      .split("\n")
      .map((l) => `    ${l}`)
      .join("\n")
  );
  console.log("  ---\n");

  try {
    const { text } = await generateText({
      model: gateway.languageModel("google/gemini-2.0-flash"),
      messages: [{ role: "user", content: prompt }],
    });

    console.log(`  📥 LLM Response: "${text.trim()}"`);

    const matchIndex = Number.parseInt(text.trim(), 10);

    if (
      Number.isNaN(matchIndex) ||
      matchIndex < 0 ||
      matchIndex > candidates.length
    ) {
      console.warn(`  ⚠️ LLM returned invalid response: "${text}"`);
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
 * Mirrors linkBetToMatch from lib/match-linking.ts
 * Main entry point: link a parsed bet to a football match.
 */
async function linkBetToMatch({
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

    console.log(
      `[match-linking] Found ${candidates.length} candidates for "${market}"`
    );

    // Always use LLM to select the match
    const { matchIndex, confidence } = await selectMatchWithLLM({
      market,
      selection,
      betDate,
      candidates,
    });

    if (matchIndex === 0) {
      console.log("[match-linking] LLM found no confident match");
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

async function main() {
  console.log("=== Testing Fuzzy Match Linking (pg_trgm + LLM) ===\n");

  // Step 1: Test fuzzy search directly
  console.log("🔍 Step 1: Testing trigram fuzzy search...\n");

  const testSearches = [
    "Man Utd v Man City", // Full market string
    "Manchester United", // Full name
    "Man United", // Common variation
    "Manchster United", // Typo!
  ];

  const fromDate = new Date("2026-01-14");

  for (const searchTerm of testSearches) {
    console.log(`  Search: "${searchTerm}"`);
    const results = await searchFootballMatches({
      searchTerm,
      fromDate,
      limit: 3,
      similarityThreshold: 0.1,
    });

    if (results.length === 0) {
      console.log("    ❌ No results");
    } else {
      for (const r of results) {
        const sim = r.similarity ? `(${(r.similarity * 100).toFixed(0)}%)` : "";
        console.log(`    ✅ ${r.homeTeam} vs ${r.awayTeam} ${sim}`);
      }
    }
    console.log("");
  }

  // Step 2: Full linkBetToMatch flow
  console.log("⚽ Step 2: Testing full match linking flow...\n");

  const backBet = {
    market: "Man Utd v Man City",
    selection: "Man City",
    betDate: "2026-01-14",
  };

  console.log("  Back bet:");
  console.log(`    Market: "${backBet.market}"`);
  console.log(`    Selection: "${backBet.selection}"`);
  console.log(`    Bet Date: ${backBet.betDate}`);
  console.log("");

  const linkResult = await linkBetToMatch(backBet);

  console.log("\n  Link Result:");
  console.log(`    Match ID: ${linkResult.matchId ?? "null"}`);
  console.log(`    Confidence: ${linkResult.matchConfidence ?? "null"}`);
  console.log(`    Candidates: ${linkResult.matchCandidates}`);

  if (linkResult.linkedMatch) {
    console.log(
      `    Linked: ${linkResult.linkedMatch.homeTeam} vs ${linkResult.linkedMatch.awayTeam}`
    );
    console.log(
      `    Date: ${linkResult.linkedMatch.matchDate.toISOString().split("T")[0]}`
    );
    console.log(`    Competition: ${linkResult.linkedMatch.competition}`);
    if (linkResult.linkedMatch.similarity) {
      console.log(
        `    Similarity: ${(linkResult.linkedMatch.similarity * 100).toFixed(0)}%`
      );
    }
  }
  console.log("");

  // Step 3: Verification
  console.log("✅ Step 3: Verification...\n");

  if (linkResult.matchId && linkResult.linkedMatch) {
    const match = linkResult.linkedMatch;
    const isCorrectMatch =
      (match.homeTeam.toLowerCase().includes("manchester united") ||
        match.homeTeam.toLowerCase().includes("man utd")) &&
      (match.awayTeam.toLowerCase().includes("manchester city") ||
        match.awayTeam.toLowerCase().includes("man city"));

    if (isCorrectMatch) {
      console.log("  ✅ PASS: Correct match linked (Man Utd vs Man City)");
    } else {
      console.log("  ❌ FAIL: Wrong match");
      console.log("     Expected: Man Utd vs Man City");
      console.log(`     Got: ${match.homeTeam} vs ${match.awayTeam}`);
    }

    const matchDate = new Date(match.matchDate);
    const expectedDate = new Date("2026-01-17");
    const dateDiff =
      Math.abs(matchDate.getTime() - expectedDate.getTime()) /
      (1000 * 60 * 60 * 24);

    if (dateDiff < 1) {
      console.log("  ✅ PASS: Match date correct (17 Jan 2026)");
    } else {
      console.log(
        `  ⚠️  Date differs: got ${matchDate.toISOString().split("T")[0]}`
      );
    }
  } else {
    console.log("  ❌ FAIL: No match was linked");
  }

  console.log("\n=== Test Complete ===");

  await client.end();
}

main().catch(console.error);
