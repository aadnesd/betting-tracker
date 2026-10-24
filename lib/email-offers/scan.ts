import "server-only";

import { listAccountsByUser } from "@/lib/db/queries";
import { getAlertSettings } from "./alerts";
import { assessOfferEmail } from "./assess";
import { createMailClient, MailboxError, type MailConnection } from "./nango";
import {
  claimMailboxScan,
  existingMailboxUserIds,
  knownOfferMessageIds,
  listMailboxScans,
  releaseMailboxScan,
  saveScanPage,
} from "./repository";

const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

export function scanWindow(
  state: {
    scanAfter: Date | null;
    scanBefore: Date | null;
    checkedUntil: Date | null;
  },
  now: Date,
  lookbackMs = LOOKBACK_MS
) {
  const before =
    state.scanBefore ?? new Date(Math.floor(now.getTime() / 1000) * 1000);
  const after =
    state.scanAfter ??
    new Date(
      (state.checkedUntil?.getTime() ?? before.getTime() - lookbackMs) - 1000
    );
  return { after, before };
}

export async function scanMailbox(
  client: ReturnType<typeof createMailClient>,
  connection: MailConnection,
  email: string,
  kind: "history" | "live" = "history"
) {
  const userId = connection.tags!.end_user_id;
  const now = new Date();
  const state = await claimMailboxScan(userId, email, now, kind);
  if (!state) {
    return { status: "busy" as const, scanned: 0, found: 0, more: false };
  }
  try {
    const settings =
      kind === "live" ? await getAlertSettings(userId) : undefined;
    const liveStart =
      settings?.enabledAt ?? new Date(now.getTime() - 10 * 60_000);
    const { after, before } = scanWindow(
      state,
      now,
      kind === "live"
        ? Math.max(0, now.getTime() - liveStart.getTime())
        : LOOKBACK_MS
    );
    const [page, known, accounts] = await Promise.all([
      client.readPage(connection.connection_id, {
        after: after.toISOString(),
        before: before.toISOString(),
        ...(state.pageToken ? { cursor: state.pageToken } : {}),
      }),
      knownOfferMessageIds(userId, email),
      listAccountsByUser({ userId }),
    ]);
    const bookmakers = accounts
      .filter((a) => a.kind === "bookmaker" && a.status === "active")
      .map(({ name, currency }) => ({ name, currency }));
    const offers = [];
    const messages = page.messages.filter((message) => !known.has(message.id));
    // At most three model calls at a time and ten messages per Nango page.
    for (let index = 0; index < messages.length; index += 3) {
      const assessed = await Promise.all(
        messages.slice(index, index + 3).map(async (message) => ({
          email: message,
          assessment: await assessOfferEmail(message, bookmakers, now),
        }))
      );
      offers.push(
        ...assessed.filter(
          ({ assessment }) => assessment.isOffer && assessment.confidence >= 0.5
        )
      );
    }
    await saveScanPage(
      state,
      after,
      before,
      page.nextCursor,
      offers,
      page.messages.map((message) => message.id)
    );
    return {
      status: "scanned" as const,
      scanned: messages.length,
      found: offers.length,
      more: Boolean(page.nextCursor),
    };
  } finally {
    await releaseMailboxScan(state);
  }
}

// A request processes one page per selected mailbox. Rotating by last attempt
// keeps large mailboxes and multiple users progressing within a bounded job.
export async function scanEmailOffers(userId?: string) {
  const client = createMailClient();
  const kind = userId ? "history" : "live";
  const [connections, states] = await Promise.all([
    client.listConnections(userId),
    listMailboxScans(userId),
  ]);
  // A removed app user may still have a connection in Nango. Never read it or
  // let a foreign-key failure on that orphan block other users' scans.
  const existingUsers = await existingMailboxUserIds(
    connections.map((connection) => connection.tags!.end_user_id)
  );
  const seen = new Set<string>();
  const mailboxes = [];
  let reconnect = 0;
  let unavailable = 0;
  for (const connection of connections.sort((a, b) =>
    b.created.localeCompare(a.created)
  )) {
    if (!existingUsers.has(connection.tags!.end_user_id)) {
      continue;
    }
    if (connection.errors?.some((error) => error.type === "auth")) {
      reconnect++;
      continue;
    }
    const mailbox = await client.mailbox(connection).catch(() => {
      unavailable++;
      return null;
    });
    if (!mailbox) {
      continue;
    }
    if (!mailbox.email) {
      if (mailbox.needsReconnect) {
        reconnect++;
      }
      continue;
    }
    const key = `${connection.tags!.end_user_id}:${mailbox.email}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const state = states.find(
      (s) =>
        s.userId === connection.tags!.end_user_id &&
        s.mailboxEmail === mailbox.email &&
        s.kind === kind
    );
    mailboxes.push({
      connection,
      email: mailbox.email,
      attemptedAt: state?.attemptedAt?.getTime() ?? 0,
    });
  }
  if (userId && mailboxes.length === 0) {
    if (unavailable) {
      throw new MailboxError(
        503,
        "Gmail is temporarily unavailable. Try scanning again later."
      );
    }
    throw new MailboxError(
      409,
      reconnect
        ? "Reconnect your Gmail account before scanning."
        : "Connect Gmail before scanning for offers."
    );
  }
  mailboxes.sort((a, b) => a.attemptedAt - b.attemptedAt);
  const results = [];
  // A single page keeps the provider and model calls within the request limit.
  for (const mailbox of mailboxes.slice(0, 1)) {
    try {
      results.push(
        await scanMailbox(client, mailbox.connection, mailbox.email, kind)
      );
    } catch (error) {
      if (userId) {
        throw error;
      }
      results.push({
        status: "error" as const,
        scanned: 0,
        found: 0,
        more: true,
      });
    }
  }
  return {
    scanned: results.reduce((n, r) => n + r.scanned, 0),
    found: results.reduce((n, r) => n + r.found, 0),
    more: results.some((r) => r.more) || mailboxes.length > results.length,
    busy: results.some((r) => r.status === "busy"),
    errors: unavailable + results.filter((r) => r.status === "error").length,
    needsReconnect: reconnect,
  };
}
