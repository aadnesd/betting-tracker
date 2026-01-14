/**
 * Tests for the match linking module that automatically links parsed bets to football matches.
 *
 * Why: Automatic match linking enables the auto-settlement flow by connecting bets to
 * synced FootballMatch records. Tests cover:
 * 1. Search term extraction from market strings
 * 2. Candidate match finding via DB search
 * 3. LLM-based match selection
 * 4. End-to-end linking flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the external dependencies
vi.mock("@/lib/db/queries", () => ({
  searchFootballMatches: vi.fn(),
}));

vi.mock("@/lib/ai/providers", () => ({
  myProvider: {
    languageModel: vi.fn(() => "mock-model"),
  },
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

import {
  extractSearchTermsFromMarket,
  findCandidateMatches,
  linkBetToMatch,
  type MatchCandidate,
  type MatchLinkResult,
} from "@/lib/match-linking";

import { searchFootballMatches } from "@/lib/db/queries";
import { generateText } from "ai";

const mockSearchFootballMatches = searchFootballMatches as ReturnType<typeof vi.fn>;
const mockGenerateText = generateText as ReturnType<typeof vi.fn>;

describe("Match Linking Module", () => {
  describe("extractSearchTermsFromMarket", () => {
    it("extracts teams from 'Home v Away' format", () => {
      const terms = extractSearchTermsFromMarket("Man Utd v Man City");
      expect(terms).toContain("Man Utd");
      expect(terms).toContain("Man City");
    });

    it("extracts teams from 'Home vs Away' format", () => {
      const terms = extractSearchTermsFromMarket("Arsenal vs Chelsea");
      expect(terms).toContain("Arsenal");
      expect(terms).toContain("Chelsea");
    });

    it("extracts teams from 'Home - Away' format", () => {
      const terms = extractSearchTermsFromMarket("Liverpool - Everton");
      expect(terms).toContain("Liverpool");
      expect(terms).toContain("Everton");
    });

    it("handles 'Competition - Home v Away' format", () => {
      const terms = extractSearchTermsFromMarket("Premier League - Arsenal v Spurs");
      expect(terms).toContain("Arsenal");
      expect(terms).toContain("Spurs");
      expect(terms).not.toContain("Premier League");
    });

    it("filters out short terms", () => {
      const terms = extractSearchTermsFromMarket("FC v AB");
      // Both terms are only 2 chars, should be filtered
      expect(terms.length).toBe(0);
    });

    it("handles real-world La Liga market", () => {
      const terms = extractSearchTermsFromMarket("Elche CF - Real Madrid");
      expect(terms).toContain("Elche CF");
      expect(terms).toContain("Real Madrid");
    });

    it("returns empty for non-match markets", () => {
      const terms = extractSearchTermsFromMarket("Over 2.5 Goals");
      expect(terms.length).toBe(0);
    });
  });

  describe("findCandidateMatches", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("searches using extracted team names", async () => {
      mockSearchFootballMatches.mockResolvedValue([]);

      await findCandidateMatches({
        market: "Man Utd v Man City",
      });

      expect(mockSearchFootballMatches).toHaveBeenCalledWith(
        expect.objectContaining({ searchTerm: "Man Utd" })
      );
      expect(mockSearchFootballMatches).toHaveBeenCalledWith(
        expect.objectContaining({ searchTerm: "Man City" })
      );
    });

    it("deduplicates matches across search terms", async () => {
      const match: MatchCandidate = {
        id: "match-1",
        externalId: "12345",
        homeTeam: "Manchester United",
        awayTeam: "Manchester City",
        competition: "Premier League",
        matchDate: new Date("2026-01-20"),
        status: "SCHEDULED",
      };

      mockSearchFootballMatches.mockResolvedValue([match]);

      const candidates = await findCandidateMatches({
        market: "Man Utd v Man City",
      });

      // Should only include the match once
      expect(candidates.length).toBe(1);
      expect(candidates[0].id).toBe("match-1");
    });

    it("returns empty array when no team names extracted", async () => {
      const candidates = await findCandidateMatches({
        market: "Over 2.5 Goals",
      });

      expect(candidates).toEqual([]);
      expect(mockSearchFootballMatches).not.toHaveBeenCalled();
    });

    it("sorts candidates by match date", async () => {
      const match1: MatchCandidate = {
        id: "match-1",
        externalId: "12345",
        homeTeam: "Arsenal FC",
        awayTeam: "Chelsea FC",
        competition: "Premier League",
        matchDate: new Date("2026-01-25"),
        status: "SCHEDULED",
      };
      const match2: MatchCandidate = {
        id: "match-2",
        externalId: "12346",
        homeTeam: "Arsenal FC",
        awayTeam: "Tottenham",
        competition: "Premier League",
        matchDate: new Date("2026-01-20"),
        status: "SCHEDULED",
      };

      mockSearchFootballMatches
        .mockResolvedValueOnce([match1])
        .mockResolvedValueOnce([match2]);

      const candidates = await findCandidateMatches({
        market: "Arsenal v Chelsea",
      });

      // Earlier match should come first
      expect(candidates[0].id).toBe("match-2");
      expect(candidates[1].id).toBe("match-1");
    });

    it("limits to 10 candidates", async () => {
      const matches = Array.from({ length: 15 }, (_, i) => ({
        id: `match-${i}`,
        externalId: `${12345 + i}`,
        homeTeam: "Team A",
        awayTeam: `Team ${i}`,
        competition: "League",
        matchDate: new Date(`2026-01-${20 + i}`),
        status: "SCHEDULED",
      }));

      mockSearchFootballMatches.mockResolvedValue(matches);

      const candidates = await findCandidateMatches({
        market: "Team A v Team B",
      });

      expect(candidates.length).toBeLessThanOrEqual(10);
    });
  });

  describe("linkBetToMatch", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns null when no matches found", async () => {
      mockSearchFootballMatches.mockResolvedValue([]);

      const result = await linkBetToMatch({
        market: "Man Utd v Man City",
        selection: "Man City",
      });

      expect(result.matchId).toBeNull();
      expect(result.matchConfidence).toBeNull();
      expect(result.matchCandidates).toBe(0);
    });

    it("auto-links with high confidence when single match found", async () => {
      const match: MatchCandidate = {
        id: "match-uuid-123",
        externalId: "12345",
        homeTeam: "Manchester United",
        awayTeam: "Manchester City",
        competition: "Premier League",
        matchDate: new Date("2026-01-20"),
        status: "SCHEDULED",
      };

      mockSearchFootballMatches.mockResolvedValue([match]);

      const result = await linkBetToMatch({
        market: "Man Utd v Man City",
        selection: "Man City",
      });

      expect(result.matchId).toBe("match-uuid-123");
      expect(result.matchConfidence).toBe("high");
      expect(result.matchCandidates).toBe(1);
      expect(result.linkedMatch).toEqual(match);
    });

    it("uses LLM to select when multiple matches found", async () => {
      const match1: MatchCandidate = {
        id: "match-1",
        externalId: "12345",
        homeTeam: "Manchester United",
        awayTeam: "Manchester City",
        competition: "Premier League",
        matchDate: new Date("2026-01-20"),
        status: "SCHEDULED",
      };
      const match2: MatchCandidate = {
        id: "match-2",
        externalId: "12346",
        homeTeam: "Bodø/Glimt",
        awayTeam: "Manchester City",
        competition: "Champions League",
        matchDate: new Date("2026-01-22"),
        status: "SCHEDULED",
      };

      mockSearchFootballMatches.mockResolvedValue([match1, match2]);
      mockGenerateText.mockResolvedValue({ text: "1" });

      const result = await linkBetToMatch({
        market: "Man Utd v Man City",
        selection: "Man City",
      });

      expect(mockGenerateText).toHaveBeenCalled();
      expect(result.matchId).toBe("match-1");
      expect(result.matchConfidence).toBe("medium");
      expect(result.matchCandidates).toBe(2);
    });

    it("returns null when LLM returns 0", async () => {
      // Set up with clear team names so we get candidates
      const match1: MatchCandidate = {
        id: "match-1",
        externalId: "12345",
        homeTeam: "Team A",
        awayTeam: "Team B",
        competition: "Unknown League",
        matchDate: new Date("2026-01-20"),
        status: "SCHEDULED",
      };
      const match2: MatchCandidate = {
        id: "match-2",
        externalId: "12346",
        homeTeam: "Team C",
        awayTeam: "Team D",
        competition: "Other League",
        matchDate: new Date("2026-01-22"),
        status: "SCHEDULED",
      };

      mockSearchFootballMatches.mockResolvedValue([match1, match2]);
      mockGenerateText.mockResolvedValue({ text: "0" });

      // Use a market string that produces search terms
      const result = await linkBetToMatch({
        market: "Team A v Team B",
        selection: "Team A",
      });

      expect(result.matchId).toBeNull();
      expect(result.matchConfidence).toBe("low");
      expect(result.matchCandidates).toBe(2);
    });

    it("handles LLM errors gracefully", async () => {
      const match1: MatchCandidate = {
        id: "match-1",
        externalId: "12345",
        homeTeam: "Arsenal FC",
        awayTeam: "Chelsea FC",
        competition: "Premier League",
        matchDate: new Date("2026-01-20"),
        status: "SCHEDULED",
      };
      const match2: MatchCandidate = {
        id: "match-2",
        externalId: "12346",
        homeTeam: "Arsenal FC",
        awayTeam: "Tottenham",
        competition: "Premier League",
        matchDate: new Date("2026-01-22"),
        status: "SCHEDULED",
      };

      mockSearchFootballMatches.mockResolvedValue([match1, match2]);
      mockGenerateText.mockRejectedValue(new Error("LLM error"));

      const result = await linkBetToMatch({
        market: "Arsenal v Chelsea",
        selection: "Arsenal",
      });

      // Should not throw, returns low confidence null
      expect(result.matchId).toBeNull();
      expect(result.matchConfidence).toBe("low");
    });
  });

  describe("MatchLinkResult interface", () => {
    it("has the expected fields", () => {
      const result: MatchLinkResult = {
        matchId: "test-uuid",
        matchConfidence: "high",
        matchCandidates: 1,
        linkedMatch: {
          id: "test-uuid",
          externalId: "12345",
          homeTeam: "Team A",
          awayTeam: "Team B",
          competition: "Test League",
          matchDate: new Date(),
          status: "SCHEDULED",
        },
      };

      expect(result.matchId).toBeDefined();
      expect(result.matchConfidence).toBeDefined();
      expect(result.matchCandidates).toBeDefined();
      expect(result.linkedMatch).toBeDefined();
    });

    it("allows null matchId and confidence", () => {
      const result: MatchLinkResult = {
        matchId: null,
        matchConfidence: null,
        matchCandidates: 0,
      };

      expect(result.matchId).toBeNull();
      expect(result.matchConfidence).toBeNull();
    });
  });
});
