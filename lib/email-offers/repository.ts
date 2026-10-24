import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/connection";
import { emailMailboxScan, emailOffer, user } from "@/lib/db/schema";
import type { OfferAssessment, OfferEmail } from "./types";

export async function existingMailboxUserIds(userIds: string[]) {
  const validIds = [...new Set(userIds)].filter(
    (id) => z.string().uuid().safeParse(id).success
  );
  if (validIds.length === 0) {
    return new Set<string>();
  }
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.id, validIds));
  return new Set(rows.map((row) => row.id));
}

export async function listEmailOffers(userId: string) {
  return db
    .select()
    .from(emailOffer)
    .where(
      and(
        eq(emailOffer.userId, userId),
        or(eq(emailOffer.status, "new"), eq(emailOffer.status, "saved"))
      )
    )
    .orderBy(desc(emailOffer.receivedAt))
    .limit(100);
}

export async function updateEmailOfferStatus(
  userId: string,
  id: string,
  status: "new" | "saved" | "dismissed"
): Promise<{ id: string } | undefined> {
  const [result] = await db
    .update(emailOffer)
    .set({ status })
    .where(and(eq(emailOffer.userId, userId), eq(emailOffer.id, id)))
    .returning({ id: emailOffer.id });
  return result;
}

export function listMailboxScans(userId?: string) {
  return db
    .select()
    .from(emailMailboxScan)
    .where(userId ? eq(emailMailboxScan.userId, userId) : undefined)
    .orderBy(asc(emailMailboxScan.attemptedAt));
}

export async function claimMailboxScan(
  userId: string,
  mailboxEmail: string,
  now: Date
) {
  await db
    .insert(emailMailboxScan)
    .values({ userId, mailboxEmail })
    .onConflictDoNothing();
  const [state] = await db
    .update(emailMailboxScan)
    .set({
      leaseToken: randomUUID(),
      leaseUntil: new Date(now.getTime() + 240_000),
      attemptedAt: now,
    })
    .where(
      and(
        eq(emailMailboxScan.userId, userId),
        eq(emailMailboxScan.mailboxEmail, mailboxEmail),
        or(
          isNull(emailMailboxScan.leaseUntil),
          lt(emailMailboxScan.leaseUntil, now)
        )
      )
    )
    .returning();
  return state;
}

export type ScanState = NonNullable<
  Awaited<ReturnType<typeof claimMailboxScan>>
>;
export type AssessedEmail = { email: OfferEmail; assessment: OfferAssessment };

export async function knownOfferMessageIds(
  userId: string,
  mailboxEmail: string
) {
  const rows = await db
    .select({ messageId: emailOffer.messageId })
    .from(emailOffer)
    .where(
      and(
        eq(emailOffer.userId, userId),
        eq(emailOffer.mailboxEmail, mailboxEmail)
      )
    );
  return new Set(rows.map((row) => row.messageId));
}

// The page's offers and cursor are committed together. A failed page is retried.
export async function saveScanPage(
  state: ScanState,
  after: Date,
  before: Date,
  nextCursor: string | undefined,
  offers: AssessedEmail[]
) {
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(emailMailboxScan)
      .set({
        checkedUntil: nextCursor ? state.checkedUntil : before,
        scanAfter: nextCursor ? after : null,
        scanBefore: nextCursor ? before : null,
        pageToken: nextCursor ?? null,
        leaseToken: null,
        leaseUntil: null,
      })
      .where(
        and(
          eq(emailMailboxScan.id, state.id),
          eq(emailMailboxScan.leaseToken, state.leaseToken!)
        )
      )
      .returning({ id: emailMailboxScan.id });
    if (!claimed) {
      throw new Error("Mailbox scan lease was lost.");
    }
    if (offers.length > 0) {
      await tx
        .insert(emailOffer)
        .values(
          offers.map(({ email, assessment }) => ({
            userId: state.userId,
            mailboxEmail: state.mailboxEmail,
            messageId: email.id,
            threadId: email.threadId,
            sender: email.sender,
            subject: email.subject,
            receivedAt: new Date(email.receivedAt),
            assessment,
          }))
        )
        .onConflictDoNothing();
    }
  });
}

export async function releaseMailboxScan(state: ScanState) {
  await db
    .update(emailMailboxScan)
    .set({ leaseToken: null, leaseUntil: null })
    .where(
      and(
        eq(emailMailboxScan.id, state.id),
        eq(emailMailboxScan.leaseToken, state.leaseToken!)
      )
    );
}
