import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
  sql,
  sum,
  type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ArtifactKind } from "@/components/artifact";
import type { VisibilityType } from "@/components/visibility-selector";
import { ChatSDKError } from "../errors";
import type { AppUsage } from "../usage";
import { generateUUID } from "../utils";
import {
  account,
  accountTransaction,
  auditLog,
  backBet,
  type Chat,
  chat,
  type DBMessage,
  document,
  layBet,
  matchedBet,
  message,
  promo,
  type Suggestion,
  screenshotUpload,
  stream,
  suggestion,
  type User,
  user,
  vote,
} from "./schema";
import { generateHashedPassword } from "./utils";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

const normalizeAccountName = (name: string) => name.trim().toLowerCase();
const normalizePromoType = (type: string) => type.trim().toLowerCase();

export async function getUser(email: string): Promise<User[]> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create user");
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db.insert(user).values({ email, password }).returning({
      id: user.id,
      email: user.email,
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create guest user"
    );
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const userChats = await db
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.userId, userId));

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((c) => c.id);

    await db.delete(vote).where(inArray(vote.chatId, chatIds));
    await db.delete(message).where(inArray(message.chatId, chatIds));
    await db.delete(stream).where(inArray(stream.chatId, chatIds));

    const deletedChats = await db
      .delete(chat)
      .where(eq(chat.userId, userId))
      .returning();

    return { deletedCount: deletedChats.length };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id)
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    return await db.insert(message).values(messages);
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save messages");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === "up" })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === "up",
    });
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save document");
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp)
        )
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(eq(suggestion.documentId, documentId));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
      );

    const messageIds = messagesToDelete.map(
      (currentMessage) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatLastContextById({
  chatId,
  context,
}: {
  chatId: string;
  // Store merged server-enriched usage object
  context: AppUsage;
}) {
  try {
    return await db
      .update(chat)
      .set({ lastContext: context })
      .where(eq(chat.id, chatId));
  } catch (error) {
    console.warn("Failed to update lastContext for chat", chatId, error);
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

export async function getAccountById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select()
      .from(account)
      .where(and(eq(account.id, id), eq(account.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to fetch account");
  }
}

export async function getAccountByName({
  userId,
  name,
  kind,
}: {
  userId: string;
  name: string;
  kind: "bookmaker" | "exchange";
}) {
  try {
    const normalized = normalizeAccountName(name);
    const [row] = await db
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, userId),
          eq(account.nameNormalized, normalized),
          eq(account.kind, kind)
        )
      )
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to fetch account");
  }
}

export async function createAccount({
  userId,
  name,
  kind,
  currency,
  commission,
  limits,
  status,
}: {
  userId: string;
  name: string;
  kind: "bookmaker" | "exchange";
  currency?: string | null;
  commission?: number | null;
  limits?: Record<string, unknown> | null;
  status?: "active" | "archived";
}) {
  try {
    const normalizedName = normalizeAccountName(name);
    const values: typeof account.$inferInsert = {
      createdAt: new Date(),
      userId,
      name: name.trim(),
      nameNormalized: normalizedName,
      kind,
      currency: currency ?? null,
      commission:
        commission === undefined || commission === null
          ? null
          : commission.toString(),
      status: status ?? "active",
      limits: limits ?? null,
    };

    const [row] = await db.insert(account).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create account");
  }
}

export async function getOrCreateAccount({
  userId,
  name,
  kind,
  currency,
}: {
  userId: string;
  name: string;
  kind: "bookmaker" | "exchange";
  currency?: string | null;
}) {
  const trimmed = name.trim();
  const safeName = trimmed.length > 0 ? trimmed : "Unknown";
  const existing = await getAccountByName({
    userId,
    name: safeName,
    kind,
  });
  if (existing) {
    return existing;
  }
  return createAccount({ userId, name: safeName, kind, currency });
}

export async function listAccountsByUser({
  userId,
  limit = 200,
}: {
  userId: string;
  limit?: number;
}) {
  try {
    return await db
      .select()
      .from(account)
      .where(eq(account.userId, userId))
      .orderBy(desc(account.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list accounts"
    );
  }
}

export async function getPromoById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select()
      .from(promo)
      .where(and(eq(promo.id, id), eq(promo.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to fetch promo");
  }
}

export async function getPromoByType({
  userId,
  type,
}: {
  userId: string;
  type: string;
}) {
  try {
    const normalized = normalizePromoType(type);
    const [row] = await db
      .select()
      .from(promo)
      .where(
        and(eq(promo.userId, userId), eq(promo.typeNormalized, normalized))
      )
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to fetch promo");
  }
}

export async function createPromo({
  userId,
  type,
  minOdds,
  maxStake,
  expiry,
  terms,
}: {
  userId: string;
  type: string;
  minOdds?: number | null;
  maxStake?: number | null;
  expiry?: Date | null;
  terms?: string | null;
}) {
  try {
    const normalizedType = normalizePromoType(type);
    const values: typeof promo.$inferInsert = {
      createdAt: new Date(),
      userId,
      type: type.trim(),
      typeNormalized: normalizedType,
      minOdds:
        minOdds === undefined || minOdds === null ? null : minOdds.toString(),
      maxStake:
        maxStake === undefined || maxStake === null
          ? null
          : maxStake.toString(),
      expiry: expiry ?? null,
      terms: terms ?? null,
    };

    const [row] = await db.insert(promo).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create promo");
  }
}

export async function getOrCreatePromoByType({
  userId,
  type,
}: {
  userId: string;
  type: string;
}) {
  const trimmed = type.trim();
  const safeType = trimmed.length > 0 ? trimmed : "Unspecified";
  const existing = await getPromoByType({ userId, type: safeType });
  if (existing) {
    return existing;
  }
  return createPromo({ userId, type: safeType });
}

export async function listPromosByUser({
  userId,
  limit = 200,
}: {
  userId: string;
  limit?: number;
}) {
  try {
    return await db
      .select()
      .from(promo)
      .where(eq(promo.userId, userId))
      .orderBy(desc(promo.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list promos");
  }
}

export async function createAccountTransaction({
  userId,
  accountId,
  type,
  amount,
  currency,
  occurredAt,
  notes,
}: {
  userId: string;
  accountId: string;
  type: "deposit" | "withdrawal" | "bonus" | "adjustment";
  amount: number;
  currency: string;
  occurredAt?: Date | null;
  notes?: string | null;
}) {
  try {
    const values: typeof accountTransaction.$inferInsert = {
      createdAt: new Date(),
      userId,
      accountId,
      type,
      amount: amount.toString(),
      currency: currency.toUpperCase(),
      occurredAt: occurredAt ?? new Date(),
      notes: notes ?? null,
    };

    const [row] = await db.insert(accountTransaction).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create transaction"
    );
  }
}

export async function listTransactionsByAccount({
  userId,
  accountId,
  limit = 200,
}: {
  userId: string;
  accountId: string;
  limit?: number;
}) {
  try {
    return await db
      .select()
      .from(accountTransaction)
      .where(
        and(
          eq(accountTransaction.accountId, accountId),
          eq(accountTransaction.userId, userId)
        )
      )
      .orderBy(desc(accountTransaction.occurredAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list transactions"
    );
  }
}

type BetInputBase = {
  market: string;
  selection: string;
  odds: number;
  stake: number;
  exchange: string;
  accountId?: string | null;
  currency?: string | null;
  placedAt?: Date | null;
  settledAt?: Date | null;
  profitLoss?: number | null;
  confidence?: Record<string, number> | null;
  error?: string | null;
  status?: "draft" | "placed" | "matched" | "settled" | "needs_review" | "error";
};

export async function saveScreenshotUpload({
  userId,
  kind,
  url,
  filename,
  contentType,
  size,
}: {
  userId: string;
  kind: "back" | "lay";
  url: string;
  filename?: string | null;
  contentType?: string | null;
  size?: number | null;
}) {
  try {
    const values: typeof screenshotUpload.$inferInsert = {
      createdAt: new Date(),
      userId,
      kind,
      url,
      filename: filename ?? null,
      contentType: contentType ?? null,
      size: size ? size.toString() : null,
      status: "uploaded",
    };

    const [row] = await db.insert(screenshotUpload).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to persist screenshot metadata"
    );
  }
}

export async function getScreenshotById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select()
      .from(screenshotUpload)
      .where(
        and(eq(screenshotUpload.id, id), eq(screenshotUpload.userId, userId))
      )
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to fetch screenshot"
    );
  }
}

export async function updateScreenshotStatus({
  id,
  status,
  error,
  parsedOutput,
  confidence,
}: {
  id: string;
  status: "uploaded" | "parsed" | "needs_review" | "error";
  error?: string | null;
  parsedOutput?: unknown | null;
  confidence?: Record<string, number> | null;
}) {
  try {
    const values: Partial<typeof screenshotUpload.$inferInsert> = {
      status,
      error: error ?? null,
    };

    if (parsedOutput !== undefined) {
      values.parsedOutput = parsedOutput;
    }

    if (confidence !== undefined) {
      values.confidence = confidence;
    }

    await db
      .update(screenshotUpload)
      .set(values)
      .where(eq(screenshotUpload.id, id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update screenshot status"
    );
  }
}

export async function saveBackBet({
  userId,
  screenshotId,
  ...bet
}: BetInputBase & { userId: string; screenshotId: string }) {
  try {
    const values: typeof backBet.$inferInsert = {
      createdAt: new Date(),
      userId,
      accountId: bet.accountId ?? null,
      screenshotId,
      market: bet.market,
      selection: bet.selection,
      odds: bet.odds.toString(),
      stake: bet.stake.toString(),
      exchange: bet.exchange,
      currency: bet.currency ?? null,
      placedAt: bet.placedAt ?? null,
      settledAt: bet.settledAt ?? null,
      profitLoss:
        bet.profitLoss === undefined || bet.profitLoss === null
          ? null
          : bet.profitLoss.toString(),
      confidence: bet.confidence ?? null,
      status: bet.status ?? "draft",
      error: bet.error ?? null,
    };

    const [row] = await db.insert(backBet).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save back bet");
  }
}

export async function saveLayBet({
  userId,
  screenshotId,
  ...bet
}: BetInputBase & { userId: string; screenshotId: string }) {
  try {
    const values: typeof layBet.$inferInsert = {
      createdAt: new Date(),
      userId,
      accountId: bet.accountId ?? null,
      screenshotId,
      market: bet.market,
      selection: bet.selection,
      odds: bet.odds.toString(),
      stake: bet.stake.toString(),
      exchange: bet.exchange,
      currency: bet.currency ?? null,
      placedAt: bet.placedAt ?? null,
      settledAt: bet.settledAt ?? null,
      profitLoss:
        bet.profitLoss === undefined || bet.profitLoss === null
          ? null
          : bet.profitLoss.toString(),
      confidence: bet.confidence ?? null,
      status: bet.status ?? "draft",
      error: bet.error ?? null,
    };

    const [row] = await db.insert(layBet).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save lay bet");
  }
}

export async function createMatchedBetRecord({
  userId,
  backBetId,
  layBetId,
  market,
  selection,
  promoId,
  promoType,
  status,
  netExposure,
  notes,
  lastError,
}: {
  userId: string;
  backBetId?: string | null;
  layBetId?: string | null;
  market: string;
  selection: string;
  promoId?: string | null;
  promoType?: string | null;
  status?: "draft" | "matched" | "settled" | "needs_review";
  netExposure?: number | null;
  notes?: string | null;
  lastError?: string | null;
}) {
  try {
    const values: typeof matchedBet.$inferInsert = {
      createdAt: new Date(),
      userId,
      backBetId: backBetId ?? null,
      layBetId: layBetId ?? null,
      market,
      selection,
      promoId: promoId ?? null,
      promoType: promoType ?? null,
      status: status ?? "draft",
      netExposure:
        netExposure === undefined || netExposure === null
          ? null
          : netExposure.toString(),
      notes: notes ?? null,
      lastError: lastError ?? null,
    };

    const [row] = await db.insert(matchedBet).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create matched bet"
    );
  }
}

export async function listMatchedBetsByUser({
  userId,
  limit = 50,
}: {
  userId: string;
  limit?: number;
}) {
  try {
    return await db
      .select({
        id: matchedBet.id,
        market: matchedBet.market,
        selection: matchedBet.selection,
        status: matchedBet.status,
        netExposure: matchedBet.netExposure,
        createdAt: matchedBet.createdAt,
        backBetId: matchedBet.backBetId,
        layBetId: matchedBet.layBetId,
        promoId: matchedBet.promoId,
      })
      .from(matchedBet)
      .where(eq(matchedBet.userId, userId))
      .orderBy(desc(matchedBet.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list matched bets"
    );
  }
}

export async function getMatchedBetById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select()
      .from(matchedBet)
      .where(and(eq(matchedBet.id, id), eq(matchedBet.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to fetch matched bet"
    );
  }
}

export async function updateMatchedBetRecord({
  id,
  userId,
  status,
  notes,
  netExposure,
  backBetId,
  layBetId,
  promoId,
  promoType,
  lastError,
  confirmedAt,
}: {
  id: string;
  userId: string;
  status?: "draft" | "matched" | "settled" | "needs_review";
  notes?: string | null;
  netExposure?: number | null;
  backBetId?: string | null;
  layBetId?: string | null;
  promoId?: string | null;
  promoType?: string | null;
  lastError?: string | null;
  confirmedAt?: Date | null;
}) {
  try {
    const values: Partial<typeof matchedBet.$inferInsert> = {};

    if (status !== undefined) {
      values.status = status;
    }
    if (notes !== undefined) {
      values.notes = notes;
    }
    if (netExposure !== undefined) {
      values.netExposure = netExposure === null ? null : netExposure.toString();
    }
    if (backBetId !== undefined) {
      values.backBetId = backBetId;
    }
    if (layBetId !== undefined) {
      values.layBetId = layBetId;
    }
    if (promoId !== undefined) {
      values.promoId = promoId;
    }
    if (promoType !== undefined) {
      values.promoType = promoType;
    }
    if (lastError !== undefined) {
      values.lastError = lastError;
    }
    if (confirmedAt !== undefined) {
      values.confirmedAt = confirmedAt;
    }

    const [row] = await db
      .update(matchedBet)
      .set(values)
      .where(and(eq(matchedBet.id, id), eq(matchedBet.userId, userId)))
      .returning();

    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update matched bet"
    );
  }
}

export async function getMatchedBetWithParts({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    // First get the matched bet with back/lay bets joined
    const [row] = await db
      .select({
        matched: matchedBet,
        back: backBet,
        lay: layBet,
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .where(eq(matchedBet.id, id));

    if (!row || row.matched.userId !== userId) {
      return null;
    }

    // Fetch screenshots separately using the screenshot IDs from bets
    let backScreenshot = null;
    let layScreenshot = null;

    if (row.back?.screenshotId) {
      const [backSs] = await db
        .select()
        .from(screenshotUpload)
        .where(eq(screenshotUpload.id, row.back.screenshotId))
        .limit(1);
      backScreenshot = backSs ?? null;
    }

    if (row.lay?.screenshotId) {
      const [laySs] = await db
        .select()
        .from(screenshotUpload)
        .where(eq(screenshotUpload.id, row.lay.screenshotId))
        .limit(1);
      layScreenshot = laySs ?? null;
    }

    return {
      matched: row.matched,
      back: row.back,
      lay: row.lay,
      backScreenshot,
      layScreenshot,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to fetch matched bet details"
    );
  }
}

// Audit log type definitions
export type AuditEntityType =
  | "back_bet"
  | "lay_bet"
  | "matched_bet"
  | "account"
  | "screenshot";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "reconcile"
  | "attach_leg";

export async function createAuditEntry({
  userId,
  entityType,
  entityId,
  action,
  changes,
  notes,
}: {
  userId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  changes?: Record<string, unknown> | null;
  notes?: string | null;
}) {
  try {
    const values: typeof auditLog.$inferInsert = {
      createdAt: new Date(),
      userId,
      entityType,
      entityId,
      action,
      changes: changes ?? null,
      notes: notes ?? null,
    };

    const [row] = await db.insert(auditLog).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create audit entry"
    );
  }
}

export async function listAuditEntriesByEntity({
  entityType,
  entityId,
  limit = 100,
}: {
  entityType: AuditEntityType;
  entityId: string;
  limit?: number;
}) {
  try {
    return await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId))
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list audit entries"
    );
  }
}

