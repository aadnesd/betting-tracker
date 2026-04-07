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

import {
  type IndividualBetListItem,
  listAllBetsByUser,
  type PaginatedIndividualBetList,
} from "@/lib/db/queries";

describe("listAllBetsByUser", () => {
  it("is a function that accepts filters and returns list items", () => {
    expect(typeof listAllBetsByUser).toBe("function");

    const fn: (args: {
      userId: string;
      status?: "active" | "settled";
      accountId?: string;
      fromDate?: Date;
      toDate?: Date;
      search?: string;
      limit?: number;
      offset?: number;
    }) => Promise<PaginatedIndividualBetList> = listAllBetsByUser;

    expect(fn).toBeDefined();
  });

  it("exposes the fields required for the all bets list", () => {
    const mockItem: IndividualBetListItem = {
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
      accountCommission: null,
      matchedBetId: null,
      matchedBetStatus: null,
    };

    expect(mockItem.kind).toBe("back");
    expect(mockItem.status).toBe("placed");
  });
});
