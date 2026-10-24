import { NextResponse } from "next/server";
import { z } from "zod";
import {
  alertSettingsView,
  confirmTelegramVerification,
  requestTelegramVerification,
  setTelegramAlertsEnabled,
  telegramSetupInfo,
} from "@/lib/email-offers/alerts";
import { mailboxRequest } from "@/lib/email-offers/http";

const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("request_code"),
    chatId: z.string().regex(/^[1-9][0-9]{4,19}$/),
  }),
  z.object({
    action: z.literal("verify"),
    code: z.string().regex(/^[0-9]{6}$/),
  }),
  z.object({ action: z.literal("set_enabled"), enabled: z.boolean() }),
  z.object({ action: z.literal("bot_info") }),
]);

export async function GET(request: Request) {
  return mailboxRequest(request, async (userId) =>
    NextResponse.json(await alertSettingsView(userId))
  );
}

export async function POST(request: Request) {
  return mailboxRequest(request, async (userId) => {
    const body = input.parse(await request.json());
    if (body.action === "bot_info") {
      return NextResponse.json(await telegramSetupInfo());
    }
    if (body.action === "request_code") {
      await requestTelegramVerification(userId, body.chatId);
    }
    if (body.action === "verify") {
      await confirmTelegramVerification(userId, body.code);
    }
    if (body.action === "set_enabled") {
      await setTelegramAlertsEnabled(userId, body.enabled);
    }
    return NextResponse.json(await alertSettingsView(userId));
  });
}