export async function listAuditEntriesByUser({
  userId,
  limit = 100,
}: {
  userId: string;
  limit?: number;
}) {
  try {
    return await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, userId))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list audit entries by user"
    );
  }
}

// Reconciliation queue: list matched bets by status filter
type MatchedBetStatus = "draft" | "matched" | "settled" | "needs_review";

export async function listMatchedBetsByStatus({
  userId,
  statuses,
  limit = 100,
}: {
  userId: string;
  statuses: MatchedBetStatus[];
  limit?: number;
}) {
  try {
    return await db
      .select({
        id: matchedBet.id,
        market: matchedBet.market,
        selection: matchedBet.selection,
        status: matchedBet.status,
        netExposure: matchedBet.netExposure,
        createdAt: matchedBet.createdAt,
        backBetId: matchedBet.backBetId,
        layBetId: matchedBet.layBetId,
        promoId: matchedBet.promoId,
        promoType: matchedBet.promoType,
        notes: matchedBet.notes,
        lastError: matchedBet.lastError,
      })
      .from(matchedBet)
      .where(
        and(
          eq(matchedBet.userId, userId),
          inArray(matchedBet.status, statuses)
        )
      )
      .orderBy(desc(matchedBet.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list matched bets by status"
    );
  }
}

// Count matched bets by status (for queue badges)
export async function countMatchedBetsByStatus({
  userId,
  statuses,
}: {
  userId: string;
  statuses: MatchedBetStatus[];
}) {
  try {
    const [result] = await db
      .select({ count: count(matchedBet.id) })
      .from(matchedBet)
      .where(
        and(
          eq(matchedBet.userId, userId),
          inArray(matchedBet.status, statuses)
        )
      );
    return result?.count ?? 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to count matched bets by status"
    );
  }
}

