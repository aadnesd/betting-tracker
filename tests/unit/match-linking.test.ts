/**
 * Tests for the match linking module that automatically links parsed bets to football matches.
 *
 * Why: Automatic match linking enables the auto-settlement flow by connecting bets to
 * synced FootballMatch records. The simplified approach uses:
 * 1. Fuzzy trigram search in the database to find candidate matches
 * 2. LLM to select the correct match from candidates
 * 
 * This normalizes common team names, uses fuzzy search, and only calls the LLM
 * for disambiguation when multiple candidates remain.
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
  findCandidateMatches,
  linkBetToMatch,
  selectMatchWithLLM,
  type MatchCandidate,
  type MatchLinkResult,
} from "@/lib/match-linking";

import { searchFootballMatches } from "@/lib/db/queries";
import { generateText } from "ai";

const mockSearchFootballMatches = searchFootballMatches as ReturnType<typeof vi.fn>;
const mockGenerateText = generateText as ReturnType<typeof vi.fn>;

describe("Match Linking Module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findCandidateMatches", () => {
    it("uses normalized market and selection terms for search", async () => {
      mockSearchFootballMatches.mockResolvedValue([]);

      await findCandidateMatches({
        market: "Man Utd v Man City",
        selection: "Man City",
      });

      expect(mockSearchFootballMatches).toHaveBeenCalledWith(
        expect.objectContaining({
          searchTerm: "Manchester United v Manchester City",
          fromDate: expect.any(Date),
          limit: 10,
          similarityThreshold: 0.15,
        })
      );
      expect(mockSearchFootballMatches).toHaveBeenCalledWith(
        expect.objectContaining({
          searchTerm: "Manchester City",
          fromDate: expect.any(Date),
          limit: 10,
          similarityThreshold: 0.15,
        })
      );
    });

    it("passes bet date as fromDate when provided", async () => {
      mockSearchFootballMatches.mockResolvedValue([]);

      const betDate = new Date("2026-01-15");
      await findCandidateMatches({
        market: "Arsenal v Chelsea",
        selection: "Arsenal",
        betDate,
      });

      expect(mockSearchFootballMatches).toHaveBeenCalledWith(
        expect.objectContaining({
          searchTerm: "Arsenal FC v Chelsea FC",
          fromDate: betDate,
          limit: 10,
          similarityThreshold: 0.15,
        })
      );
    });

    it("returns empty array for short market strings", async () => {
      const candidates = await findCandidateMatches({
        market: "AB",
      });

      expect(candidates).toEqual([]);
      expect(mockSearchFootballMatches).not.toHaveBeenCalled();
    });

    it("returns empty array for empty market", async () => {
      const candidates = await findCandidateMatches({
        market: "",
      });

      expect(candidates).toEqual([]);
      expect(mockSearchFootballMatches).not.toHaveBeenCalled();
    });

    it("uses selection term when market is too short", async () => {
      mockSearchFootballMatches.mockResolvedValue([]);

      await findCandidateMatches({
        market: "AB",
        selection: "Manchester United",
      });

      expect(mockSearchFootballMatches).toHaveBeenCalledWith(
        expect.objectContaining({
          searchTerm: "Manchester United",
          fromDate: expect.any(Date),
          limit: 10,
          similarityThreshold: 0.15,
        })
      );
    });

    it("maps DB results to MatchCandidate format", async () => {
      const dbMatch = {
        id: "match-1",
        externalId: "12345",
        homeTeam: "Manchester United",
        awayTeam: "Manchester City",
        competition: "Premier League",
        matchDate: new Date("2026-01-20"),
        status: "SCHEDULED",
        similarity: 0.65,
      };

      mockSearchFootballMatches.mockResolvedValue([dbMatch]);

      const candidates = await findCandidateMatches({
        market: "Man Utd v Man City",
        selection: "Man City",
      });

      expect(candidates.length).toBe(1);
      expect(candidates[0]).toEqual({
        id: "match-1",
        externalId: "12345",
        homeTeam: "Manchester United",
        awayTeam: "Manchester City",
        competition: "Premier League",
        matchDate: expect.any(Date),
        status: "SCHEDULED",
        similarity: 0.65,
      });
    });

    it("handles search errors gracefully", async () => {
      mockSearchFootballMatches.mockRejectedValue(new Error("DB error"));

      const candidates = await findCandidateMatches({
        market: "Arsenal v Chelsea",
        selection: "Arsenal",
      });

      expect(candidates).toEqual([]);
    });
  });

  describe("selectMatchWithLLM", () => {
    it("returns selected match index from LLM", async () => {
      mockGenerateText.mockResolvedValue({ text: "1" });

      const candidates: MatchCandidate[] = [
        {
          id: "match-1",
          externalId: "12345",
          homeTeam: "Manchester United",
          awayTeam: "Manchester City",
          competition: "Premier League",
          matchDate: new Date("2026-01-20"),
          status: "SCHEDULED",
          similarity: 0.5,
        },
      ];

      const result = await selectMatchWithLLM({
        market: "Man Utd v Man City",
        selection: "Man City",
        candidates,
      });

      expect(result.matchIndex).toBe(1);
      expect(mockGenerateText).toHaveBeenCalled();
    });

    it("returns high confidence when similarity > 0.5", async () => {
      mockGenerateText.mockResolvedValue({ text: "1" });

      const candidates: MatchCandidate[] = [
        {
          id: "match-1",
          externalId: "12345",
          homeTeam: "Manchester United",
          awayTeam: "Manchester City",
          competition: "Premier League",
          matchDate: new Date("2026-01-20"),
          status: "SCHEDULED",
          similarity: 0.6,
        },
      ];

      const result = await selectMatchWithLLM({
        market: "Man Utd v Man City",
        selection: "Man City",
        candidates,
      });

      expect(result.confidence).toBe("high");
    });

    it("returns medium confidence when similarity 0.3-0.5", async () => {
      mockGenerateText.mockResolvedValue({ text: "1" });

      const candidates: MatchCandidate[] = [
        {
          id: "match-1",
          externalId: "12345",
          homeTeam: "Manchester United",
          awayTeam: "Manchester City",
          competition: "Premier League",
          matchDate: new Date("2026-01-20"),
          status: "SCHEDULED",
          similarity: 0.35,
        },
      ];

      const result = await selectMatchWithLLM({
        market: "Man Utd v Man City",
        selection: "Man City",
        candidates,
      });

      expect(result.confidence).toBe("medium");
    });

    it("returns 0 index when LLM returns 0 (no match)", async () => {
      mockGenerateText.mockResolvedValue({ text: "0" });

      const candidates: MatchCandidate[] = [
        {
          id: "match-1",
          externalId: "12345",
          homeTeam: "Team A",
          awayTeam: "Team B",
          competition: "League",
          matchDate: new Date("2026-01-20"),
          status: "SCHEDULED",
        },
      ];

      const result = await selectMatchWithLLM({
        market: "Different Teams",
        selection: "Team X",
        candidates,
      });

      expect(result.matchIndex).toBe(0);
      expect(result.confidence).toBe("low");
    });

    it("handles invalid LLM response", async () => {
      mockGenerateText.mockResolvedValue({ text: "invalid" });

      const candidates: MatchCandidate[] = [
        {
          id: "match-1",
          externalId: "12345",
          homeTeam: "Team A",
          awayTeam: "Team B",
          competition: "League",
          matchDate: new Date("2026-01-20"),
          status: "SCHEDULED",
        },
      ];

      const result = await selectMatchWithLLM({
        market: "Team A v Team B",
        selection: "Team A",
        candidates,
      });

      expect(result.matchIndex).toBe(0);
      expect(result.confidence).toBe("low");
    });

    it("handles LLM errors gracefully", async () => {
      mockGenerateText.mockRejectedValue(new Error("LLM error"));

      const candidates: MatchCandidate[] = [
        {
          id: "match-1",
          externalId: "12345",
          homeTeam: "Team A",
          awayTeam: "Team B",
          competition: "League",
          matchDate: new Date("2026-01-20"),
          status: "SCHEDULED",
        },
      ];

      const result = await selectMatchWithLLM({
        market: "Team A v Team B",
        selection: "Team A",
        candidates,
      });

      expect(result.matchIndex).toBe(0);
      expect(result.confidence).toBe("low");
    });
  });

  describe("linkBetToMatch", () => {
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

    it("auto-links single candidate without LLM", async () => {
      const match: MatchCandidate = {
        id: "match-uuid-123",
        externalId: "12345",
        homeTeam: "Manchester United",
        awayTeam: "Manchester City",
        competition: "Premier League",
        matchDate: new Date("2026-01-20"),
        status: "SCHEDULED",
        similarity: 0.6,
      };

      mockSearchFootballMatches.mockResolvedValue([match]);

      const result = await linkBetToMatch({
        market: "Man Utd v Man City",
        selection: "Man City",
      });

      expect(mockGenerateText).not.toHaveBeenCalled();
      expect(result.matchId).toBe("match-uuid-123");
      expect(result.matchConfidence).toBe("high");
      expect(result.matchCandidates).toBe(1);
    });

    it("returns linkedMatch in result", async () => {
      const match: MatchCandidate = {
        id: "match-uuid-123",
        externalId: "12345",
        homeTeam: "Manchester United",
        awayTeam: "Manchester City",
        competition: "Premier League",
        matchDate: new Date("2026-01-20"),
        status: "SCHEDULED",
        similarity: 0.55,
      };

      mockSearchFootballMatches.mockResolvedValue([match]);

      const result = await linkBetToMatch({
        market: "Man Utd v Man City",
        selection: "Man City",
      });

      expect(result.linkedMatch).toBeDefined();
      expect(result.linkedMatch?.homeTeam).toBe("Manchester United");
      expect(result.linkedMatch?.awayTeam).toBe("Manchester City");
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
        similarity: 0.5,
      };
      const match2: MatchCandidate = {
        id: "match-2",
        externalId: "12346",
        homeTeam: "Bodø/Glimt",
        awayTeam: "Manchester City",
        competition: "Champions League",
        matchDate: new Date("2026-01-22"),
        status: "SCHEDULED",
        similarity: 0.3,
      };

      mockSearchFootballMatches.mockResolvedValue([match1, match2]);
      mockGenerateText.mockResolvedValue({ text: "1" });

      const result = await linkBetToMatch({
        market: "Man Utd v Man City",
        selection: "Man City",
      });

      expect(mockGenerateText).toHaveBeenCalled();
      expect(result.matchId).toBe("match-1");
      expect(result.matchCandidates).toBe(2);
    });

    it("returns null when LLM returns 0", async () => {
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

    it("parses bet date when provided as string", async () => {
      mockSearchFootballMatches.mockResolvedValue([]);

      await linkBetToMatch({
        market: "Arsenal v Chelsea",
        selection: "Arsenal",
        betDate: "2026-01-15",
      });

      expect(mockSearchFootballMatches).toHaveBeenCalledWith(
        expect.objectContaining({
          fromDate: expect.any(Date),
        })
      );
    });
  });

  describe("MatchCandidate interface", () => {
    it("has the expected fields", () => {
      const candidate: MatchCandidate = {
        id: "test-uuid",
        externalId: "12345",
        homeTeam: "Team A",
        awayTeam: "Team B",
        competition: "Test League",
        matchDate: new Date(),
        status: "SCHEDULED",
        similarity: 0.8,
      };

      expect(candidate.id).toBeDefined();
      expect(candidate.externalId).toBeDefined();
      expect(candidate.homeTeam).toBeDefined();
      expect(candidate.awayTeam).toBeDefined();
      expect(candidate.competition).toBeDefined();
      expect(candidate.matchDate).toBeDefined();
      expect(candidate.status).toBeDefined();
      expect(candidate.similarity).toBeDefined();
    });

    it("allows null competition", () => {
      const candidate: MatchCandidate = {
        id: "test-uuid",
        externalId: "12345",
        homeTeam: "Team A",
        awayTeam: "Team B",
        competition: null,
        matchDate: new Date(),
        status: "SCHEDULED",
      };

      expect(candidate.competition).toBeNull();
    });

    it("allows undefined similarity", () => {
      const candidate: MatchCandidate = {
        id: "test-uuid",
        externalId: "12345",
        homeTeam: "Team A",
        awayTeam: "Team B",
        competition: "Test League",
        matchDate: new Date(),
        status: "SCHEDULED",
      };

      expect(candidate.similarity).toBeUndefined();
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
