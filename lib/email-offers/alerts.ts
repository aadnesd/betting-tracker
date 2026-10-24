import "server-only";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import {
  emailAlertSettings,
  emailOffer,
  emailOfferAlert,
} from "@/lib/db/schema";
import { isAlertWorthy, offerAlertText } from "./alert-content";
import { MailboxError } from "./nango";
import {
  isTelegramConfigured,
  sendTelegram,
  TelegramError,
  telegramBot,
} from "./telegram";

function verificationHash(userId: string, chatId: string, code: string) {
  return createHash("sha256")
    .update(`${userId}:${chatId}:${code}`)
    .digest("hex");
}

export async function getAlertSettings(userId: string) {
  const [settings] = await db
    .select()
    .from(emailAlertSettings)
    .where(eq(emailAlertSettings.userId, userId));
  return settings;
}

export async function alertSettingsView(userId: string) {
  const settings = await getAlertSettings(userId);
  const deliveries = await db
    .select({
      sentAt: emailOfferAlert.sentAt,
      lastError: emailOfferAlert.lastError,
    })
    .from(emailOfferAlert)
    .where(eq(emailOfferAlert.userId, userId))
    .orderBy(desc(emailOfferAlert.dueAt))
    .limit(1);
  return {
    configured: isTelegramConfigured(),
    enabled: settings?.enabled ?? false,
    chatId: settings?.chatId ?? null,
    pending: Boolean(
      settings?.verificationExpiresAt &&
        settings.verificationExpiresAt > new Date() &&
        settings.verificationAttempts < 5
    ),
    lastDelivery: deliveries.at(0) ?? null,
  };
}

export async function requestTelegramVerification(
  userId: string,
  chatId: string
) {
  if (!isTelegramConfigured()) {
    throw new MailboxError(503, "Telegram alerts are not configured yet.");
  }
  const now = new Date();
  const code = randomInt(100_000, 1_000_000).toString();
  await db.insert(emailAlertSettings).values({ userId }).onConflictDoNothing();
  const [claimed] = await db
    .update(emailAlertSettings)
    .set({
      pendingChatId: chatId,
      verificationHash: verificationHash(userId, chatId, code),
      verificationExpiresAt: new Date(now.getTime() + 10 * 60_000),
      verificationAttempts: 0,
      requestedAt: now,
    })
    .where(
      and(
        eq(emailAlertSettings.userId, userId),
        or(
          isNull(emailAlertSettings.requestedAt),
          lt(emailAlertSettings.requestedAt, new Date(now.getTime() - 60_000))
        )
      )
    )
    .returning();
  if (!claimed) {
    throw new MailboxError(
      429,
      "Wait a minute before requesting another code."
    );
  }
  try {
    await sendTelegram(
      chatId,
      `Betting Tracker verification code: ${code}\nEnter this code in your Email offers settings to enable alerts. It expires in 10 minutes. Ignore this message if you did not request it.`
    );
  } catch (error) {
    await db
      .update(emailAlertSettings)
      .set({
        verificationHash: null,
        verificationExpiresAt: null,
        pendingChatId: null,
      })
      .where(
        and(
          eq(emailAlertSettings.userId, userId),
          eq(emailAlertSettings.verificationHash, claimed.verificationHash!)
        )
      );
    if (error instanceof TelegramError) {
      throw new MailboxError(502, error.message);
    }
    throw new MailboxError(
      502,
      "Could not send the Telegram code. Wait a minute and try again."
    );
  }
}

export async function confirmTelegramVerification(
  userId: string,
  code: string
) {
  // Increment atomically before checking to bound concurrent guesses, too.
  const [pending] = await db
    .update(emailAlertSettings)
    .set({
      verificationAttempts: sql`${emailAlertSettings.verificationAttempts} + 1`,
    })
    .where(
      and(
        eq(emailAlertSettings.userId, userId),
        gt(emailAlertSettings.verificationExpiresAt, new Date()),
        lt(emailAlertSettings.verificationAttempts, 5)
      )
    )
    .returning();
  if (
    !pending?.pendingChatId ||
    verificationHash(userId, pending.pendingChatId, code) !==
      pending.verificationHash
  ) {
    throw new MailboxError(
      400,
      "Invalid or expired code. Check Telegram or request a new code."
    );
  }
  const [confirmed] = await db
    .update(emailAlertSettings)
    .set({
      chatId: pending.pendingChatId,
      enabled: true,
      enabledAt: new Date(),
      bindingId: randomUUID(),
      pendingChatId: null,
      verificationHash: null,
      verificationExpiresAt: null,
    })
    .where(
      and(
        eq(emailAlertSettings.userId, userId),
        eq(emailAlertSettings.verificationHash, pending.verificationHash!)
      )
    )
    .returning();
  if (!confirmed) {
    throw new MailboxError(
      400,
      "This code has already been used. Request a new code."
    );
  }
}