// ============================================================================
// REPORTING QUERIES
// ============================================================================

export type ReportingDateRange = {
  startDate: Date;
  endDate: Date;
};

/**
 * Get all settled matched bets with their back/lay legs for reporting.
 * Includes all data needed for profit, ROI, and qualifying loss calculations.
 */
export async function getSettledMatchedBetsForReporting({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  try {
    const conditions: SQL<unknown>[] = [
      eq(matchedBet.userId, userId),
      eq(matchedBet.status, "settled"),
    ];

    if (startDate) {
      conditions.push(gte(matchedBet.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(matchedBet.createdAt, endDate));
    }

    const rows = await db
      .select({
        matched: matchedBet,
        back: backBet,
        lay: layBet,
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .where(and(...conditions))
      .orderBy(desc(matchedBet.createdAt));

    return rows;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get settled matched bets for reporting"
    );
  }
}

/**
 * Get all matched bets (any status) for exposure and activity reporting.
 */
export async function getMatchedBetsForReporting({
  userId,
  startDate,
  endDate,
  statuses,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
  statuses?: MatchedBetStatus[];
}) {
  try {
    const conditions: SQL<unknown>[] = [eq(matchedBet.userId, userId)];

    if (startDate) {
      conditions.push(gte(matchedBet.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(matchedBet.createdAt, endDate));
    }
    if (statuses && statuses.length > 0) {
      conditions.push(inArray(matchedBet.status, statuses));
    }

    const rows = await db
      .select({
        matched: matchedBet,
        back: backBet,
        lay: layBet,
        backAccount: account,
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .leftJoin(account, eq(backBet.accountId, account.id))
      .where(and(...conditions))
      .orderBy(desc(matchedBet.createdAt));

    return rows;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get matched bets for reporting"
    );
  }
}

/**
 * Get aggregate statistics for matched bets in a date range.
 * Returns counts by status and total net exposure.
 */
export async function getMatchedBetAggregates({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  try {
    const conditions: SQL<unknown>[] = [eq(matchedBet.userId, userId)];

    if (startDate) {
      conditions.push(gte(matchedBet.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(matchedBet.createdAt, endDate));
    }

    const [result] = await db
      .select({
        totalCount: count(matchedBet.id),
        totalNetExposure: sum(matchedBet.netExposure),
      })
      .from(matchedBet)
      .where(and(...conditions));

    // Get counts by status
    const statusCounts = await db
      .select({
        status: matchedBet.status,
        count: count(matchedBet.id),
      })
      .from(matchedBet)
      .where(and(...conditions))
      .groupBy(matchedBet.status);

    return {
      totalCount: result?.totalCount ?? 0,
      totalNetExposure: result?.totalNetExposure
        ? Number.parseFloat(result.totalNetExposure)
        : 0,
      statusCounts: statusCounts.reduce(
        (acc, row) => {
          acc[row.status] = row.count;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get matched bet aggregates"
    );
  }
}

/**
 * Get profit/loss aggregates by promo type.
 */
export async function getProfitByPromoType({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  try {
    const conditions: SQL<unknown>[] = [
      eq(matchedBet.userId, userId),
      eq(matchedBet.status, "settled"),
    ];

    if (startDate) {
      conditions.push(gte(matchedBet.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(matchedBet.createdAt, endDate));
    }

    // Sum profitLoss from back and lay bets grouped by promo type
    const rows = await db
      .select({
        promoType: matchedBet.promoType,
        count: count(matchedBet.id),
        totalBackProfitLoss: sum(backBet.profitLoss),
        totalLayProfitLoss: sum(layBet.profitLoss),
        totalBackStake: sum(backBet.stake),
        totalLayStake: sum(layBet.stake),
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .where(and(...conditions))
      .groupBy(matchedBet.promoType);

    return rows.map((row) => ({
      promoType: row.promoType ?? "Unspecified",
      count: row.count,
      totalProfitLoss:
        (row.totalBackProfitLoss
          ? Number.parseFloat(row.totalBackProfitLoss)
          : 0) +
        (row.totalLayProfitLoss
          ? Number.parseFloat(row.totalLayProfitLoss)
          : 0),
      totalStake:
        (row.totalBackStake ? Number.parseFloat(row.totalBackStake) : 0) +
        (row.totalLayStake ? Number.parseFloat(row.totalLayStake) : 0),
    }));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get profit by promo type"
    );
  }
}

/**
 * Get profit/loss aggregates by bookmaker (back bet account).
 */
export async function getProfitByBookmaker({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  try {
    const conditions: SQL<unknown>[] = [
      eq(matchedBet.userId, userId),
      eq(matchedBet.status, "settled"),
    ];

    if (startDate) {
      conditions.push(gte(matchedBet.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(matchedBet.createdAt, endDate));
    }

    // Join with account for bookmaker name
    const rows = await db
      .select({
        accountId: backBet.accountId,
        accountName: account.name,
        count: count(matchedBet.id),
        totalBackProfitLoss: sum(backBet.profitLoss),
        totalBackStake: sum(backBet.stake),
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(account, eq(backBet.accountId, account.id))
      .where(and(...conditions))
      .groupBy(backBet.accountId, account.name);

    return rows.map((row) => ({
      accountId: row.accountId,
      accountName: row.accountName ?? "Unknown Bookmaker",
      count: row.count,
      totalProfitLoss: row.totalBackProfitLoss
        ? Number.parseFloat(row.totalBackProfitLoss)
        : 0,
      totalStake: row.totalBackStake
        ? Number.parseFloat(row.totalBackStake)
        : 0,
    }));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get profit by bookmaker"
    );
  }
}

/**
 * Get profit/loss aggregates by exchange (lay bet account).
 */
export async function getProfitByExchange({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  try {
    const conditions: SQL<unknown>[] = [
      eq(matchedBet.userId, userId),
      eq(matchedBet.status, "settled"),
    ];

    if (startDate) {
      conditions.push(gte(matchedBet.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(matchedBet.createdAt, endDate));
    }

    // Join with lay bet's account for exchange name
    const layAccount = account;
    const rows = await db
      .select({
        accountId: layBet.accountId,
        accountName: layAccount.name,
        count: count(matchedBet.id),
        totalLayProfitLoss: sum(layBet.profitLoss),
        totalLayStake: sum(layBet.stake),
      })
      .from(matchedBet)
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .leftJoin(layAccount, eq(layBet.accountId, layAccount.id))
      .where(and(...conditions))
      .groupBy(layBet.accountId, layAccount.name);

    return rows.map((row) => ({
      accountId: row.accountId,
      accountName: row.accountName ?? "Unknown Exchange",
      count: row.count,
      totalProfitLoss: row.totalLayProfitLoss
        ? Number.parseFloat(row.totalLayProfitLoss)
        : 0,
      totalStake: row.totalLayStake
        ? Number.parseFloat(row.totalLayStake)
        : 0,
    }));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get profit by exchange"
    );
  }
}

/**
 * Get total open exposure (non-settled matched bets).
 */
export async function getOpenExposure({
  userId,
}: {
  userId: string;
}) {
  try {
    const [result] = await db
      .select({
        totalExposure: sum(matchedBet.netExposure),
        count: count(matchedBet.id),
      })
      .from(matchedBet)
      .where(
        and(
          eq(matchedBet.userId, userId),
          inArray(matchedBet.status, ["draft", "matched", "needs_review"])
        )
      );

    return {
      totalExposure: result?.totalExposure
        ? Number.parseFloat(result.totalExposure)
        : 0,
      count: result?.count ?? 0,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get open exposure"
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Import Operations
// ─────────────────────────────────────────────────────────────────────────────

export type CreateScreenshotForImportParams = {
  userId: string;
  kind: "back" | "lay";
  parsedData: {
    source: string;
    market: string;
    selection: string;
    odds: number;
    stake: number;
    exchange: string;
    currency: string;
  };
};

/**
 * Create a placeholder screenshot for imported bet data.
 * Screenshots are required by the bet schema, so we create a "parsed" placeholder.
 */
export async function createScreenshotForImport({
  userId,
  kind,
  parsedData,
}: CreateScreenshotForImportParams) {
  try {
    const now = new Date();
    const [result] = await db
      .insert(screenshotUpload)
      .values({
        createdAt: now,
        userId,
        kind,
        url: `import://csv/${now.getTime()}-${generateUUID()}`,
        filename: "csv-import",
        contentType: "text/csv",
        status: "parsed",
        parsedOutput: parsedData,
      })
      .returning();
    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create screenshot for import"
    );
  }
}

export type CreateBetForImportParams = {
  userId: string;
  kind: "back" | "lay";
  screenshotId: string;
  market: string;
  selection: string;
  odds: string;
  stake: string;
  exchange: string;
  currency: string;
  placedAt?: Date | null;
  notes?: string | null;
};

/**
 * Create a back or lay bet from imported data with status "placed".
 */
export async function createBetForImport(params: CreateBetForImportParams) {
  try {
    const now = new Date();
    const table = params.kind === "back" ? backBet : layBet;

    const [result] = await db
      .insert(table)
      .values({
        createdAt: now,
        userId: params.userId,
        screenshotId: params.screenshotId,
        market: params.market,
        selection: params.selection,
        odds: params.odds,
        stake: params.stake,
        exchange: params.exchange,
        currency: params.currency,
        placedAt: params.placedAt,
        status: "placed",
      })
      .returning();

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: now,
      userId: params.userId,
      entityType: params.kind === "back" ? "back_bet" : "lay_bet",
      entityId: result.id,
      action: "create",
      changes: { source: "csv_import" },
      notes: params.notes,
    });

    return result;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create bet from import");
  }
}

export type CreateTransactionForImportParams = {
  userId: string;
  accountId: string;
  type: "deposit" | "withdrawal" | "bonus" | "adjustment";
  amount: string;
  currency: string;
  occurredAt: Date;
  notes?: string | null;
};

/**
 * Create a transaction from imported balance data.
 */
export async function createTransactionForImport(
  params: CreateTransactionForImportParams
) {
  try {
    const [result] = await db
      .insert(accountTransaction)
      .values({
        createdAt: new Date(),
        userId: params.userId,
        accountId: params.accountId,
        type: params.type,
        amount: params.amount,
        currency: params.currency,
        occurredAt: params.occurredAt,
        notes: params.notes,
      })
      .returning();
    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create transaction from import"
    );
  }
}

/**
 * Find or create an account by normalized name.
 */
export async function findOrCreateAccount({
  userId,
  name,
  currency,
}: {
  userId: string;
  name: string;
  currency: string;
}) {
  try {
    const normalized = normalizeAccountName(name);

    // Check for existing account
    const existing = await db
      .select()
      .from(account)
      .where(
        and(eq(account.userId, userId), eq(account.nameNormalized, normalized))
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    // Create new account
    const [newAccount] = await db
      .insert(account)
      .values({
        createdAt: new Date(),
        userId,
        name,
        nameNormalized: normalized,
        kind: "bookmaker",
        currency,
        status: "active",
      })
      .returning();

    return newAccount;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to find or create account");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Summary
// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  /** Total profit/loss from all settled bets (NOK) */
  totalProfit: number;
  /** Number of settled bets */
  settledCount: number;
  /** Open exposure from non-settled bets (NOK) */
  openExposure: number;
  /** Number of open positions */
  openPositions: number;
  /** Number of bets pending review */
  pendingReviewCount: number;
  /** Number of bets from last 7 days */
  recentActivityCount: number;
  /** Total ROI percentage */
  roi: number;
}

/**
 * Get dashboard summary statistics for a user.
 * Aggregates key metrics for the dashboard overview cards.
 */
export async function getDashboardSummary({
  userId,
}: {
  userId: string;
}): Promise<DashboardSummary> {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel for performance
    const [
      settledStats,
      openExposureData,
      pendingReview,
      recentActivity,
    ] = await Promise.all([
      // Total profit from settled bets (via back/lay bet profitLoss)
      db
        .select({
          count: count(matchedBet.id),
          totalBackProfit: sql<string>`COALESCE(SUM(${backBet.profitLoss}::numeric), 0)`,
          totalLayProfit: sql<string>`COALESCE(SUM(${layBet.profitLoss}::numeric), 0)`,
          totalBackStake: sql<string>`COALESCE(SUM(${backBet.stake}::numeric), 0)`,
        })
        .from(matchedBet)
        .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
        .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
        .where(and(eq(matchedBet.userId, userId), eq(matchedBet.status, "settled"))),

      // Open exposure
      getOpenExposure({ userId }),

      // Pending review count
      db
        .select({ count: count(matchedBet.id) })
        .from(matchedBet)
        .where(
          and(
            eq(matchedBet.userId, userId),
            inArray(matchedBet.status, ["needs_review", "draft"])
          )
        ),

      // Recent activity (last 7 days)
      db
        .select({ count: count(matchedBet.id) })
        .from(matchedBet)
        .where(
          and(
            eq(matchedBet.userId, userId),
            gte(matchedBet.createdAt, sevenDaysAgo)
          )
        ),
    ]);

    const backProfit = Number.parseFloat(settledStats[0]?.totalBackProfit ?? "0");
    const layProfit = Number.parseFloat(settledStats[0]?.totalLayProfit ?? "0");
    const totalProfit = backProfit + layProfit;
    const totalStake = Number.parseFloat(settledStats[0]?.totalBackStake ?? "0");
    const settledCount = settledStats[0]?.count ?? 0;
    const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0;

    return {
      totalProfit,
      settledCount,
      openExposure: openExposureData.totalExposure,
      openPositions: openExposureData.count,
      pendingReviewCount: pendingReview[0]?.count ?? 0,
      recentActivityCount: recentActivity[0]?.count ?? 0,
      roi,
    };
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get dashboard summary");
  }
}

