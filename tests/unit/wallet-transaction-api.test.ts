import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authModule from "@/app/(auth)/auth";
import {
  DELETE as deleteWalletTransactionRoute,
  PATCH as patchWalletTransactionRoute,
} from "@/app/(chat)/api/bets/wallets/[id]/transactions/[txId]/route";
import * as dbQueries from "@/lib/db/queries";

const user = { id: "user-1" };
const walletId = "a82ed9ce-4387-446e-ba79-7ebfcd9d6c85";
const txId = "tx-1";

vi.mock("@/app/(auth)/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  deleteWalletTransaction: vi.fn(),
  getWalletById: vi.fn(),
  getWalletTransactionById: vi.fn(),
  updateWalletTransaction: vi.fn(),
}));

describe("Wallet transaction API (unit)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (authModule.auth as vi.Mock).mockResolvedValue({ user });
    (dbQueries.getWalletById as vi.Mock).mockResolvedValue({
      id: walletId,
      userId: user.id,
    });
    (dbQueries.getWalletTransactionById as vi.Mock).mockResolvedValue({
      id: txId,
      walletId,
      type: "deposit",
      amount: "100.00",
      currency: "NOK",
      date: new Date("2025-03-01"),
      notes: null,
    });
  });

  it("updates a wallet transaction", async () => {
    (dbQueries.updateWalletTransaction as vi.Mock).mockResolvedValue({
      id: txId,
      walletId,
    });

    const res = await patchWalletTransactionRoute(
      new Request(
        `http://localhost/api/bets/wallets/${walletId}/transactions/${txId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            type: "fee",
            amount: 2.5,
            currency: "NOK",
            date: "2025-03-01T00:00:00.000Z",
            relatedAccountId: null,
            relatedWalletId: null,
            externalRef: "fee-ref",
            notes: "service fee",
          }),
        }
      ),
      { params: Promise.resolve({ id: walletId, txId }) }
    );

    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(200);
    expect(dbQueries.updateWalletTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: txId,
        userId: user.id,
        type: "fee",
        amount: 2.5,
      })
    );
  });

  it("deletes a wallet transaction", async () => {
    (dbQueries.deleteWalletTransaction as vi.Mock).mockResolvedValue({
      success: true,
    });

    const res = await deleteWalletTransactionRoute(
      new Request(
        `http://localhost/api/bets/wallets/${walletId}/transactions/${txId}`,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: walletId, txId }) }
    );

    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(200);
    expect(dbQueries.deleteWalletTransaction).toHaveBeenCalledWith({
      id: txId,
      userId: user.id,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    (authModule.auth as vi.Mock).mockResolvedValueOnce(null);

    const res = await deleteWalletTransactionRoute(
      new Request(
        `http://localhost/api/bets/wallets/${walletId}/transactions/${txId}`,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: walletId, txId }) }
    );

    expect(res.status).toBe(401);
  });
});
