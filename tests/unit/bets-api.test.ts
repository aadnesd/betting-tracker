import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST as screenshotsRoute } from "@/app/(chat)/api/bets/screenshots/route";
import { POST as autoparseRoute } from "@/app/(chat)/api/bets/autoparse/route";
import { POST as createMatchedRoute } from "@/app/(chat)/api/bets/create-matched/route";
import { PATCH as updateMatchedRoute } from "@/app/(chat)/api/bets/update-matched/route";
import { POST as quickAddRoute } from "@/app/(chat)/api/bets/quick-add/route";
import { POST as standaloneRoute } from "@/app/(chat)/api/bets/standalone/route";
import { POST as settleRoute } from "@/app/(chat)/api/bets/settle/route";
import { POST as deleteIndividualRoute } from "@/app/(chat)/api/bets/individual/delete/route";
import { POST as updateIndividualRoute } from "@/app/(chat)/api/bets/individual/update/route";
import * as authModule from "@/app/(auth)/auth";
import * as dbQueries from "@/lib/db/queries";
import * as matchLinking from "@/lib/match-linking";
import { parseMatchedBetFromScreenshots } from "@/lib/bet-parser";
import { convertAmountToNok } from "@/lib/fx-rates";

vi.mock("@/lib/ai/providers", () => ({
  myProvider: {
    languageModel: () => ({}),
  },
}));

vi.mock("@/lib/bet-parser", () => ({
  parseMatchedBetFromScreenshots: vi.fn(),
  parseMatchedBetWithOcr: vi.fn(),
  isOcrConfigured: vi.fn(() => false), // Default to non-OCR path for tests
}));

vi.mock("@/lib/match-linking", () => ({
  linkBetToMatch: vi.fn(),
}));

vi.mock("@/lib/fx-rates", () => ({
  convertAmountToNok: vi.fn(async (amount: number) => amount),
}));

const user = { id: "user-1" };

vi.mock("@/app/(auth)/auth", () => ({
  auth: vi.fn(),
}));

// Mock db queries
vi.mock("@/lib/db/queries", () => ({
  saveScreenshotUpload: vi.fn(),
  getScreenshotById: vi.fn(),
  updateScreenshotStatus: vi.fn(),
  getAccountById: vi.fn(),
  getAccountByName: vi.fn(),
  getOrCreateAccount: vi.fn(),
  getPromoById: vi.fn(),
  getOrCreatePromoByType: vi.fn(),
  saveBackBet: vi.fn(),
  saveLayBet: vi.fn(),
  createMatchedBetRecord: vi.fn(),
  createAuditEntry: vi.fn(),
  getMatchedBetById: vi.fn(),
  updateMatchedBetRecord: vi.fn(),
  listAuditEntriesByEntity: vi.fn(),
  listMatchedBetsByStatus: vi.fn(),
  countMatchedBetsByStatus: vi.fn(),
  createManualScreenshot: vi.fn(),
  getMatchedBetWithParts: vi.fn(),
  createAccountTransaction: vi.fn(),
  markFreeBetAsUsed: vi.fn(),
  getBackBetById: vi.fn(),
  getLayBetById: vi.fn(),
  updateBackBet: vi.fn(),
  updateLayBet: vi.fn(),
  updateBackBetDetails: vi.fn(),
  updateLayBetDetails: vi.fn(),
  deleteBet: vi.fn(),
  deleteMatchedBet: vi.fn(),
  getMatchedBetByLegId: vi.fn(),
}));

const makeBlob = (content = "stub") =>
  new Blob([content], { type: "image/png" });

