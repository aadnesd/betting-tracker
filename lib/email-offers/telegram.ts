import "server-only";
import { z } from "zod";
import { isEmailConfigured, MailboxError } from "./nango";

export function isTelegramConfigured() {
  return (
    isEmailConfigured() && Boolean(process.env.NANGO_TELEGRAM_CONNECTION_ID)
  );
}

export class TelegramError extends Error {
  readonly retryAfter: number;
  readonly permanent: boolean;
  constructor(retryAfter: number, permanent: boolean) {
    super(
      permanent
        ? "Telegram could not reach this chat. Check the bot and reconnect alerts."
        : "Telegram is temporarily unavailable. Delivery will be retried."
    );
    this.retryAfter = retryAfter;
    this.permanent = permanent;
  }
}

export async function telegramRequest(
  method: "getMe" | "sendMessage",
  data?: Record<string, unknown>
) {
  if (!isTelegramConfigured()) {
    throw new MailboxError(503, "Telegram alerts are not configured yet.");
  }
  const secret =
    process.env.NANGO_SECRET_KEY ||
    process.env.NANGO_API_KEY ||
    process.env.NANGO_TOOLBOX_SECRET_KEY;
  // https://core.telegram.org/bots/api#sendmessage
  // Nango injects the bot token. Do not retry an ambiguous non-idempotent send here.
  const response = await fetch(
    `${process.env.NANGO_SERVER_URL || "https://api.nango.dev"}/proxy/${method}`,
    {
      method: data ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        "Provider-Config-Key":
          process.env.NANGO_TELEGRAM_INTEGRATION || "betting-telegram",
        "Connection-Id": process.env.NANGO_TELEGRAM_CONNECTION_ID!,
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true) {
    const code = body.error_code || response.status;
    throw new TelegramError(
      Math.min(
        86_400,
        Math.max(60, Number(body.parameters?.retry_after) || 60)
      ),
      [400, 401, 403, 404].includes(code)
    );
  }
  return body.result;
}

export async function telegramBot() {
  return z
    .object({ username: z.string().regex(/^[a-zA-Z0-9_]+$/) })
    .parse(await telegramRequest("getMe"));
}

export async function sendTelegram(chatId: string, text: string) {
  return z.object({ message_id: z.number().int() }).parse(
    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text,
      link_preview_options: { is_disabled: true },
    })
  );
}
