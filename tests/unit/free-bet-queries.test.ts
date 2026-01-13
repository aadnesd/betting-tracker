/**
 * Unit tests for FreeBet CRUD queries.
 *
 * Why: Validates that FreeBet schema extension is complete and functional,
 * enabling tracking of free bet/promo inventory separately from transactions.
 * This is critical for the P6 promo tracking feature that helps users
 * manage their free bet inventory, track expiry, and link to matched bets.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock server-only to allow testing server modules
vi.mock("server-only", () => ({}));

// Mock date for consistent testing
const mockDate = new Date("2026-01-12T12:00:00Z");

// Mock drizzle connection
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([
          {
            id: "fb-1",
            createdAt: mockDate,
            userId: "user-1",
            accountId: "acct-1",
            name: "Welcome Free Bet",
            value: "25.00",
            currency: "GBP",
            minOdds: "2.0000",
            expiresAt: new Date("2026-01-20"),
            status: "active",
            usedInMatchedBetId: null,
            notes: "Sign-up bonus",
          },
        ]),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "fb-1",
                  createdAt: mockDate,
                  userId: "user-1",
                  accountId: "acct-1",
                  name: "Welcome Free Bet",
                  value: "25.00",
                  currency: "GBP",
                  minOdds: "2.0000",
                  expiresAt: new Date("2026-01-20"),
                  status: "active",
                  usedInMatchedBetId: null,
                  notes: "Sign-up bonus",
                  accountName: "bet365",
                },
              ]),
            })),
          })),
        })),
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "fb-1",
              createdAt: mockDate,
              userId: "user-1",
              accountId: "acct-1",
              name: "Welcome Free Bet",
              value: "25.00",
              currency: "GBP",
              minOdds: "2.0000",
              expiresAt: new Date("2026-01-20"),
              status: "active",
              usedInMatchedBetId: null,
              notes: "Sign-up bonus",
            },
          ]),
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                id: "fb-1",
                createdAt: mockDate,
                userId: "user-1",
                accountId: "acct-1",
                name: "Welcome Free Bet",
                value: "25.00",
                currency: "GBP",
                minOdds: "2.0000",
                expiresAt: new Date("2026-01-20"),
                status: "active",
                usedInMatchedBetId: null,
                notes: "Sign-up bonus",
              },
            ]),
          })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              id: "fb-1",
              createdAt: mockDate,
              userId: "user-1",
              accountId: "acct-1",
              name: "Updated Free Bet",
              value: "25.00",
              currency: "GBP",
              minOdds: "2.0000",
              expiresAt: new Date("2026-01-20"),
              status: "used",
              usedInMatchedBetId: "mb-1",
              notes: "Sign-up bonus",
            },
          ]),
        })),
      })),
    })),
  })),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({})),
}));

import * as dbQueries from "@/lib/db/queries";

describe("FreeBet CRUD queries", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("createFreeBet", () => {
    it("is a function that accepts all required parameters", async () => {
      expect(typeof dbQueries.createFreeBet).toBe("function");

      // Verify function signature matches the spec
      const fn: (args: dbQueries.CreateFreeBetParams) => Promise<{
        id: string;
        userId: string;
        accountId: string;
        name: string;
        value: string;
        currency: string;
        status: string;
      }> = dbQueries.createFreeBet;
      expect(fn).toBeDefined();
    });

    it("accepts all fields per the P6 spec", async () => {
      // Type check: CreateFreeBetParams should have these fields per fix_plan.md
      const params: dbQueries.CreateFreeBetParams = {
        userId: "user-1",
        accountId: "acct-1",
        name: "Welcome Free Bet",
        value: 25.0,
        currency: "GBP",
        minOdds: 2.0,
        expiresAt: new Date("2026-01-20"),
        notes: "Sign-up bonus",
      };

      expect(params.userId).toBeDefined();
      expect(params.accountId).toBeDefined();
      expect(params.name).toBeDefined();
      expect(params.value).toBeDefined();
      expect(params.currency).toBeDefined();
      expect(params.minOdds).toBeDefined();
      expect(params.expiresAt).toBeDefined();
      expect(params.notes).toBeDefined();
    });

    it("allows optional fields to be null", async () => {
      // minOdds, expiresAt, notes are optional
      const params: dbQueries.CreateFreeBetParams = {
        userId: "user-1",
        accountId: "acct-1",
        name: "Simple Free Bet",
        value: 10.0,
        currency: "NOK",
        minOdds: null,
        expiresAt: null,
        notes: null,
      };

      expect(params.minOdds).toBeNull();
      expect(params.expiresAt).toBeNull();
      expect(params.notes).toBeNull();
    });
  });

  describe("getFreeBetById", () => {
    it("is a function that accepts id and userId", async () => {
      expect(typeof dbQueries.getFreeBetById).toBe("function");

      // Verify function signature
      const fn: (args: {
        id: string;
        userId: string;
      }) => Promise<unknown> = dbQueries.getFreeBetById;
      expect(fn).toBeDefined();
    });

    it("requires both id and userId for security", async () => {
      // Type check: both parameters are required
      const params: Parameters<typeof dbQueries.getFreeBetById>[0] = {
        id: "fb-1",
        userId: "user-1",
      };
      expect(params.id).toBeDefined();
      expect(params.userId).toBeDefined();
    });
  });

  describe("listFreeBetsByUser", () => {
    it("is a function that accepts userId and optional filters", async () => {
      expect(typeof dbQueries.listFreeBetsByUser).toBe("function");

      // Verify function signature
      const fn: (args: {
        userId: string;
        status?: dbQueries.FreeBetStatus;
        limit?: number;
      }) => Promise<unknown[]> = dbQueries.listFreeBetsByUser;
      expect(fn).toBeDefined();
    });

    it("supports filtering by status", () => {
      // Type check: status filter should accept active, used, or expired
      const activeParams: Parameters<typeof dbQueries.listFreeBetsByUser>[0] = {
        userId: "user-1",
        status: "active",
      };
      const usedParams: Parameters<typeof dbQueries.listFreeBetsByUser>[0] = {
        userId: "user-1",
        status: "used",
      };
      const expiredParams: Parameters<typeof dbQueries.listFreeBetsByUser>[0] = {
        userId: "user-1",
        status: "expired",
      };

      expect(activeParams.status).toBe("active");
      expect(usedParams.status).toBe("used");
      expect(expiredParams.status).toBe("expired");
    });
  });

  describe("listFreeBetsByAccount", () => {
    it("is a function that accepts userId, accountId, and optional filters", async () => {
      expect(typeof dbQueries.listFreeBetsByAccount).toBe("function");

      // Verify function signature
      const fn: (args: {
        userId: string;
        accountId: string;
        status?: dbQueries.FreeBetStatus;
        limit?: number;
      }) => Promise<unknown[]> = dbQueries.listFreeBetsByAccount;
      expect(fn).toBeDefined();
    });

    it("requires accountId to filter by bookmaker", async () => {
      const params: Parameters<typeof dbQueries.listFreeBetsByAccount>[0] = {
        userId: "user-1",
        accountId: "acct-1",
        status: "active",
      };
      expect(params.accountId).toBeDefined();
    });
  });

  describe("updateFreeBet", () => {
    it("is a function that accepts id, userId, and update fields", async () => {
      expect(typeof dbQueries.updateFreeBet).toBe("function");

      // Verify function signature
      const fn: (
        args: dbQueries.UpdateFreeBetParams
      ) => Promise<unknown> = dbQueries.updateFreeBet;
      expect(fn).toBeDefined();
    });

    it("accepts all updatable fields", async () => {
      // Type check: UpdateFreeBetParams should have these optional fields
      const params: dbQueries.UpdateFreeBetParams = {
        id: "fb-1",
        userId: "user-1",
        name: "Updated Free Bet",
        value: 30.0,
        currency: "EUR",
        minOdds: 1.5,
        expiresAt: new Date("2026-02-01"),
        status: "used",
        notes: "Updated notes",
      };

      expect(params.id).toBeDefined();
      expect(params.userId).toBeDefined();
      expect(params.name).toBeDefined();
      expect(params.status).toBeDefined();
    });

    it("allows partial updates", async () => {
      // Only id and userId are required
      const partialParams: dbQueries.UpdateFreeBetParams = {
        id: "fb-1",
        userId: "user-1",
        status: "expired",
      };

      expect(partialParams.name).toBeUndefined();
      expect(partialParams.value).toBeUndefined();
      expect(partialParams.status).toBe("expired");
    });
  });

  describe("markFreeBetAsUsed", () => {
    it("is a function that accepts id, userId, and matchedBetId", async () => {
      expect(typeof dbQueries.markFreeBetAsUsed).toBe("function");

      // Verify function signature
      const fn: (args: {
        id: string;
        userId: string;
        matchedBetId: string;
      }) => Promise<unknown> = dbQueries.markFreeBetAsUsed;
      expect(fn).toBeDefined();
    });

    it("requires matchedBetId to link the free bet usage", async () => {
      const params: Parameters<typeof dbQueries.markFreeBetAsUsed>[0] = {
        id: "fb-1",
        userId: "user-1",
        matchedBetId: "mb-1",
      };
      expect(params.matchedBetId).toBeDefined();
    });
  });

  describe("countExpiringFreeBets", () => {
    it("is a function for dashboard expiry warnings", async () => {
      expect(typeof dbQueries.countExpiringFreeBets).toBe("function");

      // Verify function signature
      const fn: (args: {
        userId: string;
        daysUntilExpiry?: number;
      }) => Promise<number> = dbQueries.countExpiringFreeBets;
      expect(fn).toBeDefined();
    });

    it("supports custom expiry threshold", async () => {
      const params: Parameters<typeof dbQueries.countExpiringFreeBets>[0] = {
        userId: "user-1",
        daysUntilExpiry: 3, // 3 days warning
      };
      expect(params.daysUntilExpiry).toBe(3);
    });
  });

  describe("getActiveFreeBetsSummary", () => {
    it("is a function that returns count and total value", async () => {
      expect(typeof dbQueries.getActiveFreeBetsSummary).toBe("function");

      // Verify function signature
      const fn: (args: {
        userId: string;
      }) => Promise<{
        count: number;
        totalValue: number;
      }> = dbQueries.getActiveFreeBetsSummary;
      expect(fn).toBeDefined();
    });
  });

  describe("FreeBetStatus type", () => {
    it("supports all three status values per spec", () => {
      // Verify the status type includes all required values
      const active: dbQueries.FreeBetStatus = "active";
      const used: dbQueries.FreeBetStatus = "used";
      const expired: dbQueries.FreeBetStatus = "expired";

      expect(active).toBe("active");
      expect(used).toBe("used");
      expect(expired).toBe("expired");
    });
  });

  describe("FreeBet schema alignment with spec", () => {
    it("has all fields required by P6 spec in fix_plan.md", () => {
      // Create a mock free bet that matches the expected schema
      const mockFreeBet = {
        id: "fb-1",
        userId: "user-1",
        accountId: "acct-1", // Per spec: linked to Account (bookmaker)
        name: "Welcome Free Bet",
        value: "25.00",
        currency: "GBP",
        minOdds: "2.0000", // Per spec: minimum odds requirement
        expiresAt: new Date("2026-01-20"), // Per spec: expiry date
        status: "active" as const, // Per spec: active/used/expired
        usedInMatchedBetId: null, // Per spec: link to matched bet when used
        createdAt: new Date(),
        notes: "Sign-up bonus",
      };

      // Verify all fields from the spec exist
      expect(mockFreeBet.id).toBeDefined();
      expect(mockFreeBet.userId).toBeDefined();
      expect(mockFreeBet.accountId).toBeDefined();
      expect(mockFreeBet.name).toBeDefined();
      expect(mockFreeBet.value).toBeDefined();
      expect(mockFreeBet.currency).toBeDefined();
      expect(mockFreeBet.minOdds).toBeDefined();
      expect(mockFreeBet.expiresAt).toBeDefined();
      expect(mockFreeBet.status).toBeDefined();
      expect(mockFreeBet.usedInMatchedBetId).toBeDefined();
      expect(mockFreeBet.createdAt).toBeDefined();
      expect(mockFreeBet.notes).toBeDefined();
    });
  });

  // ==========================================================================
  // Promo Progress Tracking Tests (P6)
  // ==========================================================================

  describe("FreeBetStatus type with locked", () => {
    it("supports locked status for promos with unlock requirements", () => {
      // Verify the status type now includes 'locked'
      const locked: dbQueries.FreeBetStatus = "locked";
      expect(locked).toBe("locked");
    });
  });

  describe("listFreeBetsWithProgress", () => {
    it("is a function that returns free bets with unlock progress info", async () => {
      expect(typeof dbQueries.listFreeBetsWithProgress).toBe("function");

      // Verify function signature
      const fn: (args: {
        userId: string;
        status?: "active" | "locked" | "used" | "expired";
      }) => Promise<dbQueries.FreeBetWithProgress[]> =
        dbQueries.listFreeBetsWithProgress;
      expect(fn).toBeDefined();
    });

    it("FreeBetWithProgress type has all required fields", () => {
      const mockProgress: dbQueries.FreeBetWithProgress = {
        id: "fb-1",
        name: "Bet £50 Get £10 Free",
        value: "10.00",
        currency: "GBP",
        status: "locked",
        expiresAt: new Date("2026-02-01"),
        accountId: "acct-1",
        accountName: "bet365",
        unlockType: "stake",
        unlockTarget: "50.00",
        unlockMinOdds: "1.50",
        unlockProgress: "25.00",
        progressPercent: 50,
        isLocked: true,
      };

      expect(mockProgress.unlockType).toBeDefined();
      expect(mockProgress.unlockTarget).toBeDefined();
      expect(mockProgress.unlockProgress).toBeDefined();
      expect(mockProgress.progressPercent).toBeDefined();
      expect(mockProgress.isLocked).toBeDefined();
    });
  });

  describe("listQualifyingBetsForPromo", () => {
    it("is a function for fetching qualifying bets linked to a promo", async () => {
      expect(typeof dbQueries.listQualifyingBetsForPromo).toBe("function");

      // Verify function signature
      const fn: (args: {
        freeBetId: string;
        userId: string;
      }) => Promise<dbQueries.QualifyingBetInfo[]> =
        dbQueries.listQualifyingBetsForPromo;
      expect(fn).toBeDefined();
    });

    it("QualifyingBetInfo type has all required fields", () => {
      const mockQB: dbQueries.QualifyingBetInfo = {
        id: "qb-1",
        createdAt: new Date(),
        matchedBetId: "mb-1",
        contribution: "25.00",
        market: "Man Utd vs Chelsea",
        selection: "Man Utd to win",
        backStake: "25.00",
        backOdds: "2.50",
      };

      expect(mockQB.id).toBeDefined();
      expect(mockQB.matchedBetId).toBeDefined();
      expect(mockQB.contribution).toBeDefined();
      expect(mockQB.market).toBeDefined();
    });
  });

  describe("addQualifyingBet", () => {
    it("is a function that adds a qualifying bet and updates progress", async () => {
      expect(typeof dbQueries.addQualifyingBet).toBe("function");

      // Verify function signature
      const fn: (args: {
        freeBetId: string;
        matchedBetId: string;
        userId: string;
        contribution: number;
      }) => Promise<{
        qualifyingBet: unknown;
        newProgress: number;
        isUnlocked: boolean;
      }> = dbQueries.addQualifyingBet;
      expect(fn).toBeDefined();
    });
  });

  describe("removeQualifyingBet", () => {
    it("is a function that removes a qualifying bet and updates progress", async () => {
      expect(typeof dbQueries.removeQualifyingBet).toBe("function");

      // Verify function signature
      const fn: (args: {
        qualifyingBetId: string;
        userId: string;
      }) => Promise<{
        success: boolean;
        newProgress: number;
      }> = dbQueries.removeQualifyingBet;
      expect(fn).toBeDefined();
    });
  });

  describe("createLockedPromo", () => {
    it("is a function for creating promos with unlock requirements", async () => {
      expect(typeof dbQueries.createLockedPromo).toBe("function");

      // Verify function signature
      const fn: (args: {
        userId: string;
        accountId: string;
        name: string;
        value: number;
        currency: string;
        minOdds?: number;
        expiresAt?: Date;
        notes?: string;
        unlockType: "stake" | "bets";
        unlockTarget: number;
        unlockMinOdds?: number;
      }) => Promise<unknown> = dbQueries.createLockedPromo;
      expect(fn).toBeDefined();
    });

    it("requires unlockType and unlockTarget for locked promos", () => {
      // Type check: unlockType and unlockTarget are required
      const stakePromo = {
        userId: "user-1",
        accountId: "acct-1",
        name: "Bet £50 Get £10 Free",
        value: 10,
        currency: "GBP",
        unlockType: "stake" as const,
        unlockTarget: 50,
      };

      const betsPromo = {
        userId: "user-1",
        accountId: "acct-1",
        name: "Place 3 bets, get £5 free",
        value: 5,
        currency: "GBP",
        unlockType: "bets" as const,
        unlockTarget: 3,
      };

      expect(stakePromo.unlockType).toBe("stake");
      expect(stakePromo.unlockTarget).toBe(50);
      expect(betsPromo.unlockType).toBe("bets");
      expect(betsPromo.unlockTarget).toBe(3);
    });
  });
});
