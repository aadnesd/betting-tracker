/**
 * Unit tests for OAuth auth helpers.
 *
 * Why: Ensures guest upgrade and OAuth user creation logic stays stable when
 * Auth.js callbacks evolve.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => mockDb),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({})),
}));

import * as dbQueries from "@/lib/db/queries";

const mockSelect = (rows: unknown[]) => ({
  from: vi.fn(() => ({
    where: vi.fn().mockResolvedValue(rows),
  })),
});

const mockUpdateReturning = (rows: unknown[]) => ({
  set: vi.fn(() => ({
    where: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue(rows),
    })),
  })),
});

const mockInsertReturning = (rows: unknown[]) => ({
  values: vi.fn(() => ({
    returning: vi.fn().mockResolvedValue(rows),
  })),
});

const mockTx = {
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  })),
  delete: vi.fn(() => ({
    where: vi.fn().mockResolvedValue(undefined),
  })),
  select: vi.fn(() => mockSelect([])),
};

describe("OAuth auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockImplementation(() => mockSelect([]));
    mockDb.update.mockImplementation(() => mockUpdateReturning([]));
    mockDb.insert.mockImplementation(() => mockInsertReturning([]));
    mockDb.transaction.mockImplementation(
      async (callback: (tx: typeof mockTx) => Promise<void>) => {
        await callback(mockTx);
      }
    );
  });

  it("exposes findOrCreateOAuthUser helper", () => {
    expect(typeof dbQueries.findOrCreateOAuthUser).toBe("function");
  });

  it("returns existing user when OAuth email already exists", async () => {
    mockDb.select.mockImplementationOnce(() =>
      mockSelect([{ id: "user-1", email: "user@example.com" }])
    );

    const result = await dbQueries.findOrCreateOAuthUser({
      email: "user@example.com",
    });

    expect(result.userId).toBe("user-1");
    expect(result.linkedFromGuest).toBe(false);
  });

  it("links guest data to an existing OAuth user", async () => {
    mockDb.select.mockImplementationOnce(() =>
      mockSelect([{ id: "user-2", email: "user@example.com" }])
    );

    const result = await dbQueries.findOrCreateOAuthUser({
      email: "user@example.com",
      guestUserId: "guest-1",
    });

    expect(result.userId).toBe("user-2");
    expect(result.linkedFromGuest).toBe(true);
    expect(mockDb.transaction).toHaveBeenCalled();
  });

  it("upgrades guest user in-place when no existing OAuth user", async () => {
    mockDb.select.mockImplementationOnce(() => mockSelect([]));
    mockDb.update.mockImplementation(() =>
      mockUpdateReturning([{ id: "guest-1", email: "new@example.com" }])
    );

    const result = await dbQueries.findOrCreateOAuthUser({
      email: "new@example.com",
      guestUserId: "guest-1",
    });

    expect(result.userId).toBe("guest-1");
    expect(result.linkedFromGuest).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("creates a new user when no guest or existing OAuth user", async () => {
    mockDb.select.mockImplementationOnce(() => mockSelect([]));
    mockDb.insert.mockImplementation(() =>
      mockInsertReturning([{ id: "user-3", email: "new@example.com" }])
    );

    const result = await dbQueries.findOrCreateOAuthUser({
      email: "new@example.com",
    });

    expect(result.userId).toBe("user-3");
    expect(result.linkedFromGuest).toBe(false);
    expect(mockDb.insert).toHaveBeenCalled();
  });
});
