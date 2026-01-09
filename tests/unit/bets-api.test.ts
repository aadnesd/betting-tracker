import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST as screenshotsRoute } from "@/app/(chat)/api/bets/screenshots/route";
import { POST as autoparseRoute } from "@/app/(chat)/api/bets/autoparse/route";
import { POST as createMatchedRoute } from "@/app/(chat)/api/bets/create-matched/route";
import { PATCH as updateMatchedRoute } from "@/app/(chat)/api/bets/update-matched/route";
import { POST as quickAddRoute } from "@/app/(chat)/api/bets/quick-add/route";
import * as authModule from "@/app/(auth)/auth";
import * as dbQueries from "@/lib/db/queries";
import { parseMatchedBetFromScreenshots } from "@/lib/bet-parser";
import { convertAmountToNok } from "@/lib/fx-rates";

vi.mock("@/lib/ai/providers", () => ({
  myProvider: {
    languageModel: () => ({}),
  },
}));

vi.mock("@/lib/bet-parser", () => ({
  parseMatchedBetFromScreenshots: vi.fn(),
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
}));

const makeBlob = (content = "stub") =>
  new Blob([content], { type: "image/png" });

describe("bets API routes (unit)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (authModule.auth as vi.Mock).mockResolvedValue({ user });
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
        parsedOutput: parsedPair.back,
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
  });
});
