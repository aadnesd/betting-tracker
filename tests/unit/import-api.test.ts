import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authModule from "@/app/(auth)/auth";
import { POST as importRoute } from "@/app/(chat)/api/bets/import/route";
import * as csvModule from "@/lib/csv";
import * as dbQueries from "@/lib/db/queries";

vi.mock("@/app/(auth)/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/csv", () => ({
  parseBetsCsv: vi.fn(),
  parseBalancesCsv: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  createBetForImport: vi.fn(),
  createScreenshotForImport: vi.fn(),
  createTransactionForImport: vi.fn(),
  findOrCreateAccount: vi.fn(),
  getOrCreateAccount: vi.fn(),
}));

const user = { id: "user-1" };

describe("bets import API (unit)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (authModule.auth as vi.Mock).mockResolvedValue({ user });
  });

  it("links imported bets to accounts based on bet kind", async () => {
    (csvModule.parseBetsCsv as vi.Mock).mockReturnValue({
      success: true,
      errors: [],
      successCount: 2,
      totalCount: 2,
      data: [
        {
          kind: "back",
          market: "Match Odds",
          selection: "Arsenal",
          odds: 2.1,
          stake: 50,
          exchange: "Bet365",
          currency: "NOK",
          placedAt: new Date("2026-01-05T10:00:00Z"),
          notes: null,
        },
        {
          kind: "lay",
          market: "Match Odds",
          selection: "Arsenal",
          odds: 2.12,
          stake: 52,
          exchange: "Betfair",
          currency: "NOK",
          placedAt: null,
          notes: null,
        },
      ],
    });

    (dbQueries.getOrCreateAccount as vi.Mock)
      .mockResolvedValueOnce({ id: "acc-back", name: "Bet365" })
      .mockResolvedValueOnce({ id: "acc-lay", name: "Betfair" });

    (dbQueries.createScreenshotForImport as vi.Mock)
      .mockResolvedValueOnce({ id: "shot-back" })
      .mockResolvedValueOnce({ id: "shot-lay" });

    const response = await importRoute(
      new Request("http://localhost/api/bets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bets", csv: "stub" }),
      })
    );

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.imported).toBe(2);
    expect(dbQueries.getOrCreateAccount).toHaveBeenCalledWith({
      userId: "user-1",
      name: "Bet365",
      kind: "bookmaker",
      currency: "NOK",
    });
    expect(dbQueries.getOrCreateAccount).toHaveBeenCalledWith({
      userId: "user-1",
      name: "Betfair",
      kind: "exchange",
      currency: "NOK",
    });

    const createCalls = (dbQueries.createBetForImport as vi.Mock).mock.calls;
    expect(createCalls).toHaveLength(2);
    expect(createCalls[0][0]).toMatchObject({
      accountId: "acc-back",
      exchange: "Bet365",
      kind: "back",
      odds: 2.1,
      stake: 50,
    });
    expect(createCalls[1][0]).toMatchObject({
      accountId: "acc-lay",
      exchange: "Betfair",
      kind: "lay",
      odds: 2.12,
      stake: 52,
    });
  });
});
