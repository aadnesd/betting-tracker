import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/cache", () => ({
  revalidateDashboard: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  activateFreeBetWageringOnWin: vi.fn(),
  applyAutoSettlement: vi.fn().mockResolvedValue({
    success: true,
    matchedBetId: "matched-1",
    transactionsCreated: 2,
  }),
  autoCompleteDepositBonusesIfEligible: vi.fn(),
  findBetsReadyForAutoSettlement: vi.fn().mockResolvedValue([]),
  findUnlinkedBetsReadyForAutoSettlement: vi.fn(),
  flagBetForReview: vi.fn(),
  getFreeBetByMatchedBetId: vi.fn().mockResolvedValue(null),
  processFreeBetWageringProgressOnSettle: vi.fn(),
  processWageringProgressOnSettle: vi.fn(),
}));

vi.mock("@/lib/unlinked-settlement-search", () => ({
  resolveUnlinkedMatchedBetResult: vi.fn(),
}));

import { POST } from "@/app/(chat)/api/cron/auto-settle/route";
import {
  applyAutoSettlement,
  findUnlinkedBetsReadyForAutoSettlement,
  flagBetForReview,
} from "@/lib/db/queries";
import { resolveUnlinkedMatchedBetResult } from "@/lib/unlinked-settlement-search";

const dummyUnlinkedBet = {
  id: "matched-1",
  userId: "dummy-user",
  market: "houston cd vancouver",
  selection: "Vancouver",
  normalizedSelection: null,
  status: "matched",
  promoType: null,
  matchId: null,
  backBetId: "back-1",
  backOdds: "2.50",
  backStake: "100.00",
  backAccountId: "bookmaker-1",
  backCurrency: "NOK",
  backBetPlacedAt: new Date("2026-05-01T12:00:00Z"),
  layBetId: "lay-1",
  layOdds: "2.54",
  layStake: "98.00",
  layAccountId: "exchange-1",
  layCurrency: "NOK",
  layAccountCommission: 0.05,
};

describe("unlinked auto-settlement cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "";
    vi.mocked(findUnlinkedBetsReadyForAutoSettlement).mockResolvedValue([
      dummyUnlinkedBet,
    ]);
  });

  it("settles a dummy fuzzy Houston/Vancouver unlinked matched set from web result lookup", async () => {
    vi.mocked(resolveUnlinkedMatchedBetResult).mockResolvedValue({
      status: "finished",
      confidence: "high",
      homeTeam: "Houston Dynamo FC",
      awayTeam: "Vancouver Whitecaps FC",
      homeScore: 1,
      awayScore: 0,
      normalizedSelection: "AWAY_TEAM",
      reason:
        "MLS match on May 16, 2026 finished Houston Dynamo FC 1-0 Vancouver Whitecaps FC.",
      sourceUrls: ["https://example.com/houston-vancouver-score"],
    });

    const response = await POST(
      new Request("http://localhost/api/cron/auto-settle")
    );
    const json = await response.json();

    expect(json.results).toMatchObject({
      processed: 1,
      settled: 1,
      flaggedForReview: 0,
      errors: 0,
    });
    expect(applyAutoSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        matchedBetId: "matched-1",
        userId: "dummy-user",
        outcome: "loss",
        backBetId: "back-1",
        layBetId: "lay-1",
        market: "houston cd vancouver",
        selection: "Vancouver",
        matchResult: expect.stringContaining(
          "Houston Dynamo FC 1-0 Vancouver Whitecaps FC"
        ),
      })
    );
    expect(applyAutoSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        matchResult: expect.stringContaining("unlinked web lookup"),
      })
    );
    expect(flagBetForReview).not.toHaveBeenCalled();
  });

  it("skips unlinked bets when web lookup is not configured", async () => {
    vi.mocked(resolveUnlinkedMatchedBetResult).mockResolvedValue({
      status: "not_configured",
      confidence: "low",
      reason: "AI_GATEWAY_API_KEY is not configured for web result lookup.",
      sourceUrls: [],
    });

    const response = await POST(
      new Request("http://localhost/api/cron/auto-settle")
    );
    const json = await response.json();

    expect(json.results).toMatchObject({
      processed: 1,
      settled: 0,
      flaggedForReview: 0,
      errors: 0,
    });
    expect(json.results.details[0]).toMatchObject({
      matchedBetId: "matched-1",
      action: "skipped",
    });
    expect(applyAutoSettlement).not.toHaveBeenCalled();
    expect(flagBetForReview).not.toHaveBeenCalled();
  });

  it("flags ambiguous unlinked result lookups for review", async () => {
    vi.mocked(resolveUnlinkedMatchedBetResult).mockResolvedValue({
      status: "ambiguous",
      confidence: "medium",
      reason: "Multiple Houston vs Vancouver matches fit the market/date.",
      sourceUrls: ["https://example.com/houston-vancouver-results"],
    });

    const response = await POST(
      new Request("http://localhost/api/cron/auto-settle")
    );
    const json = await response.json();

    expect(json.results).toMatchObject({
      processed: 1,
      settled: 0,
      flaggedForReview: 1,
      errors: 0,
    });
    expect(flagBetForReview).toHaveBeenCalledWith(
      expect.objectContaining({
        matchedBetId: "matched-1",
        userId: "dummy-user",
        reason: expect.stringContaining(
          "Unlinked result lookup could not confidently settle"
        ),
      })
    );
    expect(applyAutoSettlement).not.toHaveBeenCalled();
  });
});
