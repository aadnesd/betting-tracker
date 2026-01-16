/**
 * Unit tests for individual bet listing.
 *
 * Why: Ensures the listAllBetsByUser query exposes the fields needed
 * for the /bets/all page and supports the required filters.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("drizzle-orm/postgres-js", () => {
  const chain = {
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
  };

  return {
    drizzle: vi.fn(() => ({
      select: vi.fn(() => ({
        from: vi.fn(() => chain),
      })),
    })),
  };
});

vi.mock("postgres", () => ({
  default: vi.fn(() => ({})),
}));

import * as dbQueries from "@/lib/db/queries";

describe("listAllBetsByUser", () => {
  it("is a function that accepts filters and returns list items", () => {
    expect(typeof dbQueries.listAllBetsByUser).toBe("function");

    const fn: (args: {
      userId: string;
      status?: "placed" | "settled";
      accountId?: string;
      fromDate?: Date;
      toDate?: Date;
      search?: string;
      limit?: number;
    }) => Promise<dbQueries.IndividualBetListItem[]> =
      dbQueries.listAllBetsByUser;

    expect(fn).toBeDefined();
  });

  it("exposes the fields required for the all bets list", () => {
    const mockItem: dbQueries.IndividualBetListItem = {
      id: "bet-1",
      kind: "back",
      market: "Match Odds",
      selection: "Home",
      odds: 2.1,
      stake: 100,
      status: "placed",
      currency: "NOK",
      placedAt: new Date(),
      createdAt: new Date(),
      settledAt: null,
      profitLoss: null,
      exchange: "Bet365",
      accountId: "acct-1",
      accountName: "Bet365",
      accountKind: "bookmaker",
      matchedBetId: null,
      matchedBetStatus: null,
    };

    expect(mockItem.kind).toBe("back");
    expect(mockItem.status).toBe("placed");
  });
});