export async function setTelegramAlertsEnabled(
  userId: string,
  enabled: boolean
) {
  if (enabled && !isTelegramConfigured()) {
    throw new MailboxError(503, "Telegram alerts are not configured yet.");
  }
  const [settings] = await db
    .update(emailAlertSettings)
    .set({
      enabled,
      enabledAt: enabled ? new Date() : null,
      bindingId: randomUUID(),
    })
    .where(
      and(
        eq(emailAlertSettings.userId, userId),
        sql`${emailAlertSettings.chatId} IS NOT NULL`
      )
    )
    .returning();
  if (!settings) {
    throw new MailboxError(409, "Verify your Telegram chat first.");
  }
}

export async function telegramSetupInfo() {
  const bot = await telegramBot();
  return { botUrl: `https://t.me/${bot.username}` };
}

export async function deliverOfferAlerts(userId?: string) {
  if (!isTelegramConfigured()) {
    return { sent: 0, failed: 0, skipped: 0 };
  }
  const now = new Date();
  const due = await db
    .select()
    .from(emailOfferAlert)
    .where(
      and(
        userId ? eq(emailOfferAlert.userId, userId) : undefined,
        isNull(emailOfferAlert.sentAt),
        isNull(emailOfferAlert.skippedAt),
        lte(emailOfferAlert.dueAt, now),
        or(
          isNull(emailOfferAlert.leaseUntil),
          lt(emailOfferAlert.leaseUntil, now)
        )
      )
    )
    .orderBy(emailOfferAlert.dueAt)
    .limit(5);
  const result = { sent: 0, failed: 0, skipped: 0 };
  for (const candidate of due) {
    const token = randomUUID();
    const [alert] = await db
      .update(emailOfferAlert)
      .set({
        leaseToken: token,
        leaseUntil: new Date(Date.now() + 60_000),
        attempts: sql`${emailOfferAlert.attempts} + 1`,
      })
      .where(
        and(
          eq(emailOfferAlert.id, candidate.id),
          isNull(emailOfferAlert.sentAt),
          isNull(emailOfferAlert.skippedAt),
          or(
            isNull(emailOfferAlert.leaseUntil),
            lt(emailOfferAlert.leaseUntil, new Date())
          )
        )
      )
      .returning();
    if (!alert) {
      continue;
    }
    const owned = and(
      eq(emailOfferAlert.id, alert.id),
      eq(emailOfferAlert.leaseToken, token)
    );
    try {
      const [settings, offers] = await Promise.all([
        getAlertSettings(alert.userId),
        db
          .select()
          .from(emailOffer)
          .where(
            and(
              eq(emailOffer.id, alert.offerId),
              eq(emailOffer.userId, alert.userId)
            )
          ),
      ]);
      const offer = offers[0];
      if (
        !settings?.enabled ||
        !settings.chatId ||
        settings.bindingId !== alert.bindingId ||
        !offer ||
        offer.status === "dismissed" ||
        !isAlertWorthy(offer.assessment, new Date()) ||
        !settings.enabledAt ||
        offer.receivedAt < settings.enabledAt
      ) {
        await db
          .update(emailOfferAlert)
          .set({ skippedAt: new Date(), leaseToken: null, leaseUntil: null })
          .where(owned);
        result.skipped++;
        continue;
      }
      const sent = await sendTelegram(settings.chatId, offerAlertText(offer));
      await db
        .update(emailOfferAlert)
        .set({
          sentAt: new Date(),
          messageId: sent.message_id,
          lastError: null,
          leaseToken: null,
          leaseUntil: null,
        })
        .where(owned);
      result.sent++;
    } catch (error) {
      const permanent = error instanceof TelegramError && error.permanent;
      const seconds = Math.max(
        60 * 2 ** Math.min(alert.attempts, 8),
        error instanceof TelegramError ? error.retryAfter : 0
      );
      await db
        .update(emailOfferAlert)
        .set({
          dueAt: new Date(Date.now() + seconds * 1000),
          lastError:
            error instanceof TelegramError
              ? error.message
              : alert.attempts >= 8
                ? "Delivery stopped after eight failed attempts. Check Telegram and reconnect alerts."
                : "Delivery failed and will be retried.",
          skippedAt: permanent || alert.attempts >= 8 ? new Date() : null,
          leaseToken: null,
          leaseUntil: null,
        })
        .where(owned);
      result.failed++;
    }
  }
  return result;
}
