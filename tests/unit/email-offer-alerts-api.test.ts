import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/(chat)/api/bets/email-offers/alerts/route";
import { getTestAwareSession } from "@/lib/auth";
import * as alerts from "@/lib/email-offers/alerts";
import { sendTelegram, TelegramError } from "@/lib/email-offers/telegram";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getTestAwareSession: vi.fn() }));
vi.mock("@/lib/email-offers/alerts", () => ({
  alertSettingsView: vi.fn(),
  confirmTelegramVerification: vi.fn(),
  requestTelegramVerification: vi.fn(),
  setTelegramAlertsEnabled: vi.fn(),
  telegramSetupInfo: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTestAwareSession).mockResolvedValue({
    user: { id: "owner" },
    expires: "later",
  });
  vi.mocked(alerts.alertSettingsView).mockResolvedValue({
    configured: true,
    enabled: false,
    chatId: null,
    pending: true,
    lastDelivery: null,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const post = (body: object, origin?: string) =>
  POST(
    new Request("http://localhost/api/bets/email-offers/alerts", {
      method: "POST",
      headers: origin ? { origin } : {},
      body: JSON.stringify(body),
    })
  );

it("requires authentication and rejects cross-origin verification", async () => {
  vi.mocked(getTestAwareSession).mockResolvedValueOnce(null);
  expect((await GET(new Request("http://localhost"))).status).toBe(401);
  expect(
    (await post({ action: "verify", code: "123456" }, "https://other.example"))
      .status
  ).toBe(403);
  expect(alerts.confirmTelegramVerification).not.toHaveBeenCalled();
});
it("ignores supplied ownership and never allows a client to bypass verification", async () => {
  expect(
    (
      await post({
        action: "request_code",
        chatId: "123456789",
        userId: "victim",
      })
    ).status
  ).toBe(200);
  expect(alerts.requestTelegramVerification).toHaveBeenCalledWith(
    "owner",
    "123456789"
  );
  expect(
    (await post({ action: "verify", code: "123456", userId: "victim" })).status
  ).toBe(200);
  expect(alerts.confirmTelegramVerification).toHaveBeenCalledWith(
    "owner",
    "123456"
  );
  expect(
    (
      await post({
        action: "set_enabled",
        enabled: true,
        chatId: "victim-chat",
      })
    ).status
  ).toBe(200);
  expect(alerts.setTelegramAlertsEnabled).toHaveBeenCalledWith("owner", true);
});
it("validates private chat IDs and codes", async () => {
  expect(
    (await post({ action: "request_code", chatId: "-123456789" })).status
  ).toBe(400);
  expect((await post({ action: "verify", code: "123" })).status).toBe(400);
  expect(alerts.requestTelegramVerification).not.toHaveBeenCalled();
});
it("sends through Nango without exposing a bot token and respects Telegram retry hints", async () => {
  vi.stubEnv("NANGO_SECRET_KEY", "test-secret");
  vi.stubEnv("NANGO_TELEGRAM_CONNECTION_ID", "bot-connection");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ ok: true, result: { message_id: 12 } })
    )
    .mockResolvedValueOnce(
      Response.json(
        { ok: false, error_code: 429, parameters: { retry_after: 700 } },
        { status: 429 }
      )
    );
  vi.stubGlobal("fetch", fetcher);
  expect(await sendTelegram("123456789", "test offer")).toEqual({
    message_id: 12,
  });
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://api.nango.dev/proxy/sendMessage"
  );
  expect(fetcher.mock.calls[0][1].headers["Connection-Id"]).toBe(
    "bot-connection"
  );
  await expect(sendTelegram("123456789", "test offer")).rejects.toMatchObject({
    retryAfter: 700,
    permanent: false,
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(new TelegramError(60, true).message).not.toContain("token");
});
