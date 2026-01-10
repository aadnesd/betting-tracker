import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import {
  POST as createTransactionRoute,
  GET as listTransactionsRoute,
} from "@/app/(chat)/api/bets/accounts/[id]/transactions/route";
import * as authModule from "@/app/(auth)/auth";
import * as dbQueries from "@/lib/db/queries";

const user = { id: "user-1" };
const testAccountId = "12345678-1234-1234-1234-123456789abc";

vi.mock("@/app/(auth)/auth", () => ({
  auth: vi.fn(),
}));

// Mock db queries
vi.mock("@/lib/db/queries", () => ({
  createAccountTransaction: vi.fn(),
  listTransactionsByAccount: vi.fn(),
  getAccountById: vi.fn(),
  createAuditEntry: vi.fn(),
}));

describe("transactions API routes (unit)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (authModule.auth as vi.Mock).mockResolvedValue({ user });
  });

  describe("POST /api/bets/accounts/[id]/transactions (create)", () => {
    it("creates a deposit transaction", async () => {
      const mockAccount = {
        id: testAccountId,
        name: "bet365",
        kind: "bookmaker",
        userId: user.id,
      };

      const mockTransaction = {
        id: "tx-1",
        accountId: testAccountId,
        type: "deposit",
        amount: "100.00",
        currency: "NOK",
        occurredAt: new Date("2025-01-10"),
        notes: "Initial deposit",
        createdAt: new Date(),
      };

      (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce(mockAccount);
      (dbQueries.createAccountTransaction as vi.Mock).mockResolvedValueOnce(
        mockTransaction
      );

      const res = await createTransactionRoute(
        new Request(
          `http://localhost/api/bets/accounts/${testAccountId}/transactions`,
          {
            method: "POST",
            body: JSON.stringify({
              type: "deposit",
              amount: 100,
              currency: "NOK",
              occurredAt: "2025-01-10T00:00:00.000Z",
              notes: "Initial deposit",
            }),
          }
        ),
        { params: Promise.resolve({ id: testAccountId }) }
      );

      expect(res).toBeInstanceOf(NextResponse);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.transaction.id).toBe("tx-1");
      expect(json.transaction.type).toBe("deposit");

      expect(dbQueries.createAccountTransaction).toHaveBeenCalledWith({
        userId: user.id,
        accountId: testAccountId,
        type: "deposit",
        amount: 100,
        currency: "NOK",
        occurredAt: expect.any(Date),
        notes: "Initial deposit",
      });

      expect(dbQueries.createAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          entityType: "account",
          entityId: testAccountId,
          action: "update",
        })
      );
    });

    it("creates a withdrawal transaction", async () => {
      const mockAccount = {
        id: testAccountId,
        name: "bet365",
        kind: "bookmaker",
        userId: user.id,
      };

      const mockTransaction = {
        id: "tx-2",
        accountId: testAccountId,
        type: "withdrawal",
        amount: "50.00",
        currency: "NOK",
        occurredAt: new Date(),
        notes: null,
        createdAt: new Date(),
      };

      (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce(mockAccount);
      (dbQueries.createAccountTransaction as vi.Mock).mockResolvedValueOnce(
        mockTransaction
      );

      const res = await createTransactionRoute(
        new Request(
          `http://localhost/api/bets/accounts/${testAccountId}/transactions`,
          {
            method: "POST",
            body: JSON.stringify({
              type: "withdrawal",
              amount: 50,
              currency: "NOK",
              occurredAt: new Date().toISOString(),
            }),
          }
        ),
        { params: Promise.resolve({ id: testAccountId }) }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.transaction.type).toBe("withdrawal");
    });

    it("creates a bonus transaction", async () => {
      const mockAccount = {
        id: testAccountId,
        name: "bet365",
        kind: "bookmaker",
        userId: user.id,
      };

      const mockTransaction = {
        id: "tx-3",
        accountId: testAccountId,
        type: "bonus",
        amount: "25.00",
        currency: "GBP",
        occurredAt: new Date(),
        notes: "Welcome bonus",
        createdAt: new Date(),
      };

      (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce(mockAccount);
      (dbQueries.createAccountTransaction as vi.Mock).mockResolvedValueOnce(
        mockTransaction
      );

      const res = await createTransactionRoute(
        new Request(
          `http://localhost/api/bets/accounts/${testAccountId}/transactions`,
          {
            method: "POST",
            body: JSON.stringify({
              type: "bonus",
              amount: 25,
              currency: "GBP",
              occurredAt: new Date().toISOString(),
              notes: "Welcome bonus",
            }),
          }
        ),
        { params: Promise.resolve({ id: testAccountId }) }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.transaction.type).toBe("bonus");
    });

    it("rejects negative amount", async () => {
      const mockAccount = {
        id: testAccountId,
        name: "bet365",
        kind: "bookmaker",
        userId: user.id,
      };

      (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce(mockAccount);

      const res = await createTransactionRoute(
        new Request(
          `http://localhost/api/bets/accounts/${testAccountId}/transactions`,
          {
            method: "POST",
            body: JSON.stringify({
              type: "deposit",
              amount: -100,
              currency: "NOK",
              occurredAt: new Date().toISOString(),
            }),
          }
        ),
        { params: Promise.resolve({ id: testAccountId }) }
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid payload");
    });

    it("rejects invalid transaction type", async () => {
      const mockAccount = {
        id: testAccountId,
        name: "bet365",
        kind: "bookmaker",
        userId: user.id,
      };

      (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce(mockAccount);

      const res = await createTransactionRoute(
        new Request(
          `http://localhost/api/bets/accounts/${testAccountId}/transactions`,
          {
            method: "POST",
            body: JSON.stringify({
              type: "invalid_type",
              amount: 100,
              currency: "NOK",
              occurredAt: new Date().toISOString(),
            }),
          }
        ),
        { params: Promise.resolve({ id: testAccountId }) }
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid payload");
    });

    it("returns 404 for non-existent account", async () => {
      (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce(null);

      const res = await createTransactionRoute(
        new Request(
          `http://localhost/api/bets/accounts/${testAccountId}/transactions`,
          {
            method: "POST",
            body: JSON.stringify({
              type: "deposit",
              amount: 100,
              currency: "NOK",
              occurredAt: new Date().toISOString(),
            }),
          }
        ),
        { params: Promise.resolve({ id: testAccountId }) }
      );

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Account not found");
    });

    it("rejects unauthenticated requests", async () => {
      (authModule.auth as vi.Mock).mockResolvedValueOnce(null);

      const res = await createTransactionRoute(
        new Request(
          `http://localhost/api/bets/accounts/${testAccountId}/transactions`,
          {
            method: "POST",
            body: JSON.stringify({
              type: "deposit",
              amount: 100,
              currency: "NOK",
              occurredAt: new Date().toISOString(),
            }),
          }
        ),
        { params: Promise.resolve({ id: testAccountId }) }
      );

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });
  });

  describe("GET /api/bets/accounts/[id]/transactions (list)", () => {
    it("lists transactions for an account", async () => {
      const mockAccount = {
        id: testAccountId,
        name: "bet365",
        kind: "bookmaker",
        userId: user.id,
      };

      const mockTransactions = [
        {
          id: "tx-1",
          accountId: testAccountId,
          type: "deposit",
          amount: "100.00",
          currency: "NOK",
          occurredAt: new Date("2025-01-10"),
          notes: null,
        },
        {
          id: "tx-2",
          accountId: testAccountId,
          type: "bonus",
          amount: "25.00",
          currency: "NOK",
          occurredAt: new Date("2025-01-11"),
          notes: "Welcome bonus",
        },
      ];

      (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce(mockAccount);
      (dbQueries.listTransactionsByAccount as vi.Mock).mockResolvedValueOnce(
        mockTransactions
      );

      const res = await listTransactionsRoute(
        new Request(
          `http://localhost/api/bets/accounts/${testAccountId}/transactions`,
          {
            method: "GET",
          }
        ),
        { params: Promise.resolve({ id: testAccountId }) }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.transactions).toHaveLength(2);
      expect(json.count).toBe(2);
      expect(json.transactions[0].type).toBe("deposit");
      expect(json.transactions[1].type).toBe("bonus");
    });

    it("returns empty list for account with no transactions", async () => {
      const mockAccount = {
        id: testAccountId,
        name: "bet365",
        kind: "bookmaker",
        userId: user.id,
      };

      (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce(mockAccount);
      (dbQueries.listTransactionsByAccount as vi.Mock).mockResolvedValueOnce([]);

      const res = await listTransactionsRoute(
        new Request(
          `http://localhost/api/bets/accounts/${testAccountId}/transactions`,
          {
            method: "GET",
          }
        ),
        { params: Promise.resolve({ id: testAccountId }) }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.transactions).toHaveLength(0);
      expect(json.count).toBe(0);
    });

    it("returns 404 for non-existent account", async () => {
      (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce(null);

      const res = await listTransactionsRoute(
        new Request(
          `http://localhost/api/bets/accounts/${testAccountId}/transactions`,
          {
            method: "GET",
          }
        ),
        { params: Promise.resolve({ id: testAccountId }) }
      );

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Account not found");
    });

    it("rejects unauthenticated requests", async () => {
      (authModule.auth as vi.Mock).mockResolvedValueOnce(null);

      const res = await listTransactionsRoute(
        new Request(
          `http://localhost/api/bets/accounts/${testAccountId}/transactions`,
          {
            method: "GET",
          }
        ),
        { params: Promise.resolve({ id: testAccountId }) }
      );

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });
  });
});
