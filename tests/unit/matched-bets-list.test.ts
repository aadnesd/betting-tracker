/**
 * Unit tests for matched bet list query.
 *
 * Why: The matched bets list page relies on normalized numeric values and
 * null-safe leg/match handling so the UI can render expandable details without
 * runtime errors or incorrect formatting.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const mockLimit = vi.fn().mockResolvedValue([
  {
    id: "bet-1",
    market: "Premier League",
    selection: "Arsenal",
    status: "matched",
    promoType: "Free Bet",
    netExposure: "125.50",
    createdAt: new Date("2026-01-20T10:00:00Z"),
    notes: "Needs lay confirmation",
    back: {
      id: "back-1",
      odds: "2.40",
      stake: "100.00",
      exchange: "Bet365",
      currency: "NOK",
      status: "placed",
      placedAt: new Date("2026-01-20T09:00:00Z"),
      profitLoss: null,
      accountId: "account-1",
      accountName: "Bet365",
    },
    lay: {
      id: "lay-1",
      odds: "2.52",
      stake: "92.00",
      exchange: "Betfair",
      currency: "NOK",
      status: "placed",
      placedAt: new Date("2026-01-20T09:05:00Z"),
      profitLoss: "12.50",
      accountId: "account-2",
      accountName: "Betfair",
    },
    footballMatch: {
      id: "match-1",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      competition: "Premier League",
      matchDate: new Date("2026-01-21T18:00:00Z"),
      status: "SCHEDULED",
      homeScore: null,
      awayScore: null,
    },
  },
  {
    id: "bet-2",
    market: "Serie A",
    selection: "Roma",
    status: "draft",
    promoType: null,
    netExposure: null,
    createdAt: new Date("2026-01-18T10:00:00Z"),
    notes: null,
    back: {
      id: null,
      odds: null,
      stake: null,
      exchange: null,
      currency: null,
      status: null,
      placedAt: null,
      profitLoss: null,
      accountId: null,
      accountName: null,
    },
    lay: {
      id: null,
      odds: null,
      stake: null,
      exchange: null,
      currency: null,
      status: null,
      placedAt: null,
      profitLoss: null,
      accountId: null,
      accountName: null,
    },
    footballMatch: {
      id: null,
      homeTeam: null,
      awayTeam: null,
      competition: null,
      matchDate: null,
      status: null,
      homeScore: null,
      awayScore: null,
    },
  },
  ]);

  const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
  const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
  const mockLeftJoin = vi.fn(() => ({
    leftJoin: mockLeftJoin,
    where: mockWhere,
  }));
  const mockFrom = vi.fn(() => ({
    leftJoin: mockLeftJoin,
    where: mockWhere,
  }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  return { mockSelect };
});

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({
    select: mocks.mockSelect,
  })),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({})),
}));

import * as dbQueries from "@/lib/db/queries";

describe("listMatchedBetsForList", () => {
  it("normalizes numeric fields and handles null legs", async () => {
    const results = await dbQueries.listMatchedBetsForList({
      userId: "user-1",
    });

    expect(results).toHaveLength(2);
    expect(results[0].netExposure).toBe(125.5);
    expect(results[0].back?.odds).toBeCloseTo(2.4, 5);
    expect(results[0].back?.stake).toBe(100);
    expect(results[0].lay?.profitLoss).toBe(12.5);
    expect(results[0].footballMatch?.competition).toBe("Premier League");

    expect(results[1].back).toBeNull();
    expect(results[1].lay).toBeNull();
    expect(results[1].footballMatch).toBeNull();
  });
});
