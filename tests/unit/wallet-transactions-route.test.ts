import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { auth } from "@/app/(auth)/auth";
import { POST as createWalletTransactionRoute } from "@/app/(chat)/api/bets/wallets/[id]/transactions/route";
import { revalidateDashboard } from "@/lib/cache";
import {
  createTransferBetweenWallets,
  createWalletTransaction,
  getWalletById,
} from "@/lib/db/queries";

const user = { id: "user-1" };
const walletId = "a82ed9ce-4387-446e-ba79-7ebfcd9d6c85";
const relatedWalletId = "b82ed9ce-4387-446e-ba79-7ebfcd9d6c85";

vi.mock("@/app/(auth)/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  revalidateDashboard: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  createTransferBetweenWallets: vi.fn(),
  createTransferFromAccount: vi.fn(),
  createTransferToAccount: vi.fn(),
  createWalletTransaction: vi.fn(),
  getWalletById: vi.fn(),
  listWalletTransactionsWithDetails: vi.fn(),
}));

describe("wallet transactions route (unit)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (auth as Mock).mockResolvedValue({ user });
  });

  it("creates a cross-currency transfer to another wallet", async () => {
    (getWalletById as Mock)
      .mockResolvedValueOnce({
        id: walletId,
        userId: user.id,
        currency: "NOK",
      })
      .mockResolvedValueOnce({
        id: relatedWalletId,
        userId: user.id,
        currency: "EUR",
      });

    (createTransferBetweenWallets as Mock).mockResolvedValue({
      fromTx: { id: "tx-from" },
      toTx: { id: "tx-to" },
    });

    const res = await createWalletTransactionRoute(
      new Request(
        `http://localhost/api/bets/wallets/${walletId}/transactions`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "transfer_to_wallet",
            amount: 100,
            currency: "NOK",
            date: "2026-04-12T10:00:00.000Z",
            relatedWalletId,
            relatedWalletAmount: 8.75,
            notes: "Cross-currency send",
          }),
        }
      ),
      { params: Promise.resolve({ id: walletId }) }
    );

    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(201);
    expect(createTransferBetweenWallets).toHaveBeenCalledWith({
      fromWalletId: walletId,
      toWalletId: relatedWalletId,
      fromAmount: 100,
      fromCurrency: "NOK",
      toAmount: 8.75,
      toCurrency: "EUR",
      date: expect.any(Date),
      notes: "Cross-currency send",
    });
    expect(revalidateDashboard).toHaveBeenCalledWith(user.id);
  });

  it("creates a wallet bonus transaction", async () => {
    (getWalletById as Mock).mockResolvedValueOnce({
      id: walletId,
      userId: user.id,
      currency: "NOK",
    });

    (createWalletTransaction as Mock).mockResolvedValue({
      id: "wallet-bonus-tx",
      type: "bonus",
    });

    const res = await createWalletTransactionRoute(
      new Request(
        `http://localhost/api/bets/wallets/${walletId}/transactions`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "bonus",
            amount: 25,
            currency: "NOK",
            date: "2026-04-12T10:00:00.000Z",
            notes: "Wallet cashback",
          }),
        }
      ),
      { params: Promise.resolve({ id: walletId }) }
    );

    expect(res.status).toBe(201);
    expect(createWalletTransaction).toHaveBeenCalledWith({
      walletId,
      type: "bonus",
      amount: 25,
      currency: "NOK",
      date: expect.any(Date),
      relatedAccountId: null,
      relatedWalletId: null,
      externalRef: null,
      notes: "Wallet cashback",
    });
    expect(revalidateDashboard).toHaveBeenCalledWith(user.id);
  });

  it("requires the related wallet amount when wallet currencies differ", async () => {
    (getWalletById as Mock)
      .mockResolvedValueOnce({
        id: walletId,
        userId: user.id,
        currency: "NOK",
      })
      .mockResolvedValueOnce({
        id: relatedWalletId,
        userId: user.id,
        currency: "EUR",
      });

    const res = await createWalletTransactionRoute(
      new Request(
        `http://localhost/api/bets/wallets/${walletId}/transactions`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "transfer_to_wallet",
            amount: 100,
            currency: "NOK",
            date: "2026-04-12T10:00:00.000Z",
            relatedWalletId,
          }),
        }
      ),
      { params: Promise.resolve({ id: walletId }) }
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Related wallet amount is required for cross-currency transfers",
    });
    expect(createTransferBetweenWallets).not.toHaveBeenCalled();
  });
});