describe("bets API routes (unit)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (authModule.auth as vi.Mock).mockResolvedValue({ user });
    (matchLinking.linkBetToMatch as vi.Mock).mockResolvedValue({
      matchId: null,
      matchConfidence: null,
      matchCandidates: 0,
    });
  });

  it("uploads screenshots and returns metadata", async () => {
    (dbQueries.saveScreenshotUpload as vi.Mock).mockResolvedValueOnce({
      id: "back-1",
      url: "http://blob/back",
      kind: "back",
    });
    (dbQueries.saveScreenshotUpload as vi.Mock).mockResolvedValueOnce({
      id: "lay-1",
      url: "http://blob/lay",
      kind: "lay",
    });

    const form = new FormData();
    form.append("back", makeBlob(), "back.png");
    form.append("lay", makeBlob(), "lay.png");

    const res = await screenshotsRoute(
      new Request("http://localhost/api/bets/screenshots", {
        method: "POST",
        body: form,
      })
    );

    expect(res).toBeInstanceOf(NextResponse);
    const json = await res.json();
    expect(json.back.id).toBe("back-1");
    expect(json.lay.id).toBe("lay-1");
  });

  it("autoparse uses stubbed parser and returns aligned bets", async () => {
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "back-1",
      url: "http://blob/back",
      userId: user.id,
    });
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "lay-1",
      url: "http://blob/lay",
      userId: user.id,
    });

    // Mock matching accounts so test can pass without triggering needsReview
    (dbQueries.getAccountByName as vi.Mock).mockImplementation(
      async ({ kind }: { kind: string }) => {
        if (kind === "bookmaker") {
          return { id: "acc-bookmaker", name: "Bet365", kind: "bookmaker" };
        }
        if (kind === "exchange") {
          return { id: "acc-exchange", name: "Betfair", kind: "exchange" };
        }
        return null;
      }
    );

    const parsedPair = {
      back: {
        type: "back",
        market: "M",
        selection: "Arsenal",
        odds: 2.4,
        stake: 10,
        exchange: "Bet365",
      },
      lay: {
        type: "lay",
        market: "M",
        selection: "Arsenal",
        odds: 2.3,
        stake: 11,
        exchange: "Betfair",
      },
      needsReview: false,
    };

    (parseMatchedBetFromScreenshots as vi.Mock).mockResolvedValue(parsedPair);

    const res = await autoparseRoute(
      new Request("http://localhost/api/bets/autoparse", {
        method: "POST",
        body: JSON.stringify({
          backScreenshotId: "11111111-1111-1111-1111-111111111111",
          layScreenshotId: "22222222-2222-2222-2222-222222222222",
        }),
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.back?.selection).toBe(json.lay?.selection);
    expect(typeof json.needsReview === "boolean").toBe(true);
    expect(dbQueries.updateScreenshotStatus).toHaveBeenCalledTimes(2);
    expect(dbQueries.updateScreenshotStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "back-1",
        status: "parsed",
        parsedOutput: expect.objectContaining({
          ...parsedPair.back,
          accountId: "acc-bookmaker",
          unmatchedAccount: false,
        }),
        confidence: null,
      })
    );
  });

  it("autoparse flags needs_review when confidence is low", async () => {
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "back-1",
      url: "http://blob/back",
      userId: user.id,
    });
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "lay-1",
      url: "http://blob/lay",
      userId: user.id,
    });

    // Mock matching accounts so we isolate the confidence test
    (dbQueries.getAccountByName as vi.Mock).mockImplementation(
      async ({ kind }: { kind: string }) => {
        if (kind === "bookmaker") {
          return { id: "acc-bookmaker", name: "Bet365", kind: "bookmaker" };
        }
        if (kind === "exchange") {
          return { id: "acc-exchange", name: "Betfair", kind: "exchange" };
        }
        return null;
      }
    );

    (parseMatchedBetFromScreenshots as vi.Mock).mockResolvedValue({
      back: {
        type: "back",
        market: "M",
        selection: "Arsenal",
        odds: 2.4,
        stake: 10,
        exchange: "Bet365",
        confidence: { odds: 0.6 },
      },
      lay: {
        type: "lay",
        market: "M",
        selection: "Arsenal",
        odds: 2.3,
        stake: 11,
        exchange: "Betfair",
        confidence: { odds: 0.95 },
      },
      needsReview: false,
    });

    const res = await autoparseRoute(
      new Request("http://localhost/api/bets/autoparse", {
        method: "POST",
        body: JSON.stringify({
          backScreenshotId: "11111111-1111-1111-1111-111111111111",
          layScreenshotId: "22222222-2222-2222-2222-222222222222",
        }),
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.needsReview).toBe(true);
    expect(dbQueries.updateScreenshotStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: "back-1", status: "needs_review" })
    );
    expect(dbQueries.updateScreenshotStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: "lay-1", status: "needs_review" })
    );
  });

  it("autoparse flags needsReview when match link confidence is low", async () => {
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "back-1",
      url: "http://blob/back",
      userId: user.id,
    });
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "lay-1",
      url: "http://blob/lay",
      userId: user.id,
    });

    (dbQueries.getAccountByName as vi.Mock).mockImplementation(
      async ({ kind }: { kind: string }) => {
        if (kind === "bookmaker") {
          return { id: "acc-bookmaker", name: "Bet365", kind: "bookmaker" };
        }
        if (kind === "exchange") {
          return { id: "acc-exchange", name: "Betfair", kind: "exchange" };
        }
        return null;
      }
    );

    (matchLinking.linkBetToMatch as vi.Mock).mockResolvedValue({
      matchId: "match-1",
      matchConfidence: "low",
      matchCandidates: 3,
    });

    (parseMatchedBetFromScreenshots as vi.Mock).mockResolvedValue({
      back: {
        type: "back",
        market: "M",
        selection: "Arsenal",
        odds: 2.4,
        stake: 10,
        exchange: "Bet365",
      },
      lay: {
        type: "lay",
        market: "M",
        selection: "Arsenal",
        odds: 2.3,
        stake: 11,
        exchange: "Betfair",
      },
      needsReview: false,
    });

    const res = await autoparseRoute(
      new Request("http://localhost/api/bets/autoparse", {
        method: "POST",
        body: JSON.stringify({
          backScreenshotId: "11111111-1111-1111-1111-111111111111",
          layScreenshotId: "22222222-2222-2222-2222-222222222222",
        }),
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.needsReview).toBe(true);
    expect(json.notes).toContain("Match link confidence is low");
    expect(dbQueries.updateScreenshotStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: "back-1", status: "needs_review" })
    );
    expect(dbQueries.updateScreenshotStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: "lay-1", status: "needs_review" })
    );
  });

  it("autoparse flags needsReview when match candidates exist but none linked", async () => {
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "back-1",
      url: "http://blob/back",
      userId: user.id,
    });
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "lay-1",
      url: "http://blob/lay",
      userId: user.id,
    });

    (dbQueries.getAccountByName as vi.Mock).mockImplementation(
      async ({ kind }: { kind: string }) => {
        if (kind === "bookmaker") {
          return { id: "acc-bookmaker", name: "Bet365", kind: "bookmaker" };
        }
        if (kind === "exchange") {
          return { id: "acc-exchange", name: "Betfair", kind: "exchange" };
        }
        return null;
      }
    );

    (matchLinking.linkBetToMatch as vi.Mock).mockResolvedValue({
      matchId: null,
      matchConfidence: "low",
      matchCandidates: 2,
    });

    (parseMatchedBetFromScreenshots as vi.Mock).mockResolvedValue({
      back: {
        type: "back",
        market: "M",
        selection: "Arsenal",
        odds: 2.4,
        stake: 10,
        exchange: "Bet365",
      },
      lay: {
        type: "lay",
        market: "M",
        selection: "Arsenal",
        odds: 2.3,
        stake: 11,
        exchange: "Betfair",
      },
      needsReview: false,
    });

    const res = await autoparseRoute(
      new Request("http://localhost/api/bets/autoparse", {
        method: "POST",
        body: JSON.stringify({
          backScreenshotId: "11111111-1111-1111-1111-111111111111",
          layScreenshotId: "22222222-2222-2222-2222-222222222222",
        }),
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.needsReview).toBe(true);
    expect(json.notes).toContain("candidate matches");
    expect(dbQueries.updateScreenshotStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: "back-1", status: "needs_review" })
    );
    expect(dbQueries.updateScreenshotStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: "lay-1", status: "needs_review" })
    );
  });

  it("autoparse returns accountId when accounts match parsed exchange names", async () => {
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "back-1",
      url: "http://blob/back",
      userId: user.id,
    });
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "lay-1",
      url: "http://blob/lay",
      userId: user.id,
    });

    // Mock matching accounts exist
    (dbQueries.getAccountByName as vi.Mock).mockImplementation(
      async ({ name, kind }: { name: string; kind: string }) => {
        if (kind === "bookmaker" && name.toLowerCase() === "bet365") {
          return { id: "acc-bookmaker-1", name: "Bet365", kind: "bookmaker" };
        }
        if (kind === "exchange" && name.toLowerCase() === "betfair") {
          return { id: "acc-exchange-1", name: "Betfair", kind: "exchange" };
        }
        return null;
      }
    );

    (parseMatchedBetFromScreenshots as vi.Mock).mockResolvedValue({
      back: {
        type: "back",
        market: "M",
        selection: "Arsenal",
        odds: 2.4,
        stake: 10,
        exchange: "Bet365",
      },
      lay: {
        type: "lay",
        market: "M",
        selection: "Arsenal",
        odds: 2.3,
        stake: 11,
        exchange: "Betfair",
      },
      needsReview: false,
    });

    const res = await autoparseRoute(
      new Request("http://localhost/api/bets/autoparse", {
        method: "POST",
        body: JSON.stringify({
          backScreenshotId: "11111111-1111-1111-1111-111111111111",
          layScreenshotId: "22222222-2222-2222-2222-222222222222",
        }),
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    // Account IDs should be included in response
    expect(json.back.accountId).toBe("acc-bookmaker-1");
    expect(json.lay.accountId).toBe("acc-exchange-1");
    // No unmatched flags when accounts exist
    expect(json.back.unmatchedAccount).toBe(false);
    expect(json.lay.unmatchedAccount).toBe(false);
    // Should not need review when accounts are matched
    expect(json.needsReview).toBe(false);
  });

  it("autoparse flags needsReview when no account matches parsed exchange", async () => {
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "back-1",
      url: "http://blob/back",
      userId: user.id,
    });
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "lay-1",
      url: "http://blob/lay",
      userId: user.id,
    });

    // No matching accounts found
    (dbQueries.getAccountByName as vi.Mock).mockResolvedValue(null);

    (parseMatchedBetFromScreenshots as vi.Mock).mockResolvedValue({
      back: {
        type: "back",
        market: "M",
        selection: "Arsenal",
        odds: 2.4,
        stake: 10,
        exchange: "UnknownBookmaker",
      },
      lay: {
        type: "lay",
        market: "M",
        selection: "Arsenal",
        odds: 2.3,
        stake: 11,
        exchange: "UnknownExchange",
      },
      needsReview: false,
    });

    const res = await autoparseRoute(
      new Request("http://localhost/api/bets/autoparse", {
        method: "POST",
        body: JSON.stringify({
          backScreenshotId: "11111111-1111-1111-1111-111111111111",
          layScreenshotId: "22222222-2222-2222-2222-222222222222",
        }),
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    // Account IDs should be null when no match
    expect(json.back.accountId).toBeNull();
    expect(json.lay.accountId).toBeNull();
    // Unmatched flags should be set
    expect(json.back.unmatchedAccount).toBe(true);
    expect(json.lay.unmatchedAccount).toBe(true);
    // Should need review when accounts are not matched
    expect(json.needsReview).toBe(true);
    // Notes should suggest creating accounts
    expect(json.notes).toContain('Bookmaker "UnknownBookmaker" not found');
    expect(json.notes).toContain('Exchange "UnknownExchange" not found');
  });

  it("autoparse matches accounts case-insensitively", async () => {
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "back-1",
      url: "http://blob/back",
      userId: user.id,
    });
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "lay-1",
      url: "http://blob/lay",
      userId: user.id,
    });

    // Mock accounts matching with different casing
    (dbQueries.getAccountByName as vi.Mock).mockImplementation(
      async ({ name, kind }: { name: string; kind: string }) => {
        // The getAccountByName function normalizes names internally
        if (kind === "bookmaker") {
          return { id: "acc-bookmaker-1", name: "bet365", kind: "bookmaker" };
        }
        if (kind === "exchange") {
          return { id: "acc-exchange-1", name: "BFB247", kind: "exchange" };
        }
        return null;
      }
    );

    (parseMatchedBetFromScreenshots as vi.Mock).mockResolvedValue({
      back: {
        type: "back",
        market: "M",
        selection: "Arsenal",
        odds: 2.4,
        stake: 10,
        exchange: "BET365", // Different casing
      },
      lay: {
        type: "lay",
        market: "M",
        selection: "Arsenal",
        odds: 2.3,
        stake: 11,
        exchange: "bfb247", // Different casing
      },
      needsReview: false,
    });

    const res = await autoparseRoute(
      new Request("http://localhost/api/bets/autoparse", {
        method: "POST",
        body: JSON.stringify({
          backScreenshotId: "11111111-1111-1111-1111-111111111111",
          layScreenshotId: "22222222-2222-2222-2222-222222222222",
        }),
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    // Should match despite case differences
    expect(json.back.accountId).toBe("acc-bookmaker-1");
    expect(json.lay.accountId).toBe("acc-exchange-1");
    expect(json.back.unmatchedAccount).toBe(false);
    expect(json.lay.unmatchedAccount).toBe(false);
    expect(json.needsReview).toBe(false);
  });

  it("create matched persists bets and returns matched record", async () => {
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "back-1",
      url: "http://blob/back",
      userId: user.id,
    });
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "lay-1",
      url: "http://blob/lay",
      userId: user.id,
    });
    (dbQueries.getOrCreateAccount as vi.Mock).mockResolvedValueOnce({
      id: "acc-back",
    });
    (dbQueries.getOrCreateAccount as vi.Mock).mockResolvedValueOnce({
      id: "acc-lay",
    });
    (dbQueries.saveBackBet as vi.Mock).mockResolvedValue({ id: "bb1" });
    (dbQueries.saveLayBet as vi.Mock).mockResolvedValue({ id: "lb1" });
    (dbQueries.createMatchedBetRecord as vi.Mock).mockResolvedValue({
      id: "mb1",
      status: "matched",
    });

    const payload = {
      backScreenshotId: "11111111-1111-1111-1111-111111111111",
      layScreenshotId: "22222222-2222-2222-2222-222222222222",
      market: "Premier League",
      selection: "Arsenal",
      needsReview: false,
      back: {
        market: "Premier League",
        selection: "Arsenal",
        odds: 2.4,
        stake: 20,
      exchange: "Bet365",
      currency: "EUR",
    },
    lay: {
      market: "Premier League",
      selection: "Arsenal",
      odds: 2.32,
      stake: 21,
      exchange: "bfb247",
      currency: "NOK",
    },
};

    const res = await createMatchedRoute(
      new Request("http://localhost/api/bets/create-matched", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.matched?.id).toBe("mb1");
    expect(dbQueries.saveBackBet).toHaveBeenCalled();
    expect(dbQueries.saveLayBet).toHaveBeenCalled();
    expect(dbQueries.saveBackBet).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acc-back" })
    );
    expect(dbQueries.saveLayBet).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acc-lay" })
    );
    expect(convertAmountToNok).toHaveBeenCalled();
  });

  it("create matched allows draft with missing leg", async () => {
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "back-1",
      url: "http://blob/back",
      userId: user.id,
    });
    (dbQueries.getOrCreateAccount as vi.Mock).mockResolvedValueOnce({
      id: "acc-back",
    });
    (dbQueries.saveBackBet as vi.Mock).mockResolvedValue({ id: "bb1" });
    (dbQueries.createMatchedBetRecord as vi.Mock).mockResolvedValue({
      id: "mb1",
      status: "draft",
    });

    const payload = {
      backScreenshotId: "11111111-1111-1111-1111-111111111111",
      market: "Premier League",
      selection: "Arsenal",
      needsReview: false,
      back: {
        market: "Premier League",
        selection: "Arsenal",
        odds: 2.4,
        stake: 20,
        exchange: "Bet365",
        currency: "EUR",
      },
    };

    const res = await createMatchedRoute(
      new Request("http://localhost/api/bets/create-matched", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.matched?.status).toBe("draft");
    expect(dbQueries.saveBackBet).toHaveBeenCalled();
    expect(dbQueries.saveLayBet).not.toHaveBeenCalled();
    expect(dbQueries.saveBackBet).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acc-back" })
    );
    expect(dbQueries.createMatchedBetRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        backBetId: "bb1",
        layBetId: null,
        status: "draft",
      })
    );
    expect(convertAmountToNok).not.toHaveBeenCalled();
  });

  it("create matched flags needs_review on low confidence and adds audit note", async () => {
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "back-1",
      url: "http://blob/back",
      userId: user.id,
    });
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "lay-1",
      url: "http://blob/lay",
      userId: user.id,
    });
    (dbQueries.getOrCreateAccount as vi.Mock).mockResolvedValueOnce({
      id: "acc-back",
    });
    (dbQueries.getOrCreateAccount as vi.Mock).mockResolvedValueOnce({
      id: "acc-lay",
    });
    (dbQueries.saveBackBet as vi.Mock).mockResolvedValue({ id: "bb1" });
    (dbQueries.saveLayBet as vi.Mock).mockResolvedValue({ id: "lb1" });
    (dbQueries.createMatchedBetRecord as vi.Mock).mockResolvedValue({
      id: "mb1",
      status: "needs_review",
    });

    const payload = {
      backScreenshotId: "11111111-1111-1111-1111-111111111111",
      layScreenshotId: "22222222-2222-2222-2222-222222222222",
      market: "Premier League",
      selection: "Arsenal",
      needsReview: false,
      back: {
        market: "Premier League",
        selection: "Arsenal",
        odds: 2.4,
        stake: 20,
        exchange: "Bet365",
        currency: "EUR",
        confidence: { odds: 0.6 },
      },
      lay: {
        market: "Premier League",
        selection: "Arsenal",
        odds: 2.32,
        stake: 21,
        exchange: "bfb247",
        currency: "NOK",
        confidence: { odds: 0.95 },
      },
    };

    const res = await createMatchedRoute(
      new Request("http://localhost/api/bets/create-matched", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.matched?.status).toBe("needs_review");
    expect(dbQueries.saveBackBet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "needs_review", accountId: "acc-back" })
    );
    expect(dbQueries.saveLayBet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "needs_review", accountId: "acc-lay" })
    );
    expect(dbQueries.createMatchedBetRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "needs_review",
        notes: expect.stringContaining("Needs review:"),
      })
    );
  });

  it("create matched creates audit entries for all entities", async () => {
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "back-1",
      url: "http://blob/back",
      userId: user.id,
    });
    (dbQueries.getScreenshotById as vi.Mock).mockResolvedValueOnce({
      id: "lay-1",
      url: "http://blob/lay",
      userId: user.id,
    });
    (dbQueries.getOrCreateAccount as vi.Mock).mockResolvedValueOnce({
      id: "acc-back",
    });
    (dbQueries.getOrCreateAccount as vi.Mock).mockResolvedValueOnce({
      id: "acc-lay",
    });
    (dbQueries.saveBackBet as vi.Mock).mockResolvedValue({ id: "bb1" });
    (dbQueries.saveLayBet as vi.Mock).mockResolvedValue({ id: "lb1" });
    (dbQueries.createMatchedBetRecord as vi.Mock).mockResolvedValue({
      id: "mb1",
      status: "matched",
    });
    (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({ id: "audit-1" });

    const payload = {
      backScreenshotId: "11111111-1111-1111-1111-111111111111",
      layScreenshotId: "22222222-2222-2222-2222-222222222222",
      market: "Premier League",
      selection: "Arsenal",
      needsReview: false,
      back: {
        market: "Premier League",
        selection: "Arsenal",
        odds: 2.4,
        stake: 20,
        exchange: "Bet365",
        currency: "EUR",
      },
      lay: {
        market: "Premier League",
        selection: "Arsenal",
        odds: 2.32,
        stake: 21,
        exchange: "bfb247",
        currency: "NOK",
      },
    };

    const res = await createMatchedRoute(
      new Request("http://localhost/api/bets/create-matched", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );

    expect(res.status).toBe(200);

    // Should create 3 audit entries: back bet, lay bet, matched bet
    expect(dbQueries.createAuditEntry).toHaveBeenCalledTimes(3);

    // Verify back bet audit entry
    expect(dbQueries.createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        entityType: "back_bet",
        entityId: "bb1",
        action: "create",
        changes: expect.objectContaining({
          market: "Premier League",
          selection: "Arsenal",
          odds: 2.4,
          stake: 20,
        }),
      })
    );

    // Verify lay bet audit entry
    expect(dbQueries.createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        entityType: "lay_bet",
        entityId: "lb1",
        action: "create",
      })
    );

    // Verify matched bet audit entry
    expect(dbQueries.createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        entityType: "matched_bet",
        entityId: "mb1",
        action: "create",
        changes: expect.objectContaining({
          market: "Premier League",
          selection: "Arsenal",
          status: "matched",
        }),
      })
    );
  });

  it("update matched creates audit entry with changes", async () => {
    const existingBet = {
      id: "11111111-1111-1111-1111-111111111111",
      userId: user.id,
      status: "draft",
      notes: null,
      netExposure: null,
      backBetId: "22222222-2222-2222-2222-222222222222",
      layBetId: null,
      promoId: null,
      promoType: null,
      lastError: null,
      confirmedAt: null,
    };

    const updatedBet = {
      ...existingBet,
      status: "matched",
      layBetId: "33333333-3333-3333-3333-333333333333",
      notes: "Attached lay leg",
    };

    (dbQueries.getMatchedBetById as vi.Mock).mockResolvedValue(existingBet);
    (dbQueries.updateMatchedBetRecord as vi.Mock).mockResolvedValue(updatedBet);
    (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({ id: "audit-1" });

    const res = await updateMatchedRoute(
      new Request("http://localhost/api/bets/update-matched", {
        method: "PATCH",
        body: JSON.stringify({
          id: "11111111-1111-1111-1111-111111111111",
          status: "matched",
          layBetId: "33333333-3333-3333-3333-333333333333",
          notes: "Attached lay leg",
        }),
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.matched.status).toBe("matched");

    // Verify audit entry was created with attach_leg action (since we're attaching a missing leg)
    expect(dbQueries.createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        entityType: "matched_bet",
        entityId: "11111111-1111-1111-1111-111111111111",
        action: "attach_leg",
        changes: expect.objectContaining({
          status: { from: "draft", to: "matched" },
          layBetId: { from: null, to: "33333333-3333-3333-3333-333333333333" },
        }),
      })
    );
  });

  it("update matched uses status_change action when only status changes", async () => {
    const existingBet = {
      id: "11111111-1111-1111-1111-111111111111",
      userId: user.id,
      status: "matched",
      notes: null,
      netExposure: "100",
      backBetId: "22222222-2222-2222-2222-222222222222",
      layBetId: "33333333-3333-3333-3333-333333333333",
      promoId: null,
      promoType: null,
      lastError: null,
      confirmedAt: null,
    };

    const updatedBet = {
      ...existingBet,
      status: "settled",
    };

    (dbQueries.getMatchedBetById as vi.Mock).mockResolvedValue(existingBet);
    (dbQueries.updateMatchedBetRecord as vi.Mock).mockResolvedValue(updatedBet);
    (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({ id: "audit-1" });

    const res = await updateMatchedRoute(
      new Request("http://localhost/api/bets/update-matched", {
        method: "PATCH",
        body: JSON.stringify({
          id: "11111111-1111-1111-1111-111111111111",
          status: "settled",
        }),
      })
    );

    expect(res.status).toBe(200);

    // Verify audit entry was created with status_change action
    expect(dbQueries.createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        entityType: "matched_bet",
        entityId: "11111111-1111-1111-1111-111111111111",
        action: "status_change",
        changes: {
          status: { from: "matched", to: "settled" },
        },
      })
    );
  });

  it("update matched does not create audit entry when no changes", async () => {
    const existingBet = {
      id: "11111111-1111-1111-1111-111111111111",
      userId: user.id,
      status: "matched",
      notes: null,
      netExposure: "100",
      backBetId: "22222222-2222-2222-2222-222222222222",
      layBetId: "33333333-3333-3333-3333-333333333333",
      promoId: null,
      promoType: null,
      lastError: null,
      confirmedAt: null,
    };

    (dbQueries.getMatchedBetById as vi.Mock).mockResolvedValue(existingBet);
    (dbQueries.updateMatchedBetRecord as vi.Mock).mockResolvedValue(existingBet);

    const res = await updateMatchedRoute(
      new Request("http://localhost/api/bets/update-matched", {
        method: "PATCH",
        body: JSON.stringify({
          id: "11111111-1111-1111-1111-111111111111",
          status: "matched", // Same as existing
        }),
      })
    );

    expect(res.status).toBe(200);

    // No audit entry when nothing changed
    expect(dbQueries.createAuditEntry).not.toHaveBeenCalled();
  });

  it("update matched returns 404 when bet not found", async () => {
    (dbQueries.getMatchedBetById as vi.Mock).mockResolvedValue(null);

    const res = await updateMatchedRoute(
      new Request("http://localhost/api/bets/update-matched", {
        method: "PATCH",
        body: JSON.stringify({
          id: "11111111-1111-1111-1111-111111111111",
          status: "matched",
        }),
      })
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Matched bet not found");
  });

  describe("settlement transactions", () => {
    it("creates adjustment transactions when settling matched bet", async () => {
      const existingBet = {
        id: "11111111-1111-1111-1111-111111111111",
        userId: user.id,
        status: "matched",
        notes: null,
        netExposure: "100",
        backBetId: "22222222-2222-2222-2222-222222222222",
        layBetId: "33333333-3333-3333-3333-333333333333",
        promoId: null,
        promoType: null,
        lastError: null,
        confirmedAt: null,
        market: "Premier League",
        selection: "Arsenal to Win",
      };

      const updatedBet = { ...existingBet, status: "settled" };

      const fullBetWithParts = {
        matched: existingBet,
        back: {
          id: "22222222-2222-2222-2222-222222222222",
          accountId: "acc-back-1",
          profitLoss: "150.00",
          currency: "NOK",
        },
        lay: {
          id: "33333333-3333-3333-3333-333333333333",
          accountId: "acc-lay-1",
          profitLoss: "-145.00",
          currency: "NOK",
        },
      };

      (dbQueries.getMatchedBetById as vi.Mock).mockResolvedValue(existingBet);
      (dbQueries.updateMatchedBetRecord as vi.Mock).mockResolvedValue(updatedBet);
      (dbQueries.getMatchedBetWithParts as vi.Mock).mockResolvedValue(fullBetWithParts);
      (dbQueries.createAccountTransaction as vi.Mock).mockResolvedValue({ id: "txn-1" });
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({ id: "audit-1" });

      const res = await updateMatchedRoute(
        new Request("http://localhost/api/bets/update-matched", {
          method: "PATCH",
          body: JSON.stringify({
            id: "11111111-1111-1111-1111-111111111111",
            status: "settled",
          }),
        })
      );

      expect(res.status).toBe(200);

      // Verify adjustment transactions were created for both accounts
      expect(dbQueries.createAccountTransaction).toHaveBeenCalledTimes(2);

      // Back bet account adjustment (profit)
      expect(dbQueries.createAccountTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          accountId: "acc-back-1",
          type: "adjustment",
          amount: 150.0,
          currency: "NOK",
          notes: expect.stringContaining("Settlement"),
        })
      );

      // Lay bet account adjustment (loss)
      expect(dbQueries.createAccountTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          accountId: "acc-lay-1",
          type: "adjustment",
          amount: -145.0,
          currency: "NOK",
          notes: expect.stringContaining("Settlement"),
        })
      );
    });

    it("does not create transactions when bet is already settled", async () => {
      const existingBet = {
        id: "11111111-1111-1111-1111-111111111111",
        userId: user.id,
        status: "settled", // Already settled
        notes: null,
        netExposure: "100",
        backBetId: "22222222-2222-2222-2222-222222222222",
        layBetId: "33333333-3333-3333-3333-333333333333",
        promoId: null,
        promoType: null,
        lastError: null,
        confirmedAt: null,
      };

      (dbQueries.getMatchedBetById as vi.Mock).mockResolvedValue(existingBet);
      (dbQueries.updateMatchedBetRecord as vi.Mock).mockResolvedValue(existingBet);

      const res = await updateMatchedRoute(
        new Request("http://localhost/api/bets/update-matched", {
          method: "PATCH",
          body: JSON.stringify({
            id: "11111111-1111-1111-1111-111111111111",
            status: "settled", // Same status
          }),
        })
      );

      expect(res.status).toBe(200);

      // No transactions created because status didn't change TO settled
      expect(dbQueries.createAccountTransaction).not.toHaveBeenCalled();
    });

    it("does not create transactions when bets have no accountId", async () => {
      const existingBet = {
        id: "11111111-1111-1111-1111-111111111111",
        userId: user.id,
        status: "matched",
        notes: null,
        netExposure: "100",
        backBetId: "22222222-2222-2222-2222-222222222222",
        layBetId: "33333333-3333-3333-3333-333333333333",
        promoId: null,
        promoType: null,
        lastError: null,
        confirmedAt: null,
        market: "Premier League",
        selection: "Arsenal to Win",
      };

      const updatedBet = { ...existingBet, status: "settled" };

      const fullBetWithParts = {
        matched: existingBet,
        back: {
          id: "22222222-2222-2222-2222-222222222222",
          accountId: null, // No account
          profitLoss: "150.00",
          currency: "NOK",
        },
        lay: {
          id: "33333333-3333-3333-3333-333333333333",
          accountId: null, // No account
          profitLoss: "-145.00",
          currency: "NOK",
        },
      };

      (dbQueries.getMatchedBetById as vi.Mock).mockResolvedValue(existingBet);
      (dbQueries.updateMatchedBetRecord as vi.Mock).mockResolvedValue(updatedBet);
      (dbQueries.getMatchedBetWithParts as vi.Mock).mockResolvedValue(fullBetWithParts);
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({ id: "audit-1" });

      const res = await updateMatchedRoute(
        new Request("http://localhost/api/bets/update-matched", {
          method: "PATCH",
          body: JSON.stringify({
            id: "11111111-1111-1111-1111-111111111111",
            status: "settled",
          }),
        })
      );

      expect(res.status).toBe(200);

      // No transactions because no accountId on bets
      expect(dbQueries.createAccountTransaction).not.toHaveBeenCalled();
    });

    it("does not create transactions when bets have no profitLoss", async () => {
      const existingBet = {
        id: "11111111-1111-1111-1111-111111111111",
        userId: user.id,
        status: "matched",
        notes: null,
        netExposure: "100",
        backBetId: "22222222-2222-2222-2222-222222222222",
        layBetId: "33333333-3333-3333-3333-333333333333",
        promoId: null,
        promoType: null,
        lastError: null,
        confirmedAt: null,
        market: "Premier League",
        selection: "Arsenal to Win",
      };

      const updatedBet = { ...existingBet, status: "settled" };

      const fullBetWithParts = {
        matched: existingBet,
        back: {
          id: "22222222-2222-2222-2222-222222222222",
          accountId: "acc-back-1",
          profitLoss: null, // No profitLoss
          currency: "NOK",
        },
        lay: {
          id: "33333333-3333-3333-3333-333333333333",
          accountId: "acc-lay-1",
          profitLoss: null, // No profitLoss
          currency: "NOK",
        },
      };

      (dbQueries.getMatchedBetById as vi.Mock).mockResolvedValue(existingBet);
      (dbQueries.updateMatchedBetRecord as vi.Mock).mockResolvedValue(updatedBet);
      (dbQueries.getMatchedBetWithParts as vi.Mock).mockResolvedValue(fullBetWithParts);
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({ id: "audit-1" });

      const res = await updateMatchedRoute(
        new Request("http://localhost/api/bets/update-matched", {
          method: "PATCH",
          body: JSON.stringify({
            id: "11111111-1111-1111-1111-111111111111",
            status: "settled",
          }),
        })
      );

      expect(res.status).toBe(200);

      // No transactions because no profitLoss on bets
      expect(dbQueries.createAccountTransaction).not.toHaveBeenCalled();
    });

    it("creates transaction only for back bet when lay has no account", async () => {
      const existingBet = {
        id: "11111111-1111-1111-1111-111111111111",
        userId: user.id,
        status: "matched",
        notes: null,
        netExposure: "100",
        backBetId: "22222222-2222-2222-2222-222222222222",
        layBetId: "33333333-3333-3333-3333-333333333333",
        promoId: null,
        promoType: null,
        lastError: null,
        confirmedAt: null,
        market: "Champions League",
        selection: "Barcelona",
      };

      const updatedBet = { ...existingBet, status: "settled" };

      const fullBetWithParts = {
        matched: existingBet,
        back: {
          id: "22222222-2222-2222-2222-222222222222",
          accountId: "acc-back-1",
          profitLoss: "50.00",
          currency: "GBP",
        },
        lay: {
          id: "33333333-3333-3333-3333-333333333333",
          accountId: null, // No account
          profitLoss: "-48.00",
          currency: "GBP",
        },
      };

      (dbQueries.getMatchedBetById as vi.Mock).mockResolvedValue(existingBet);
      (dbQueries.updateMatchedBetRecord as vi.Mock).mockResolvedValue(updatedBet);
      (dbQueries.getMatchedBetWithParts as vi.Mock).mockResolvedValue(fullBetWithParts);
      (dbQueries.createAccountTransaction as vi.Mock).mockResolvedValue({ id: "txn-1" });
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({ id: "audit-1" });

      const res = await updateMatchedRoute(
        new Request("http://localhost/api/bets/update-matched", {
          method: "PATCH",
          body: JSON.stringify({
            id: "11111111-1111-1111-1111-111111111111",
            status: "settled",
          }),
        })
      );

      expect(res.status).toBe(200);

      // Only back bet transaction created
      expect(dbQueries.createAccountTransaction).toHaveBeenCalledTimes(1);
      expect(dbQueries.createAccountTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: "acc-back-1",
          amount: 50.0,
          currency: "GBP",
        })
      );
    });
  });

  describe("quick-add route", () => {
    it("creates matched bet without screenshots", async () => {
      (dbQueries.createManualScreenshot as vi.Mock).mockResolvedValueOnce({
        id: "manual-back-1",
      });
      (dbQueries.createManualScreenshot as vi.Mock).mockResolvedValueOnce({
        id: "manual-lay-1",
      });
      (dbQueries.getOrCreateAccount as vi.Mock).mockResolvedValueOnce({
        id: "acc-back",
      });
      (dbQueries.getOrCreateAccount as vi.Mock).mockResolvedValueOnce({
        id: "acc-lay",
      });
      (dbQueries.saveBackBet as vi.Mock).mockResolvedValue({ id: "bb1" });
      (dbQueries.saveLayBet as vi.Mock).mockResolvedValue({ id: "lb1" });
      (dbQueries.createMatchedBetRecord as vi.Mock).mockResolvedValue({
        id: "mb1",
        status: "matched",
      });
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({ id: "audit-1" });

      const payload = {
        market: "Premier League",
        selection: "Arsenal to Win",
        promoType: "Free Bet",
        back: {
          odds: 2.5,
          stake: 100,
          bookmaker: "bet365",
          currency: "NOK",
        },
        lay: {
          odds: 2.52,
          stake: 99.2,
          exchange: "bfb247",
          currency: "NOK",
        },
        notes: "Test bet",
      };

      const res = await quickAddRoute(
        new Request("http://localhost/api/bets/quick-add", {
          method: "POST",
          body: JSON.stringify(payload),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.matched.id).toBe("mb1");

      // Verify manual screenshots were created
      expect(dbQueries.createManualScreenshot).toHaveBeenCalledTimes(2);
      expect(dbQueries.createManualScreenshot).toHaveBeenCalledWith({
        userId: user.id,
        kind: "back",
      });
      expect(dbQueries.createManualScreenshot).toHaveBeenCalledWith({
        userId: user.id,
        kind: "lay",
      });

      // Verify bets were saved with manual screenshot IDs
      expect(dbQueries.saveBackBet).toHaveBeenCalledWith(
        expect.objectContaining({
          screenshotId: "manual-back-1",
          odds: 2.5,
          stake: 100,
          status: "matched",
        })
      );
      expect(dbQueries.saveLayBet).toHaveBeenCalledWith(
        expect.objectContaining({
          screenshotId: "manual-lay-1",
          odds: 2.52,
          stake: 99.2,
          status: "matched",
        })
      );

      // Verify promo was resolved
      expect(dbQueries.getOrCreatePromoByType).toHaveBeenCalledWith({
        userId: user.id,
        type: "Free Bet",
      });

      // Verify matched bet was created with "matched" status
      expect(dbQueries.createMatchedBetRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "matched",
          notes: expect.stringContaining("[Manual Entry]"),
        })
      );

      // Verify audit entries were created
      expect(dbQueries.createAuditEntry).toHaveBeenCalledTimes(3);
    });

    it("rejects invalid payload with missing required fields", async () => {
      const payload = {
        market: "",
        selection: "Arsenal",
        back: {
          odds: 2.5,
          stake: 100,
          bookmaker: "bet365",
        },
        lay: {
          odds: 2.52,
          stake: 99.2,
        },
      };

      const res = await quickAddRoute(
        new Request("http://localhost/api/bets/quick-add", {
          method: "POST",
          body: JSON.stringify(payload),
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid payload");
      expect(json.details).toBeDefined();
    });

    it("rejects unauthenticated requests", async () => {
      (authModule.auth as vi.Mock).mockResolvedValueOnce(null);

      const payload = {
        market: "Premier League",
        selection: "Arsenal",
        back: { odds: 2.5, stake: 100, bookmaker: "bet365" },
        lay: { odds: 2.52, stake: 99.2, exchange: "bfb247" },
      };

      const res = await quickAddRoute(
        new Request("http://localhost/api/bets/quick-add", {
          method: "POST",
          body: JSON.stringify(payload),
        })
      );

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("marks free bet as used when freeBetId is provided", async () => {
      // Setup mocks
      (dbQueries.createManualScreenshot as vi.Mock).mockResolvedValueOnce({
        id: "manual-back-1",
      });
      (dbQueries.createManualScreenshot as vi.Mock).mockResolvedValueOnce({
        id: "manual-lay-1",
      });
      (dbQueries.getOrCreateAccount as vi.Mock).mockResolvedValueOnce({
        id: "acc-back",
      });
      (dbQueries.getOrCreateAccount as vi.Mock).mockResolvedValueOnce({
        id: "acc-lay",
      });
      (dbQueries.saveBackBet as vi.Mock).mockResolvedValue({ id: "bb1" });
      (dbQueries.saveLayBet as vi.Mock).mockResolvedValue({ id: "lb1" });
      (dbQueries.createMatchedBetRecord as vi.Mock).mockResolvedValue({
        id: "mb1",
        status: "matched",
      });
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({ id: "audit-1" });
      (dbQueries.markFreeBetAsUsed as vi.Mock).mockResolvedValue({ success: true });

      const freeBetId = "123e4567-e89b-12d3-a456-426614174000";
      const payload = {
        market: "Premier League",
        selection: "Arsenal to Win",
        promoType: "Free Bet",
        freeBetId,
        back: {
          odds: 2.5,
          stake: 100,
          bookmaker: "bet365",
          currency: "NOK",
        },
        lay: {
          odds: 2.52,
          stake: 99.2,
          exchange: "bfb247",
          currency: "NOK",
        },
      };

      const res = await quickAddRoute(
        new Request("http://localhost/api/bets/quick-add", {
          method: "POST",
          body: JSON.stringify(payload),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.freeBetUsed).toBe(true);

      // Verify markFreeBetAsUsed was called with correct params
      expect(dbQueries.markFreeBetAsUsed).toHaveBeenCalledWith({
        id: freeBetId,
        userId: user.id,
        matchedBetId: "mb1",
      });

      // Verify audit entry includes freeBetId
      expect(dbQueries.createAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "matched_bet",
          changes: expect.objectContaining({
            freeBetId,
          }),
        })
      );
    });

    it("does not call markFreeBetAsUsed when freeBetId is not provided", async () => {
      // Setup mocks
      (dbQueries.createManualScreenshot as vi.Mock).mockResolvedValueOnce({
        id: "manual-back-1",
      });
      (dbQueries.createManualScreenshot as vi.Mock).mockResolvedValueOnce({
        id: "manual-lay-1",
      });
      (dbQueries.getOrCreateAccount as vi.Mock).mockResolvedValueOnce({
        id: "acc-back",
      });
      (dbQueries.getOrCreateAccount as vi.Mock).mockResolvedValueOnce({
        id: "acc-lay",
      });
      (dbQueries.saveBackBet as vi.Mock).mockResolvedValue({ id: "bb1" });
      (dbQueries.saveLayBet as vi.Mock).mockResolvedValue({ id: "lb1" });
      (dbQueries.createMatchedBetRecord as vi.Mock).mockResolvedValue({
        id: "mb1",
        status: "matched",
      });
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({ id: "audit-1" });

      const payload = {
        market: "Premier League",
        selection: "Arsenal to Win",
        promoType: "Free Bet",
        back: {
          odds: 2.5,
          stake: 100,
          bookmaker: "bet365",
          currency: "NOK",
        },
        lay: {
          odds: 2.52,
          stake: 99.2,
          exchange: "bfb247",
          currency: "NOK",
        },
      };

      const res = await quickAddRoute(
        new Request("http://localhost/api/bets/quick-add", {
          method: "POST",
          body: JSON.stringify(payload),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.freeBetUsed).toBe(false);

      // Verify markFreeBetAsUsed was NOT called
      expect(dbQueries.markFreeBetAsUsed).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/bets/standalone", () => {
    it("creates a standalone back bet with status placed", async () => {
      const accountId = "11111111-1111-1111-1111-111111111111";
      (dbQueries.createManualScreenshot as vi.Mock).mockResolvedValue({
        id: "screenshot-1",
      });
      (dbQueries.getAccountById as vi.Mock).mockResolvedValue({
        id: accountId,
        name: "bet365",
        kind: "bookmaker",
      });
      (dbQueries.saveBackBet as vi.Mock).mockResolvedValue({
        id: "bet-1",
        market: "Man Utd v Liverpool",
        selection: "Man Utd",
        odds: "2.50",
        stake: "100.00",
        status: "placed",
        currency: "NOK",
        placedAt: new Date(),
        createdAt: new Date(),
        accountId: "acc-1",
      });
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({
        id: "audit-1",
      });

      const payload = {
        kind: "back",
        market: "Man Utd v Liverpool",
        selection: "Man Utd",
        odds: 2.5,
        stake: 100,
        accountId,
        currency: "NOK",
      };

      const res = await standaloneRoute(
        new Request("http://localhost/api/bets/standalone", {
          method: "POST",
          body: JSON.stringify(payload),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.bet.kind).toBe("back");
      expect(json.bet.status).toBe("placed");
      expect(dbQueries.saveBackBet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "placed",
        })
      );
      expect(dbQueries.createAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "back_bet",
          action: "create",
          changes: expect.objectContaining({
            source: "standalone",
          }),
        })
      );
    });

    it("creates a standalone lay bet", async () => {
      (dbQueries.createManualScreenshot as vi.Mock).mockResolvedValue({
        id: "screenshot-2",
      });
      (dbQueries.getOrCreateAccount as vi.Mock).mockResolvedValue({
        id: "acc-2",
      });
      (dbQueries.saveLayBet as vi.Mock).mockResolvedValue({
        id: "bet-2",
        market: "Man Utd v Liverpool",
        selection: "Man Utd",
        odds: "2.52",
        stake: "99.20",
        status: "placed",
        currency: "NOK",
        placedAt: new Date(),
        createdAt: new Date(),
        accountId: "acc-2",
      });
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({
        id: "audit-2",
      });

      const payload = {
        kind: "lay",
        market: "Man Utd v Liverpool",
        selection: "Man Utd",
        odds: 2.52,
        stake: 99.2,
        account: "bfb247",
        currency: "NOK",
      };

      const res = await standaloneRoute(
        new Request("http://localhost/api/bets/standalone", {
          method: "POST",
          body: JSON.stringify(payload),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.bet.kind).toBe("lay");
      expect(dbQueries.saveLayBet).toHaveBeenCalled();
      expect(dbQueries.createAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "lay_bet",
        })
      );
    });

    it("rejects invalid payload (missing required fields)", async () => {
      const payload = {
        kind: "back",
        // Missing market, selection, odds, stake, account
      };

      const res = await standaloneRoute(
        new Request("http://localhost/api/bets/standalone", {
          method: "POST",
          body: JSON.stringify(payload),
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid payload");
    });

    it("rejects unauthenticated requests", async () => {
      (authModule.auth as vi.Mock).mockResolvedValue(null);

      const payload = {
        kind: "back",
        market: "Man Utd v Liverpool",
        selection: "Man Utd",
        odds: 2.5,
        stake: 100,
        account: "bet365",
      };

      const res = await standaloneRoute(
        new Request("http://localhost/api/bets/standalone", {
          method: "POST",
          body: JSON.stringify(payload),
        })
      );

      expect(res.status).toBe(401);
    });

    it("rejects invalid bet kind", async () => {
      const payload = {
        kind: "invalid",
        market: "Man Utd v Liverpool",
        selection: "Man Utd",
        odds: 2.5,
        stake: 100,
        account: "bet365",
      };

      const res = await standaloneRoute(
        new Request("http://localhost/api/bets/standalone", {
          method: "POST",
          body: JSON.stringify(payload),
        })
      );

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/bets/individual/update", () => {
    it("updates a back bet and recomputes matched set net exposure", async () => {
      const betId = "22222222-2222-2222-2222-222222222222";
      const accountId = "33333333-3333-3333-3333-333333333333";

      (dbQueries.getBackBetById as vi.Mock).mockResolvedValue({
        id: betId,
        status: "placed",
        market: "Old market",
        selection: "Old selection",
        odds: "2.00",
        stake: "100.00",
        accountId: "acc-1",
        currency: "NOK",
        placedAt: new Date(),
      });
      (dbQueries.getAccountById as vi.Mock).mockResolvedValue({
        id: accountId,
        name: "Bet365",
        kind: "bookmaker",
      });
      (dbQueries.updateBackBetDetails as vi.Mock).mockResolvedValue({
        id: betId,
        status: "placed",
        market: "New market",
        selection: "New selection",
        odds: "2.50",
        stake: "120.00",
        accountId,
        currency: "NOK",
        placedAt: new Date(),
      });
      (dbQueries.getMatchedBetByLegId as vi.Mock).mockResolvedValue({
        id: "44444444-4444-4444-4444-444444444444",
        backBetId: betId,
        layBetId: "55555555-5555-5555-5555-555555555555",
        netExposure: "100.00",
      });
      (dbQueries.getLayBetById as vi.Mock).mockResolvedValue({
        id: "55555555-5555-5555-5555-555555555555",
        odds: "2.20",
        stake: "110.00",
        currency: "NOK",
      });
      (dbQueries.updateMatchedBetRecord as vi.Mock).mockResolvedValue({
        id: "44444444-4444-4444-4444-444444444444",
      });
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({
        id: "audit-1",
      });

      const res = await updateIndividualRoute(
        new Request("http://localhost/api/bets/individual/update", {
          method: "POST",
          body: JSON.stringify({
            betId,
            betKind: "back",
            market: "New market",
            selection: "New selection",
            odds: 2.5,
            stake: 120,
            accountId,
            currency: "NOK",
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(dbQueries.updateBackBetDetails).toHaveBeenCalled();
      expect(dbQueries.updateMatchedBetRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "44444444-4444-4444-4444-444444444444",
          netExposure: -48,
        })
      );
    });

    it("rejects edits to settled bets", async () => {
      (dbQueries.getBackBetById as vi.Mock).mockResolvedValue({
        id: "66666666-6666-6666-6666-666666666666",
        status: "settled",
      });

      const res = await updateIndividualRoute(
        new Request("http://localhost/api/bets/individual/update", {
          method: "POST",
          body: JSON.stringify({
            betId: "66666666-6666-6666-6666-666666666666",
            betKind: "back",
            market: "New market",
            selection: "New selection",
            odds: 2.5,
            stake: 120,
            accountId: "77777777-7777-7777-7777-777777777777",
            currency: "NOK",
          }),
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Settled bets cannot be edited");
    });

    it("rejects account kind mismatch", async () => {
      (dbQueries.getBackBetById as vi.Mock).mockResolvedValue({
        id: "88888888-8888-8888-8888-888888888888",
        status: "placed",
        odds: "2.10",
        stake: "100.00",
      });
      (dbQueries.getAccountById as vi.Mock).mockResolvedValue({
        id: "99999999-9999-9999-9999-999999999999",
        name: "Betfair",
        kind: "exchange",
      });

      const res = await updateIndividualRoute(
        new Request("http://localhost/api/bets/individual/update", {
          method: "POST",
          body: JSON.stringify({
            betId: "88888888-8888-8888-8888-888888888888",
            betKind: "back",
            market: "New market",
            selection: "New selection",
            odds: 2.5,
            stake: 120,
            accountId: "99999999-9999-9999-9999-999999999999",
            currency: "NOK",
          }),
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Account type does not match bet kind");
    });
  });

  describe("POST /api/bets/settle", () => {
    it("settles a back bet with won outcome and calculates P&L correctly", async () => {
      const betId = "11111111-1111-1111-1111-111111111111";
      const odds = 2.5;
      const stake = 100;
      
      (dbQueries.getBackBetById as vi.Mock).mockResolvedValue({
        id: betId,
        status: "placed",
        odds: odds.toString(),
        stake: stake.toString(),
        currency: "NOK",
        accountId: "acc-1",
        market: "Man Utd v Liverpool",
        selection: "Man Utd",
      });
      (dbQueries.updateBackBet as vi.Mock).mockResolvedValue({
        id: betId,
        status: "settled",
      });
      (dbQueries.createAccountTransaction as vi.Mock).mockResolvedValue({
        id: "txn-1",
      });
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({
        id: "audit-1",
      });

      const res = await settleRoute(
        new Request("http://localhost/api/bets/settle", {
          method: "POST",
          body: JSON.stringify({
            betId,
            betKind: "back",
            outcome: "won",
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      // Back bet won: P&L = stake × (odds - 1) = 100 × 1.5 = 150
      expect(json.bet.profitLoss).toBe(150);
      expect(json.bet.outcome).toBe("won");

      // Verify bet was updated
      expect(dbQueries.updateBackBet).toHaveBeenCalledWith(
        expect.objectContaining({
          id: betId,
          status: "settled",
          profitLoss: "150",
        })
      );

      // Verify account transaction was created
      expect(dbQueries.createAccountTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: "acc-1",
          type: "adjustment",
          amount: 150,
        })
      );

      // Verify audit entry was created
      expect(dbQueries.createAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "back_bet",
          action: "manual_settle",
          changes: expect.objectContaining({
            outcome: "won",
            profitLoss: 150,
          }),
        })
      );
    });

    it("marks linked matched bet settled when both legs are settled", async () => {
      const betId = "11111111-aaaa-bbbb-cccc-111111111111";
      const layBetId = "22222222-aaaa-bbbb-cccc-222222222222";
      const matchedBetId = "33333333-aaaa-bbbb-cccc-333333333333";

      (dbQueries.getBackBetById as vi.Mock).mockResolvedValue({
        id: betId,
        status: "placed",
        odds: "2.0",
        stake: "50",
        currency: "NOK",
        accountId: "acc-1",
        market: "Man Utd v Liverpool",
        selection: "Man Utd",
      });
      (dbQueries.getMatchedBetByLegId as vi.Mock).mockResolvedValue({
        id: matchedBetId,
        status: "matched",
        backBetId: betId,
        layBetId,
      });
      (dbQueries.getLayBetById as vi.Mock).mockResolvedValue({
        id: layBetId,
        status: "settled",
      });
      (dbQueries.updateBackBet as vi.Mock).mockResolvedValue({
        id: betId,
        status: "settled",
      });
      (dbQueries.createAccountTransaction as vi.Mock).mockResolvedValue({
        id: "txn-1",
      });
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({
        id: "audit-1",
      });
      (dbQueries.updateMatchedBetRecord as vi.Mock).mockResolvedValue({
        id: matchedBetId,
        status: "settled",
      });

      const res = await settleRoute(
        new Request("http://localhost/api/bets/settle", {
          method: "POST",
          body: JSON.stringify({
            betId,
            betKind: "back",
            outcome: "won",
          }),
        })
      );

      expect(res.status).toBe(200);
      expect(dbQueries.updateMatchedBetRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          id: matchedBetId,
          status: "settled",
        })
      );
      expect(dbQueries.createAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "matched_bet",
          action: "status_change",
          changes: {
            status: { from: "matched", to: "settled" },
          },
        })
      );
    });

    it("settles a free bet back bet loss without charging stake", async () => {
      const betId = "11111111-2222-3333-4444-555555555555";
      const odds = 3.0;
      const stake = 10;

      (dbQueries.getBackBetById as vi.Mock).mockResolvedValue({
        id: betId,
        status: "placed",
        odds: odds.toString(),
        stake: stake.toString(),
        currency: "NOK",
        accountId: "acc-free",
        market: "Man Utd v Liverpool",
        selection: "Man Utd",
      });
      (dbQueries.getMatchedBetByLegId as vi.Mock).mockResolvedValue({
        promoType: "Free Bet",
      });
      (dbQueries.updateBackBet as vi.Mock).mockResolvedValue({
        id: betId,
        status: "settled",
      });
      (dbQueries.createAccountTransaction as vi.Mock).mockResolvedValue({
        id: "txn-free",
      });
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({
        id: "audit-free",
      });

      const res = await settleRoute(
        new Request("http://localhost/api/bets/settle", {
          method: "POST",
          body: JSON.stringify({
            betId,
            betKind: "back",
            outcome: "lost",
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      // Free bet loss: no real loss (free bet value), so profit/loss = 0
      expect(json.bet.profitLoss).toBe(0);
      expect(dbQueries.createAccountTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: "acc-free",
          amount: 0,
        })
      );
    });

    it("settles a back bet with lost outcome (loses stake)", async () => {
      const betId = "22222222-2222-2222-2222-222222222222";
      const stake = 50;
      
      (dbQueries.getBackBetById as vi.Mock).mockResolvedValue({
        id: betId,
        status: "placed",
        odds: "3.0",
        stake: stake.toString(),
        currency: "GBP",
        accountId: "acc-2",
        market: "Chelsea v Arsenal",
        selection: "Chelsea",
      });
      (dbQueries.updateBackBet as vi.Mock).mockResolvedValue({
        id: betId,
        status: "settled",
      });
      (dbQueries.createAccountTransaction as vi.Mock).mockResolvedValue({
        id: "txn-2",
      });
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({
        id: "audit-2",
      });

      const res = await settleRoute(
        new Request("http://localhost/api/bets/settle", {
          method: "POST",
          body: JSON.stringify({
            betId,
            betKind: "back",
            outcome: "lost",
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      // Back bet lost: P&L = -stake = -50
      expect(json.bet.profitLoss).toBe(-50);
      expect(json.bet.outcome).toBe("lost");
    });

    it("settles a lay bet with won outcome (backer lost)", async () => {
      const betId = "33333333-3333-3333-3333-333333333333";
      const layStake = 100;
      const layOdds = 2.0;
      
      (dbQueries.getLayBetById as vi.Mock).mockResolvedValue({
        id: betId,
        status: "placed",
        odds: layOdds.toString(),
        stake: layStake.toString(),
        currency: "NOK",
        accountId: "acc-3",
        market: "Man City v Spurs",
        selection: "Man City",
      });
      (dbQueries.updateLayBet as vi.Mock).mockResolvedValue({
        id: betId,
        status: "settled",
      });
      (dbQueries.createAccountTransaction as vi.Mock).mockResolvedValue({
        id: "txn-3",
      });
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({
        id: "audit-3",
      });

      const res = await settleRoute(
        new Request("http://localhost/api/bets/settle", {
          method: "POST",
          body: JSON.stringify({
            betId,
            betKind: "lay",
            outcome: "won",
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      // Lay bet won (backer lost): P&L = layStake = 100
      expect(json.bet.profitLoss).toBe(100);
    });

    it("settles with push outcome (no P&L)", async () => {
      const betId = "44444444-4444-4444-4444-444444444444";
      
      (dbQueries.getBackBetById as vi.Mock).mockResolvedValue({
        id: betId,
        status: "placed",
        odds: "2.0",
        stake: "100",
        currency: "NOK",
        accountId: "acc-4",
        market: "Draw no bet",
        selection: "Home",
      });
      (dbQueries.updateBackBet as vi.Mock).mockResolvedValue({
        id: betId,
        status: "settled",
      });
      (dbQueries.createAccountTransaction as vi.Mock).mockResolvedValue({
        id: "txn-4",
      });
      (dbQueries.createAuditEntry as vi.Mock).mockResolvedValue({
        id: "audit-4",
      });

      const res = await settleRoute(
        new Request("http://localhost/api/bets/settle", {
          method: "POST",
          body: JSON.stringify({
            betId,
            betKind: "back",
            outcome: "push",
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      // Push: P&L = 0
      expect(json.bet.profitLoss).toBe(0);
    });

    it("returns 404 when bet not found", async () => {
      (dbQueries.getBackBetById as vi.Mock).mockResolvedValue(null);

      const res = await settleRoute(
        new Request("http://localhost/api/bets/settle", {
          method: "POST",
          body: JSON.stringify({
            betId: "55555555-5555-5555-5555-555555555555",
            betKind: "back",
            outcome: "won",
          }),
        })
      );

      expect(res.status).toBe(404);
    });

    it("returns 400 when bet is already settled", async () => {
      const settledBetId = "66666666-6666-6666-6666-666666666666";
      (dbQueries.getBackBetById as vi.Mock).mockResolvedValue({
        id: settledBetId,
        status: "settled", // Already settled
        odds: "2.0",
        stake: "100",
        currency: "NOK",
      });

      const res = await settleRoute(
        new Request("http://localhost/api/bets/settle", {
          method: "POST",
          body: JSON.stringify({
            betId: settledBetId,
            betKind: "back",
            outcome: "won",
          }),
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Bet is already settled");
    });

    it("rejects invalid outcome", async () => {
      const res = await settleRoute(
        new Request("http://localhost/api/bets/settle", {
          method: "POST",
          body: JSON.stringify({
            betId: "bet-123",
            betKind: "back",
            outcome: "invalid",
          }),
        })
      );

      expect(res.status).toBe(400);
    });

    it("rejects unauthenticated requests", async () => {
      (authModule.auth as vi.Mock).mockResolvedValue(null);

      const res = await settleRoute(
        new Request("http://localhost/api/bets/settle", {
          method: "POST",
          body: JSON.stringify({
            betId: "bet-123",
            betKind: "back",
            outcome: "won",
          }),
        })
      );

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/bets/individual/delete", () => {
    it("deletes an individual bet without cascade", async () => {
      (dbQueries.deleteBet as vi.Mock).mockResolvedValue({ success: true });

      const res = await deleteIndividualRoute(
        new Request("http://localhost/api/bets/individual/delete", {
          method: "POST",
          body: JSON.stringify({
            betId: "11111111-1111-1111-1111-111111111111",
            betKind: "back",
            cascade: false,
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.cascade).toBe(false);
      expect(dbQueries.deleteBet).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "11111111-1111-1111-1111-111111111111",
          kind: "back",
        })
      );
    });

    it("cascades delete when matched bet exists", async () => {
      (dbQueries.getMatchedBetByLegId as vi.Mock).mockResolvedValue({
        id: "matched-1",
      });
      (dbQueries.deleteMatchedBet as vi.Mock).mockResolvedValue({
        success: true,
        cascade: true,
      });

      const res = await deleteIndividualRoute(
        new Request("http://localhost/api/bets/individual/delete", {
          method: "POST",
          body: JSON.stringify({
            betId: "22222222-2222-2222-2222-222222222222",
            betKind: "lay",
            cascade: true,
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.cascade).toBe(true);
      expect(dbQueries.deleteMatchedBet).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "matched-1",
          cascade: true,
        })
      );
      expect(dbQueries.deleteBet).not.toHaveBeenCalled();
    });

    it("falls back to deleting the bet when no matched bet found", async () => {
      (dbQueries.getMatchedBetByLegId as vi.Mock).mockResolvedValue(null);
      (dbQueries.deleteBet as vi.Mock).mockResolvedValue({ success: true });

      const res = await deleteIndividualRoute(
        new Request("http://localhost/api/bets/individual/delete", {
          method: "POST",
          body: JSON.stringify({
            betId: "33333333-3333-3333-3333-333333333333",
            betKind: "back",
            cascade: true,
          }),
        })
      );

      expect(res.status).toBe(200);
      expect(dbQueries.deleteBet).toHaveBeenCalled();
    });

    it("rejects unauthenticated requests", async () => {
      (authModule.auth as vi.Mock).mockResolvedValue(null);

      const res = await deleteIndividualRoute(
        new Request("http://localhost/api/bets/individual/delete", {
          method: "POST",
          body: JSON.stringify({
            betId: "44444444-4444-4444-4444-444444444444",
            betKind: "back",
          }),
        })
      );

      expect(res.status).toBe(401);
    });
  });
});
