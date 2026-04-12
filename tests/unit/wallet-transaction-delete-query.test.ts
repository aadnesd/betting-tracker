import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockDelete,
  mockDeleteWhere,
  mockInsert,
  mockInsertValues,
  mockSelect,
  mockUpdate,
  mockUpdateSet,
  mockUpdateWhere,
} = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn();
  const mockDelete = vi.fn(() => ({
    where: mockDeleteWhere,
  }));
  const mockInsertValues = vi.fn();
  const mockInsert = vi.fn(() => ({
    values: mockInsertValues,
  }));
  const mockSelect = vi.fn();
  const mockUpdateWhere = vi.fn();
  const mockUpdateSet = vi.fn(() => ({
    where: mockUpdateWhere,
  }));
  const mockUpdate = vi.fn(() => ({
    set: mockUpdateSet,
  }));

  return {
    mockDelete,
    mockDeleteWhere,
    mockInsert,
    mockInsertValues,
    mockSelect,
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
  };
});

vi.mock("@/lib/db/connection", () => ({
  db: {
    select: mockSelect,
    delete: mockDelete,
    insert: mockInsert,
    update: mockUpdate,
  },
}));

import { deleteWalletTransaction } from "@/lib/db/queries";

describe("deleteWalletTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteWhere.mockResolvedValue(undefined);
    mockInsertValues.mockResolvedValue(undefined);
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("deletes the mirrored wallet transfer row for wallet-to-wallet transfers", async () => {
    const existing = {
      id: "tx-source",
      walletId: "wallet-source",
      type: "transfer_to_wallet",
      amount: "100.00",
      currency: "NOK",
      date: new Date("2026-04-10T10:00:00.000Z"),
      notes: "Jeton transfer",
      relatedWalletId: "wallet-destination",
      relatedAccountId: null,
      linkedAccountTransactionId: null,
      createdAt: new Date("2026-04-10T10:00:01.000Z"),
    };

    mockSelect
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([existing]),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ userId: "user-1" }]),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue([{ id: "tx-destination" }]),
              })),
            })),
          })),
        })),
      }));

    const result = await deleteWalletTransaction({
      id: "tx-source",
      userId: "user-1",
    });

    expect(result).toEqual({ success: true });
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        changes: expect.objectContaining({
          linkedWalletTransactionId: "tx-destination",
        }),
      }),
    );
  });

  it("clears the backlink before deleting explicitly linked wallet transfers", async () => {
    const existing = {
      id: "tx-source",
      walletId: "wallet-source",
      type: "transfer_to_wallet",
      amount: "100.00",
      currency: "NOK",
      date: new Date("2026-04-10T10:00:00.000Z"),
      notes: "Jeton transfer",
      relatedWalletId: "wallet-destination",
      relatedAccountId: null,
      linkedAccountTransactionId: null,
      linkedWalletTransactionId: "tx-destination",
      createdAt: new Date("2026-04-10T10:00:01.000Z"),
    };

    mockSelect
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([existing]),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ userId: "user-1" }]),
          })),
        })),
      }));

    const result = await deleteWalletTransaction({
      id: "tx-source",
      userId: "user-1",
    });

    expect(result).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith({
      linkedWalletTransactionId: null,
    });
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });
});
