/**
 * Unit tests for DepositBonus and BonusQualifyingBet query contracts.
 *
 * Why: Confirms the schema/query surface for deposit bonus tracking exists
 * and is type-safe, so wagering-progress features can rely on stable APIs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue([]),
              })),
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    })),
  })),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({})),
}));

import * as dbQueries from "@/lib/db/queries";
import * as dbSchema from "@/lib/db/schema";

describe("Deposit bonus query contracts", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("exports deposit bonus tables in schema", () => {
    expect(dbSchema.depositBonus).toBeDefined();
    expect(dbSchema.bonusQualifyingBet).toBeDefined();
  });

  it("createDepositBonus accepts all required params", () => {
    expect(typeof dbQueries.createDepositBonus).toBe("function");

    const params: dbQueries.CreateDepositBonusParams = {
      userId: "user-1",
      accountId: "acct-1",
      name: "Welcome Deposit Bonus",
      depositAmount: 1000,
      bonusAmount: 1000,
      currency: "NOK",
      wageringMultiplier: 6,
      wageringBase: "deposit_plus_bonus",
      minOdds: 1.8,
      maxBetPercent: 25,
      expiresAt: new Date("2026-12-31T23:59:59Z"),
      linkedTransactionId: "txn-1",
      notes: "First deposit promo",
    };

    expect(params.wageringBase).toBe("deposit_plus_bonus");
    expect(params.wageringMultiplier).toBe(6);
  });

  it("supports wagering base variants", () => {
    const depositBase: dbQueries.CreateDepositBonusParams = {
      userId: "user-1",
      accountId: "acct-1",
      name: "Deposit base",
      depositAmount: 500,
      bonusAmount: 250,
      currency: "NOK",
      wageringMultiplier: 4,
      wageringBase: "deposit",
      minOdds: 1.8,
    };
    const bonusBase: dbQueries.CreateDepositBonusParams = {
      userId: "user-1",
      accountId: "acct-1",
      name: "Bonus base",
      depositAmount: 500,
      bonusAmount: 250,
      currency: "NOK",
      wageringMultiplier: 4,
      wageringBase: "bonus",
      minOdds: 1.8,
    };

    expect(depositBase.wageringBase).toBe("deposit");
    expect(bonusBase.wageringBase).toBe("bonus");
  });

  it("exposes CRUD query functions for deposit bonuses", () => {
    const getFn: (args: { id: string; userId: string }) => Promise<unknown> =
      dbQueries.getDepositBonusById;
    const listFn: (args: {
      userId: string;
      status?: dbQueries.DepositBonusStatus;
      limit?: number;
    }) => Promise<unknown[]> = dbQueries.listDepositBonusesByUser;
    const listActiveFn: (args: {
      accountId: string;
      userId: string;
    }) => Promise<unknown[]> = dbQueries.listActiveDepositBonusesForAccount;
    const updateFn: (
      args: dbQueries.UpdateDepositBonusParams
    ) => Promise<unknown> = dbQueries.updateDepositBonus;
    const forfeitFn: (args: {
      id: string;
      userId: string;
      reason?: string;
    }) => Promise<unknown> = dbQueries.forfeitDepositBonus;
    const deleteFn: (args: {
      id: string;
      userId: string;
    }) => Promise<unknown> = dbQueries.deleteDepositBonus;

    expect(typeof getFn).toBe("function");
    expect(typeof listFn).toBe("function");
    expect(typeof listActiveFn).toBe("function");
    expect(typeof updateFn).toBe("function");
    expect(typeof forfeitFn).toBe("function");
    expect(typeof deleteFn).toBe("function");
  });

  it("supports deposit bonus status filters", () => {
    const active: Parameters<typeof dbQueries.listDepositBonusesByUser>[0] = {
      userId: "user-1",
      status: "active",
    };
    const cleared: Parameters<typeof dbQueries.listDepositBonusesByUser>[0] = {
      userId: "user-1",
      status: "cleared",
    };
    const forfeited: Parameters<typeof dbQueries.listDepositBonusesByUser>[0] =
      {
        userId: "user-1",
        status: "forfeited",
      };
    const expired: Parameters<typeof dbQueries.listDepositBonusesByUser>[0] = {
      userId: "user-1",
      status: "expired",
    };

    expect(active.status).toBe("active");
    expect(cleared.status).toBe("cleared");
    expect(forfeited.status).toBe("forfeited");
    expect(expired.status).toBe("expired");
  });

  it("exposes progress and qualifying bet helpers", () => {
    const updateProgressFn: (args: {
      id: string;
      userId: string;
      additionalProgress: number;
    }) => Promise<unknown> = dbQueries.updateDepositBonusProgress;
    const addQualifyingBetFn: (args: {
      depositBonusId: string;
      backBetId?: string | null;
      matchedBetId?: string | null;
      stake: number;
      odds: number;
      userId: string;
    }) => Promise<unknown> = dbQueries.addBonusQualifyingBet;
    const listQualifyingBetsFn: (args: {
      depositBonusId: string;
      limit?: number;
    }) => Promise<unknown[]> = dbQueries.listBonusQualifyingBets;
    const processOnSettleFn: (args: {
      accountId: string;
      userId: string;
      backBetId?: string | null;
      matchedBetId?: string | null;
      stake: number;
      odds: number;
      placedAt: Date;
    }) => Promise<{ bonusesUpdated: number; totalProgressAdded: number }> =
      dbQueries.processWageringProgressOnSettle;

    expect(typeof updateProgressFn).toBe("function");
    expect(typeof addQualifyingBetFn).toBe("function");
    expect(typeof listQualifyingBetsFn).toBe("function");
    expect(typeof processOnSettleFn).toBe("function");
  });
});
