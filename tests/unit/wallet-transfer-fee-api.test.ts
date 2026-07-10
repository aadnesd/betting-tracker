import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authModule from "@/app/(auth)/auth";
import { POST as createWalletTxRoute } from "@/app/(chat)/api/bets/wallets/[id]/transactions/route";
import * as dbQueries from "@/lib/db/queries";

const user = { id: "user-1" };
const walletId = "a82ed9ce-4387-446e-ba79-7ebfcd9d6c85";
const accountId = "b6c8f0d6-1111-2222-3333-444455556666";

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
  getAccountById: vi.fn(),
  getWalletById: vi.fn(),
  listWalletTransactionsWithDetails: vi.fn(),
}));

describe("Wallet transactions POST — deposit fee", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (authModule.auth as vi.Mock).mockResolvedValue({ user });
    (dbQueries.getWalletById as vi.Mock).mockResolvedValue({
      id: walletId,
      userId: user.id,
      currency: "EUR",
    });
    (dbQueries.getAccountById as vi.Mock).mockResolvedValue({
      id: accountId,
      userId: user.id,
      currency: "NOK",
    });
  });

  it("forwards depositFeeAmount when doing transfer_to_account", async () => {
    (dbQueries.createTransferToAccount as vi.Mock).mockResolvedValue({
      walletTx: { id: "wtx-1" },
      accountTx: { id: "atx-1" },
    });

    const res = await createWalletTxRoute(
      new Request(
        `http://localhost/api/bets/wallets/${walletId}/transactions`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "transfer_to_account",
            amount: 919,
            currency: "EUR",
            date: "2026-01-15T00:00:00.000Z",
            relatedAccountId: accountId,
            depositFeeAmount: 200,
            depositFeeCurrency: "NOK",
            notes: "Revolut → Unibet, bad FX",
          }),
        }
      ),
      { params: Promise.resolve({ id: walletId }) }
    );

    expect(res).toBeInstanceOf(NextResponse);
    expect(dbQueries.createTransferToAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId,
        accountId,
        amount: 919,
        currency: "EUR",
        depositFeeAmount: 200,
        depositFeeCurrency: "NOK",
      })
    );
  });

  it("defaults depositFeeCurrency to account currency when omitted", async () => {
    (dbQueries.createTransferToAccount as vi.Mock).mockResolvedValue({
      walletTx: { id: "wtx-1" },
      accountTx: { id: "atx-1" },
    });

    await createWalletTxRoute(
      new Request(
        `http://localhost/api/bets/wallets/${walletId}/transactions`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "transfer_to_account",
            amount: 919,
            currency: "EUR",
            date: "2026-01-15T00:00:00.000Z",
            relatedAccountId: accountId,
            depositFeeAmount: 200,
          }),
        }
      ),
      { params: Promise.resolve({ id: walletId }) }
    );

    expect(dbQueries.createTransferToAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        depositFeeAmount: 200,
        depositFeeCurrency: "NOK",
      })
    );
  });

  it("rejects negative depositFeeAmount", async () => {
    const res = await createWalletTxRoute(
      new Request(
        `http://localhost/api/bets/wallets/${walletId}/transactions`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "transfer_to_account",
            amount: 100,
            currency: "EUR",
            date: "2026-01-15T00:00:00.000Z",
            relatedAccountId: accountId,
            depositFeeAmount: -1,
          }),
        }
      ),
      { params: Promise.resolve({ id: walletId }) }
    );

    expect(res.status).toBe(400);
  });
});
