import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authModule from "@/app/(auth)/auth";
import {
  POST as createAccountRoute,
  GET as getAccountRoute,
  PATCH as updateAccountRoute,
} from "@/app/(chat)/api/bets/accounts/route";
import * as dbQueries from "@/lib/db/queries";

const user = { id: "user-1" };
const testAccountId = "12345678-1234-1234-1234-123456789abc";

vi.mock("@/app/(auth)/auth", () => ({
  auth: vi.fn(),
}));

// Mock db queries
vi.mock("@/lib/db/queries", () => ({
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  getAccountById: vi.fn(),
  listAccountsByUser: vi.fn(),
  createAuditEntry: vi.fn(),
}));

describe("accounts API routes (unit)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (authModule.auth as vi.Mock).mockResolvedValue({ user });
  });

  describe("POST /api/bets/accounts (create)", () => {
    it("creates a bookmaker account", async () => {
      const mockAccount = {
        id: "acc-1",
        name: "bet365",
        kind: "bookmaker",
        currency: "GBP",
        commission: null,
        status: "active",
        createdAt: new Date(),
      };

      (dbQueries.createAccount as vi.Mock).mockResolvedValueOnce(mockAccount);

      const res = await createAccountRoute(
        new Request("http://localhost/api/bets/accounts", {
          method: "POST",
          body: JSON.stringify({
            name: "bet365",
            kind: "bookmaker",
            currency: "GBP",
          }),
        })
      );

      expect(res).toBeInstanceOf(NextResponse);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.account.id).toBe("acc-1");
      expect(json.account.name).toBe("bet365");
      expect(json.account.kind).toBe("bookmaker");

      expect(dbQueries.createAccount).toHaveBeenCalledWith({
        userId: user.id,
        name: "bet365",
        kind: "bookmaker",
        currency: "GBP",
        commission: null,
        limits: null,
      });

      expect(dbQueries.createAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          entityType: "account",
          entityId: "acc-1",
          action: "create",
        })
      );
    });

    it("creates an exchange account with commission", async () => {
      const mockAccount = {
        id: "acc-2",
        name: "Betfair Exchange",
        kind: "exchange",
        currency: "GBP",
        commission: "0.02",
        status: "active",
        createdAt: new Date(),
      };

      (dbQueries.createAccount as vi.Mock).mockResolvedValueOnce(mockAccount);

      const res = await createAccountRoute(
        new Request("http://localhost/api/bets/accounts", {
          method: "POST",
          body: JSON.stringify({
            name: "Betfair Exchange",
            kind: "exchange",
            currency: "GBP",
            commission: 0.02, // 2% as decimal
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.account.kind).toBe("exchange");

      expect(dbQueries.createAccount).toHaveBeenCalledWith({
        userId: user.id,
        name: "Betfair Exchange",
        kind: "exchange",
        currency: "GBP",
        commission: 0.02,
        limits: null,
      });
    });

    it("rejects invalid payload with missing name", async () => {
      const res = await createAccountRoute(
        new Request("http://localhost/api/bets/accounts", {
          method: "POST",
          body: JSON.stringify({
            kind: "bookmaker",
          }),
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid payload");
    });

    it("rejects invalid kind value", async () => {
      const res = await createAccountRoute(
        new Request("http://localhost/api/bets/accounts", {
          method: "POST",
          body: JSON.stringify({
            name: "test",
            kind: "invalid",
          }),
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid payload");
    });

    it("rejects unauthenticated requests", async () => {
      (authModule.auth as vi.Mock).mockResolvedValueOnce(null);

      const res = await createAccountRoute(
        new Request("http://localhost/api/bets/accounts", {
          method: "POST",
          body: JSON.stringify({
            name: "bet365",
            kind: "bookmaker",
          }),
        })
      );

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });
  });

  describe("PATCH /api/bets/accounts (update)", () => {
    it("updates account name", async () => {
      const originalAccount = {
        id: testAccountId,
        name: "bet365",
        kind: "bookmaker",
        currency: "GBP",
        commission: null,
        status: "active",
      };

      const updatedAccount = {
        ...originalAccount,
        name: "Bet365 UK",
      };

      (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce(
        originalAccount
      );
      (dbQueries.updateAccount as vi.Mock).mockResolvedValueOnce(
        updatedAccount
      );

      const res = await updateAccountRoute(
        new Request("http://localhost/api/bets/accounts", {
          method: "PATCH",
          body: JSON.stringify({
            id: testAccountId,
            name: "Bet365 UK",
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.account.name).toBe("Bet365 UK");

      expect(dbQueries.updateAccount).toHaveBeenCalledWith({
        id: testAccountId,
        userId: user.id,
        name: "Bet365 UK",
        kind: undefined,
        currency: undefined,
        commission: undefined,
        status: undefined,
        limits: undefined,
      });

      expect(dbQueries.createAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "update",
          changes: {
            name: { from: "bet365", to: "Bet365 UK" },
          },
        })
      );
    });

    it("updates account status to archived", async () => {
      const originalAccount = {
        id: testAccountId,
        name: "bet365",
        kind: "bookmaker",
        currency: "GBP",
        commission: null,
        status: "active",
      };

      const updatedAccount = {
        ...originalAccount,
        status: "archived",
      };

      (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce(
        originalAccount
      );
      (dbQueries.updateAccount as vi.Mock).mockResolvedValueOnce(
        updatedAccount
      );

      const res = await updateAccountRoute(
        new Request("http://localhost/api/bets/accounts", {
          method: "PATCH",
          body: JSON.stringify({
            id: testAccountId,
            status: "archived",
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.account.status).toBe("archived");

      expect(dbQueries.createAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: {
            status: { from: "active", to: "archived" },
          },
        })
      );
    });

    it("returns 404 for non-existent account", async () => {
      (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce(null);

      const nonExistentId = "99999999-9999-9999-9999-999999999999";
      const res = await updateAccountRoute(
        new Request("http://localhost/api/bets/accounts", {
          method: "PATCH",
          body: JSON.stringify({
            id: nonExistentId,
            name: "New Name",
          }),
        })
      );

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Account not found");
    });

    it("rejects invalid account ID format", async () => {
      const res = await updateAccountRoute(
        new Request("http://localhost/api/bets/accounts", {
          method: "PATCH",
          body: JSON.stringify({
            id: "not-a-uuid",
            name: "New Name",
          }),
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid payload");
    });

    it("rejects unauthenticated requests", async () => {
      (authModule.auth as vi.Mock).mockResolvedValueOnce(null);

      const res = await updateAccountRoute(
        new Request("http://localhost/api/bets/accounts", {
          method: "PATCH",
          body: JSON.stringify({
            id: "acc-1",
            name: "New Name",
          }),
        })
      );

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });
  });

  describe("GET /api/bets/accounts", () => {
    it("fetches account by ID", async () => {
      const mockAccount = {
        id: "acc-1",
        name: "bet365",
        kind: "bookmaker",
        currency: "GBP",
        commission: null,
        status: "active",
      };

      (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce(mockAccount);

      const res = await getAccountRoute(
        new Request("http://localhost/api/bets/accounts?id=acc-1", {
          method: "GET",
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.account.id).toBe("acc-1");
      expect(json.account.name).toBe("bet365");
    });

    it("returns account list when ID is missing", async () => {
      const mockAccounts = [
        {
          id: "acc-1",
          name: "bet365",
          kind: "bookmaker",
          currency: "GBP",
          commission: null,
          status: "active",
        },
        {
          id: "acc-2",
          name: "betfair",
          kind: "exchange",
          currency: "GBP",
          commission: 0.05,
          status: "active",
        },
      ];

      (dbQueries.listAccountsByUser as vi.Mock).mockResolvedValueOnce(
        mockAccounts
      );

      const res = await getAccountRoute(
        new Request("http://localhost/api/bets/accounts", {
          method: "GET",
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json).toHaveLength(2);
      expect(dbQueries.listAccountsByUser).toHaveBeenCalledWith({
        userId: user.id,
        limit: 200,
      });
    });

    it("returns 404 for non-existent account", async () => {
      (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce(null);

      const res = await getAccountRoute(
        new Request("http://localhost/api/bets/accounts?id=non-existent", {
          method: "GET",
        })
      );

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Account not found");
    });

    it("rejects unauthenticated requests", async () => {
      (authModule.auth as vi.Mock).mockResolvedValueOnce(null);

      const res = await getAccountRoute(
        new Request("http://localhost/api/bets/accounts?id=acc-1", {
          method: "GET",
        })
      );

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });
  });
});
