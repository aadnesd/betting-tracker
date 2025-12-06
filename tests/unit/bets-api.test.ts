import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST as screenshotsRoute } from "@/app/(chat)/api/bets/screenshots/route";
import { POST as autoparseRoute } from "@/app/(chat)/api/bets/autoparse/route";
import { POST as createMatchedRoute } from "@/app/(chat)/api/bets/create-matched/route";
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
  saveBackBet: vi.fn(),
  saveLayBet: vi.fn(),
  createMatchedBetRecord: vi.fn(),
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
    expect(json.back?.selection).toBe(json.lay?.selection);
    expect(typeof json.needsReview === "boolean").toBe(true);
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
    expect(convertAmountToNok).toHaveBeenCalled();
  });
});
