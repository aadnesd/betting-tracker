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

export async function getMatchedBetWithParts({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select({
        matched: matchedBet,
        back: backBet,
        lay: layBet,
        backScreenshot: screenshotUpload,
        layScreenshot: screenshotUpload,
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .where(eq(matchedBet.id, id));

    if (!row || row.matched.userId !== userId) {
      return null;
    }

    return row;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to fetch matched bet details"
    );
  }
}
