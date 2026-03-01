import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authModule from "@/app/(auth)/auth";
import {
  DELETE as deleteTransactionRoute,
  PATCH as patchTransactionRoute,
} from "@/app/(chat)/api/bets/accounts/[id]/transactions/[txId]/route";
import * as dbQueries from "@/lib/db/queries";

const user = { id: "user-1" };
const testAccountId = "12345678-1234-1234-1234-123456789abc";
const testTxId = "tx-1";

vi.mock("@/app/(auth)/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  autoCompleteDepositBonusesIfEligible: vi.fn(),
  deleteAccountTransaction: vi.fn(),
  getAccountById: vi.fn(),
  updateAccountTransaction: vi.fn(),
}));

describe("DELETE /api/bets/accounts/[id]/transactions/[txId] (unit)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (authModule.auth as vi.Mock).mockResolvedValue({ user });
  });

  it("deletes transaction and evaluates deposit bonus auto-completion", async () => {
    (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce({
      id: testAccountId,
      userId: user.id,
    });
    (dbQueries.deleteAccountTransaction as vi.Mock).mockResolvedValueOnce({
      success: true,
    });

    const res = await deleteTransactionRoute(
      new Request(
        `http://localhost/api/bets/accounts/${testAccountId}/transactions/${testTxId}`,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: testAccountId, txId: testTxId }) }
    );

    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(200);
    expect(dbQueries.autoCompleteDepositBonusesIfEligible).toHaveBeenCalledWith(
      {
        userId: user.id,
        accountId: testAccountId,
      }
    );
  });

  it("returns 404 when transaction does not exist", async () => {
    (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce({
      id: testAccountId,
      userId: user.id,
    });
    (dbQueries.deleteAccountTransaction as vi.Mock).mockResolvedValueOnce(null);

    const res = await deleteTransactionRoute(
      new Request(
        `http://localhost/api/bets/accounts/${testAccountId}/transactions/${testTxId}`,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: testAccountId, txId: testTxId }) }
    );

    expect(res.status).toBe(404);
    expect(
      dbQueries.autoCompleteDepositBonusesIfEligible
    ).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    (authModule.auth as vi.Mock).mockResolvedValueOnce(null);

    const res = await deleteTransactionRoute(
      new Request(
        `http://localhost/api/bets/accounts/${testAccountId}/transactions/${testTxId}`,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: testAccountId, txId: testTxId }) }
    );

    expect(res.status).toBe(401);
  });

  it("updates transaction with PATCH", async () => {
    (dbQueries.getAccountById as vi.Mock).mockResolvedValueOnce({
      id: testAccountId,
      userId: user.id,
    });
    (dbQueries.updateAccountTransaction as vi.Mock).mockResolvedValueOnce({
      id: testTxId,
      accountId: testAccountId,
      type: "bonus",
      amount: "12.00",
      currency: "NOK",
      occurredAt: new Date("2025-02-01"),
      notes: "Updated",
    });

    const res = await patchTransactionRoute(
      new Request(
        `http://localhost/api/bets/accounts/${testAccountId}/transactions/${testTxId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            type: "bonus",
            amount: 12,
            currency: "NOK",
            occurredAt: "2025-02-01T00:00:00.000Z",
            notes: "Updated",
          }),
        }
      ),
      { params: Promise.resolve({ id: testAccountId, txId: testTxId }) }
    );

    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(200);
    expect(dbQueries.updateAccountTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: testTxId,
        userId: user.id,
        type: "bonus",
        amount: 12,
      })
    );
    expect(dbQueries.autoCompleteDepositBonusesIfEligible).toHaveBeenCalledWith(
      {
        userId: user.id,
        accountId: testAccountId,
      }
    );
  });
});
