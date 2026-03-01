import { type NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authModule from "@/app/(auth)/auth";
import { POST as depositBonusActionRoute } from "@/app/(chat)/api/bets/deposit-bonuses/[id]/route";
import * as dbQueries from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

const user = { id: "user-1" };
const testBonusId = "12345678-1234-1234-1234-123456789abc";
const makeActionRequest = (action: string) =>
  new Request(`http://localhost/api/bets/deposit-bonuses/${testBonusId}`, {
    method: "POST",
    body: JSON.stringify({ action }),
  }) as unknown as NextRequest;

vi.mock("@/app/(auth)/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  completeDepositBonusEarly: vi.fn(),
  deleteDepositBonus: vi.fn(),
  forfeitDepositBonus: vi.fn(),
  getDepositBonusById: vi.fn(),
  listBonusQualifyingBets: vi.fn(),
  updateDepositBonus: vi.fn(),
}));

describe("deposit bonuses action API route (unit)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (authModule.auth as vi.Mock).mockResolvedValue({ user });
  });

  it("forfeits an active bonus", async () => {
    const forfeited = { id: testBonusId, status: "forfeited" };
    (dbQueries.forfeitDepositBonus as vi.Mock).mockResolvedValueOnce(forfeited);

    const res = await depositBonusActionRoute(makeActionRequest("forfeit"), {
      params: Promise.resolve({ id: testBonusId }),
    });

    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("forfeited");
    expect(dbQueries.forfeitDepositBonus).toHaveBeenCalledWith({
      id: testBonusId,
      userId: user.id,
      reason: "User forfeited bonus",
    });
  });

  it("completes a bonus early when action is complete_early", async () => {
    const completed = { id: testBonusId, status: "completed_early" };
    (dbQueries.completeDepositBonusEarly as vi.Mock).mockResolvedValueOnce(
      completed
    );

    const res = await depositBonusActionRoute(
      makeActionRequest("complete_early"),
      { params: Promise.resolve({ id: testBonusId }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("completed_early");
    expect(dbQueries.completeDepositBonusEarly).toHaveBeenCalledWith({
      id: testBonusId,
      userId: user.id,
      reason:
        "User completed bonus early due to zero balance and no pending bets",
    });
  });

  it("returns 400 when complete_early rule checks fail", async () => {
    (dbQueries.completeDepositBonusEarly as vi.Mock).mockRejectedValueOnce(
      new ChatSDKError(
        "bad_request:api",
        "Account balance must be exactly zero to complete early"
      )
    );

    const res = await depositBonusActionRoute(
      makeActionRequest("complete_early"),
      { params: Promise.resolve({ id: testBonusId }) }
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe(
      "Account balance must be exactly zero to complete early"
    );
  });

  it("returns 400 when complete_early has pending bets", async () => {
    (dbQueries.completeDepositBonusEarly as vi.Mock).mockRejectedValueOnce(
      new ChatSDKError(
        "bad_request:api",
        "Account must have no pending bets to complete early"
      )
    );

    const res = await depositBonusActionRoute(
      makeActionRequest("complete_early"),
      { params: Promise.resolve({ id: testBonusId }) }
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe(
      "Account must have no pending bets to complete early"
    );
  });

  it("returns 404 when action target bonus is missing", async () => {
    (dbQueries.completeDepositBonusEarly as vi.Mock).mockResolvedValueOnce(
      null
    );

    const res = await depositBonusActionRoute(
      makeActionRequest("complete_early"),
      { params: Promise.resolve({ id: testBonusId }) }
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Deposit bonus not found");
  });

  it("rejects unknown action", async () => {
    const res = await depositBonusActionRoute(
      makeActionRequest("unknown_action"),
      { params: Promise.resolve({ id: testBonusId }) }
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Unknown action");
  });

  it("rejects unauthenticated requests", async () => {
    (authModule.auth as vi.Mock).mockResolvedValueOnce(null);

    const res = await depositBonusActionRoute(
      makeActionRequest("complete_early"),
      { params: Promise.resolve({ id: testBonusId }) }
    );

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });
});
