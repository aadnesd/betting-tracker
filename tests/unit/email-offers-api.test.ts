import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as updateOffer } from "@/app/(chat)/api/bets/email-offers/[id]/route";
import { POST as connect } from "@/app/(chat)/api/bets/mailbox/route";
import { GET as cron } from "@/app/(chat)/api/cron/email-offers/route";
import { getTestAwareSession } from "@/lib/auth";
import { createMailClient } from "@/lib/email-offers/nango";
import { updateEmailOfferStatus } from "@/lib/email-offers/repository";
import { scanEmailOffers } from "@/lib/email-offers/scan";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getTestAwareSession: vi.fn() }));
vi.mock("@/lib/email-offers/nango", async (original) => ({
  ...(await original<typeof import("@/lib/email-offers/nango")>()),
  createMailClient: vi.fn(),
  isEmailConfigured: () => true,
}));
vi.mock("@/lib/email-offers/repository", () => ({
  updateEmailOfferStatus: vi.fn(),
}));
vi.mock("@/lib/email-offers/scan", () => ({ scanEmailOffers: vi.fn() }));
const offerId = "12345678-1234-4234-8234-123456789abc";

describe("email API boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTestAwareSession).mockResolvedValue({
      user: { id: "authenticated-user" },
      expires: "later",
    });
  });

  it("requires authentication before creating a Nango session", async () => {
    vi.mocked(getTestAwareSession).mockResolvedValueOnce(null);
    expect(
      (
        await connect(
          new Request("http://localhost/api/bets/mailbox", { method: "POST" })
        )
      ).status
    ).toBe(401);
    expect(createMailClient).not.toHaveBeenCalled();
  });

  it("ignores browser-supplied owner and integration fields", async () => {
    const connectSession = vi
      .fn()
      .mockResolvedValue({ sessionToken: "scoped" });
    vi.mocked(createMailClient).mockReturnValue({
      connectSession,
    } as unknown as ReturnType<typeof createMailClient>);
    const response = await connect(
      new Request("http://localhost/api/bets/mailbox", {
        method: "POST",
        body: JSON.stringify({ userId: "victim", integrationId: "anything" }),
      })
    );
    expect(response.status).toBe(200);
    expect(connectSession).toHaveBeenCalledWith("authenticated-user");
  });

  it("rejects cross-origin mutations", async () => {
    expect(
      (
        await connect(
          new Request("http://localhost/api/bets/mailbox", {
            method: "POST",
            headers: { origin: "https://attacker.example" },
          })
        )
      ).status
    ).toBe(403);
    expect(createMailClient).not.toHaveBeenCalled();
  });

  it("accepts the browser origin when Next exposes an internal request URL", async () => {
    const connectSession = vi
      .fn()
      .mockResolvedValue({ sessionToken: "scoped" });
    vi.mocked(createMailClient).mockReturnValue({
      connectSession,
    } as unknown as ReturnType<typeof createMailClient>);
    const response = await connect(
      new Request("http://localhost:3015/api/bets/mailbox", {
        method: "POST",
        headers: { origin: "http://127.0.0.1:3015", host: "127.0.0.1:3015" },
      })
    );
    expect(response.status).toBe(200);
    expect(connectSession).toHaveBeenCalledWith("authenticated-user");
  });

  it("scopes offer updates to the authenticated user", async () => {
    vi.mocked(updateEmailOfferStatus).mockResolvedValueOnce(undefined);
    expect(
      (
        await updateOffer(
          new Request(`http://localhost/api/bets/email-offers/${offerId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "dismissed", userId: "victim" }),
          }),
          { params: Promise.resolve({ id: offerId }) }
        )
      ).status
    ).toBe(404);
    expect(updateEmailOfferStatus).toHaveBeenCalledWith(
      "authenticated-user",
      offerId,
      "dismissed"
    );
  });

  it("fails closed when the cron secret is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(
      (await cron(new Request("http://localhost/api/cron/email-offers"))).status
    ).toBe(401);
    expect(scanEmailOffers).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("fails closed when the cron bearer is wrong", async () => {
    vi.stubEnv("CRON_SECRET", "correct");
    expect(
      (
        await cron(
          new Request("http://localhost/api/cron/email-offers", {
            headers: { authorization: "Bearer wrong" },
          })
        )
      ).status
    ).toBe(401);
    expect(scanEmailOffers).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
