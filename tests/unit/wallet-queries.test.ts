/**
 * Unit tests for wallet balance and listing queries.
 *
 * Why: Wallet API endpoints are latency-sensitive; balance aggregation should
 * happen in SQL and return numeric values for UI rendering and calculations.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        groupBy: vi.fn(() => ({
          as: vi.fn(() => ({ balance: "balance", walletId: "walletId" })),
        })),
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn().mockResolvedValue([
              {
                id: "wallet-1",
                createdAt: new Date("2026-01-01"),
                userId: "user-1",
                name: "Revolut",
                type: "fiat",
                currency: "NOK",
                notes: null,
                status: "active",
                balance: "1250.50",
              },
              {
                id: "wallet-2",
                createdAt: new Date("2026-01-02"),
                userId: "user-1",
                name: "MetaMask",
                type: "crypto",
                currency: "USDT",
                notes: "Ledger backup",
                status: "active",
                balance: "200.00",
              },
            ]),
          })),
        })),
        where: vi.fn().mockResolvedValue([{ balance: "250.00" }]),
      })),
    })),
  })),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({})),
}));

import * as dbQueries from "@/lib/db/queries";

describe("wallet balance queries", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("calculateWalletBalance", () => {
    it("returns a numeric balance from aggregated transactions", async () => {
      const balance = await dbQueries.calculateWalletBalance("wallet-1");
      expect(balance).toBe(250);
      expect(typeof balance).toBe("number");
    });
  });

  describe("listWalletsByUser", () => {
    it("returns wallets with numeric balances", async () => {
      const wallets = await dbQueries.listWalletsByUser("user-1");
      expect(wallets).toHaveLength(2);
      expect(wallets[0]?.balance).toBe(1250.5);
      expect(wallets[1]?.balance).toBe(200);
    });

    it("returns WalletWithBalance fields needed by the wallets UI", () => {
      type CheckFields = dbQueries.WalletWithBalance extends {
        id: string;
        name: string;
        type: "fiat" | "crypto" | "hybrid";
        currency: string;
        status: "active" | "archived";
        balance: number;
      }
        ? true
        : false;

      const check: CheckFields = true;
      expect(check).toBe(true);
    });
  });
});
