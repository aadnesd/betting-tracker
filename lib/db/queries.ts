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
  isNotNull,
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
  freeBet,
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

export async function updateAccount({
  id,
  userId,
  name,
  kind,
  currency,
  commission,
  status,
  limits,
}: {
  id: string;
  userId: string;
  name?: string;
  kind?: "bookmaker" | "exchange";
  currency?: string | null;
  commission?: number | null;
  status?: "active" | "archived";
  limits?: Record<string, unknown> | null;
}) {
  try {
    const updates: Partial<typeof account.$inferInsert> = {};
    if (name !== undefined) {
      updates.name = name.trim();
      updates.nameNormalized = normalizeAccountName(name);
    }
    if (kind !== undefined) {
      updates.kind = kind;
    }
    if (currency !== undefined) {
      updates.currency = currency;
    }
    if (commission !== undefined) {
      updates.commission = commission === null ? null : commission.toString();
    }
    if (status !== undefined) {
      updates.status = status;
    }
    if (limits !== undefined) {
      updates.limits = limits;
    }

    if (Object.keys(updates).length === 0) {
      const existing = await getAccountById({ id, userId });
      return existing;
    }

    const [row] = await db
      .update(account)
      .set(updates)
      .where(and(eq(account.id, id), eq(account.userId, userId)))
      .returning();
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update account");
  }
}

/**
 * Calculate current balance for a single account by summing all transactions.
 * Deposits and bonuses add, withdrawals and adjustments (negative) subtract.
 */
export async function getAccountBalance({
  userId,
  accountId,
}: {
  userId: string;
  accountId: string;
}): Promise<number> {
  try {
    const result = await db
      .select({
        // Deposits and bonuses add to balance, withdrawals subtract
        balance: sql<string>`COALESCE(
          SUM(
            CASE 
              WHEN ${accountTransaction.type} = 'withdrawal' THEN -1 * ${accountTransaction.amount}::numeric
              ELSE ${accountTransaction.amount}::numeric
            END
          ), 0
        )`,
      })
      .from(accountTransaction)
      .where(
        and(
          eq(accountTransaction.accountId, accountId),
          eq(accountTransaction.userId, userId)
        )
      );
    return Number.parseFloat(result[0]?.balance ?? "0");
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get account balance"
    );
  }
}

export interface AccountWithBalance {
  id: string;
  createdAt: Date;
  userId: string;
  name: string;
  nameNormalized: string;
  kind: "bookmaker" | "exchange";
  currency: string | null;
  commission: string | null;
  status: "active" | "archived";
  limits: unknown;
  currentBalance: number;
  transactionCount: number;
}

/**
 * List all accounts for a user with computed balance from transactions.
 * Returns account info plus currentBalance (sum of transactions).
 */
export async function listAccountsWithBalances({
  userId,
  kind,
  status,
  limit = 200,
}: {
  userId: string;
  kind?: "bookmaker" | "exchange";
  status?: "active" | "archived";
  limit?: number;
}): Promise<AccountWithBalance[]> {
  try {
    const conditions: SQL[] = [eq(account.userId, userId)];
    if (kind) {
      conditions.push(eq(account.kind, kind));
    }
    if (status) {
      conditions.push(eq(account.status, status));
    }

    // Subquery to get transaction sums per account
    const balanceSubquery = db
      .select({
        accountId: accountTransaction.accountId,
        balance: sql<string>`COALESCE(
          SUM(
            CASE 
              WHEN ${accountTransaction.type} = 'withdrawal' THEN -1 * ${accountTransaction.amount}::numeric
              ELSE ${accountTransaction.amount}::numeric
            END
          ), 0
        )`.as("balance"),
        txCount: count(accountTransaction.id).as("tx_count"),
      })
      .from(accountTransaction)
      .where(eq(accountTransaction.userId, userId))
      .groupBy(accountTransaction.accountId)
      .as("balance_agg");

    const rows = await db
      .select({
        id: account.id,
        createdAt: account.createdAt,
        userId: account.userId,
        name: account.name,
        nameNormalized: account.nameNormalized,
        kind: account.kind,
        currency: account.currency,
        commission: account.commission,
        status: account.status,
        limits: account.limits,
        currentBalance: sql<string>`COALESCE(${balanceSubquery.balance}, '0')`,
        transactionCount: sql<number>`COALESCE(${balanceSubquery.txCount}, 0)`,
      })
      .from(account)
      .leftJoin(balanceSubquery, eq(account.id, balanceSubquery.accountId))
      .where(and(...conditions))
      .orderBy(asc(account.kind), asc(account.name))
      .limit(limit);

    return rows.map((row) => ({
      ...row,
      currentBalance: Number.parseFloat(String(row.currentBalance) || "0"),
      transactionCount: Number(row.transactionCount || 0),
    }));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list accounts with balances"
    );
  }
}

/**
 * Bankroll summary type for dashboard display.
 */
export interface BankrollSummary {
  totalCapital: number;
  bookmakerBalance: number;
  exchangeBalance: number;
  accountCount: number;
  activeAccountCount: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalBonuses: number;
  netDeposits: number;
}

/**
 * Get bankroll summary aggregating all account balances and transactions.
 * Why: Provides holistic view of funds across all accounts for bankroll management.
 */
export async function getBankrollSummary({
  userId,
}: {
  userId: string;
}): Promise<BankrollSummary> {
  try {
    // Get all accounts with balances
    const accounts = await listAccountsWithBalances({
      userId,
      status: "active",
    });

    // Aggregate by kind
    const bookmakerAccounts = accounts.filter((a) => a.kind === "bookmaker");
    const exchangeAccounts = accounts.filter((a) => a.kind === "exchange");

    const bookmakerBalance = bookmakerAccounts.reduce(
      (sum, a) => sum + a.currentBalance,
      0
    );
    const exchangeBalance = exchangeAccounts.reduce(
      (sum, a) => sum + a.currentBalance,
      0
    );

    // Get transaction totals
    const [txTotals] = await db
      .select({
        totalDeposits: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransaction.type} = 'deposit' THEN ${accountTransaction.amount}::numeric ELSE 0 END), 0)`,
        totalWithdrawals: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransaction.type} = 'withdrawal' THEN ${accountTransaction.amount}::numeric ELSE 0 END), 0)`,
        totalBonuses: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransaction.type} = 'bonus' THEN ${accountTransaction.amount}::numeric ELSE 0 END), 0)`,
      })
      .from(accountTransaction)
      .where(eq(accountTransaction.userId, userId));

    const totalDeposits = Number.parseFloat(String(txTotals?.totalDeposits || "0"));
    const totalWithdrawals = Number.parseFloat(String(txTotals?.totalWithdrawals || "0"));
    const totalBonuses = Number.parseFloat(String(txTotals?.totalBonuses || "0"));

    return {
      totalCapital: bookmakerBalance + exchangeBalance,
      bookmakerBalance,
      exchangeBalance,
      accountCount: accounts.length,
      activeAccountCount: accounts.filter((a) => a.status === "active").length,
      totalDeposits,
      totalWithdrawals,
      totalBonuses,
      netDeposits: totalDeposits - totalWithdrawals,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get bankroll summary"
    );
  }
}

/**
 * Transaction trend data point for charts.
 */
export interface TransactionTrendPoint {
  date: string;
  label: string;
  deposits: number;
  withdrawals: number;
  bonuses: number;
  net: number;
}

/**
 * Get transaction trends grouped by day/week/month for charts.
 * Why: Enables visualization of deposit/withdrawal patterns over time.
 */
export async function getTransactionTrends({
  userId,
  startDate,
  endDate,
  groupBy = "day",
}: {
  userId: string;
  startDate?: Date;
  endDate?: Date;
  groupBy?: "day" | "week" | "month";
}): Promise<TransactionTrendPoint[]> {
  try {
    const conditions: SQL[] = [eq(accountTransaction.userId, userId)];

    if (startDate) {
      conditions.push(gte(accountTransaction.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(accountTransaction.createdAt, endDate));
    }

    // Date truncation based on groupBy
    const dateTrunc = groupBy === "month"
      ? sql`DATE_TRUNC('month', ${accountTransaction.createdAt})`
      : groupBy === "week"
        ? sql`DATE_TRUNC('week', ${accountTransaction.createdAt})`
        : sql`DATE_TRUNC('day', ${accountTransaction.createdAt})`;

    const rows = await db
      .select({
        periodDate: sql<string>`${dateTrunc}::date`.as("period_date"),
        deposits: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransaction.type} = 'deposit' THEN ${accountTransaction.amount}::numeric ELSE 0 END), 0)`,
        withdrawals: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransaction.type} = 'withdrawal' THEN ${accountTransaction.amount}::numeric ELSE 0 END), 0)`,
        bonuses: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransaction.type} = 'bonus' THEN ${accountTransaction.amount}::numeric ELSE 0 END), 0)`,
      })
      .from(accountTransaction)
      .where(and(...conditions))
      .groupBy(dateTrunc)
      .orderBy(asc(sql`${dateTrunc}`));

    return rows.map((row) => {
      const deposits = Number.parseFloat(String(row.deposits || "0"));
      const withdrawals = Number.parseFloat(String(row.withdrawals || "0"));
      const bonuses = Number.parseFloat(String(row.bonuses || "0"));
      const dateStr = String(row.periodDate);
      const date = new Date(dateStr);

      // Format label based on groupBy
      let label: string;
      if (groupBy === "month") {
        label = date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
      } else if (groupBy === "week") {
        label = `Week of ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
      } else {
        label = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      }

      return {
        date: dateStr,
        label,
        deposits,
        withdrawals,
        bonuses,
        net: deposits - withdrawals + bonuses,
      };
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get transaction trends"
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

export type BookmakerProfitWithBonuses = {
  accountId: string;
  accountName: string;
  /** Number of settled bets */
  betCount: number;
  /** Profit/loss from betting (sum of profitLoss on back bets) */
  bettingProfit: number;
  /** Total stake wagered */
  totalStake: number;
  /** Total bonus/reward transaction amounts */
  bonusTotal: number;
  /** Combined total (bettingProfit + bonusTotal) */
  totalProfit: number;
  /** ROI percentage based on total profit and stake */
  roi: number;
};

/**
 * Get bookmaker profit/loss including bonus/reward transactions.
 * Combines betting profit from matched bets with bonus transactions from accounts.
 * This allows users to see which bookmaker reward programs offer the best ROI.
 */
export async function getBookmakerProfitWithBonuses({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}): Promise<BookmakerProfitWithBonuses[]> {
  try {
    // Get betting profit per bookmaker account
    const bettingConditions: SQL<unknown>[] = [
      eq(matchedBet.userId, userId),
      eq(matchedBet.status, "settled"),
    ];

    if (startDate) {
      bettingConditions.push(gte(matchedBet.createdAt, startDate));
    }
    if (endDate) {
      bettingConditions.push(lte(matchedBet.createdAt, endDate));
    }

    const bettingRows = await db
      .select({
        accountId: backBet.accountId,
        accountName: account.name,
        count: count(matchedBet.id),
        totalProfitLoss: sum(backBet.profitLoss),
        totalStake: sum(backBet.stake),
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(account, eq(backBet.accountId, account.id))
      .where(and(...bettingConditions))
      .groupBy(backBet.accountId, account.name);

    // Get bonus transactions per bookmaker account
    const bonusConditions: SQL<unknown>[] = [
      eq(accountTransaction.userId, userId),
      eq(accountTransaction.type, "bonus"),
      eq(account.kind, "bookmaker"),
    ];

    if (startDate) {
      bonusConditions.push(gte(accountTransaction.occurredAt, startDate));
    }
    if (endDate) {
      bonusConditions.push(lte(accountTransaction.occurredAt, endDate));
    }

    const bonusRows = await db
      .select({
        accountId: accountTransaction.accountId,
        accountName: account.name,
        bonusTotal: sum(accountTransaction.amount),
      })
      .from(accountTransaction)
      .innerJoin(account, eq(accountTransaction.accountId, account.id))
      .where(and(...bonusConditions))
      .groupBy(accountTransaction.accountId, account.name);

    // Combine betting and bonus data
    const accountMap = new Map<
      string,
      {
        accountId: string;
        accountName: string;
        betCount: number;
        bettingProfit: number;
        totalStake: number;
        bonusTotal: number;
      }
    >();

    // Add betting data
    for (const row of bettingRows) {
      if (row.accountId) {
        accountMap.set(row.accountId, {
          accountId: row.accountId,
          accountName: row.accountName ?? "Unknown Bookmaker",
          betCount: row.count,
          bettingProfit: row.totalProfitLoss
            ? Number.parseFloat(row.totalProfitLoss)
            : 0,
          totalStake: row.totalStake ? Number.parseFloat(row.totalStake) : 0,
          bonusTotal: 0,
        });
      }
    }

    // Add bonus data
    for (const row of bonusRows) {
      const existing = accountMap.get(row.accountId);
      const bonusTotal = row.bonusTotal
        ? Number.parseFloat(row.bonusTotal)
        : 0;
      if (existing) {
        existing.bonusTotal = bonusTotal;
      } else {
        // Account has bonuses but no betting activity
        accountMap.set(row.accountId, {
          accountId: row.accountId,
          accountName: row.accountName ?? "Unknown Bookmaker",
          betCount: 0,
          bettingProfit: 0,
          totalStake: 0,
          bonusTotal,
        });
      }
    }

    // Calculate totals and ROI
    const results: BookmakerProfitWithBonuses[] = [];
    for (const data of accountMap.values()) {
      const totalProfit = data.bettingProfit + data.bonusTotal;
      const roi = data.totalStake > 0 ? (totalProfit / data.totalStake) * 100 : 0;
      results.push({
        ...data,
        totalProfit,
        roi,
      });
    }

    // Sort by total profit descending
    results.sort((a, b) => b.totalProfit - a.totalProfit);

    return results;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get bookmaker profit with bonuses"
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

/**
 * Exposure data point for timeline visualization.
 */
export type ExposureDataPoint = {
  /** Date string in ISO format */
  date: string;
  /** Display label for the date */
  label: string;
  /** Total open exposure at end of this period */
  exposure: number;
  /** Number of open positions at end of this period */
  openPositions: number;
  /** Change in exposure during this period */
  change: number;
};

/**
 * Get exposure timeline data for chart visualization.
 * Returns exposure levels over time based on matched bet creation and settlement dates.
 * 
 * Algorithm:
 * 1. Get all matched bets with exposure
 * 2. Create events for bet creation (adds exposure) and settlement (removes exposure)
 * 3. Process events chronologically to compute running exposure
 * 4. Group by day to create data points
 */
export async function getExposureTimeline({
  userId,
  daysBack = 30,
}: {
  userId: string;
  daysBack?: number;
}): Promise<ExposureDataPoint[]> {
  try {
    // Get all matched bets that have netExposure
    const bets = await db
      .select({
        id: matchedBet.id,
        createdAt: matchedBet.createdAt,
        status: matchedBet.status,
        netExposure: matchedBet.netExposure,
        confirmedAt: matchedBet.confirmedAt,
      })
      .from(matchedBet)
      .where(
        and(
          eq(matchedBet.userId, userId),
          isNotNull(matchedBet.netExposure)
        )
      )
      .orderBy(matchedBet.createdAt);

    if (bets.length === 0) {
      return [];
    }

    // Create exposure events: each bet creates exposure when created
    // and removes exposure when settled
    type ExposureEvent = {
      date: Date;
      exposureChange: number;
      type: "add" | "remove";
    };

    const events: ExposureEvent[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    startDate.setHours(0, 0, 0, 0);

    for (const bet of bets) {
      const exposure = bet.netExposure
        ? Number.parseFloat(bet.netExposure)
        : 0;

      if (exposure === 0) continue;

      // Add event when bet was created
      const createdDate = new Date(bet.createdAt);
      events.push({
        date: createdDate,
        exposureChange: exposure,
        type: "add",
      });

      // Add event when bet was settled (removes exposure)
      if (bet.status === "settled" && bet.confirmedAt) {
        const settledDate = new Date(bet.confirmedAt);
        events.push({
          date: settledDate,
          exposureChange: -exposure,
          type: "remove",
        });
      }
    }

    // Sort events by date
    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate running exposure by day
    const dailyExposure = new Map<string, { exposure: number; change: number; openPositions: number }>();
    let runningExposure = 0;
    let openPositions = 0;

    // Process all events to build up the exposure state
    for (const event of events) {
      const dayKey = event.date.toISOString().split("T")[0];
      
      runningExposure += event.exposureChange;
      if (event.type === "add") {
        openPositions += 1;
      } else {
        openPositions -= 1;
      }

      const existing = dailyExposure.get(dayKey) ?? { exposure: 0, change: 0, openPositions: 0 };
      existing.exposure = runningExposure;
      existing.change += event.exposureChange;
      existing.openPositions = openPositions;
      dailyExposure.set(dayKey, existing);
    }

    // Generate data points for the date range
    const result: ExposureDataPoint[] = [];
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // Get all days in range
    const allDays: string[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= today) {
      allDays.push(currentDate.toISOString().split("T")[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Fill in the data points, carrying forward exposure from previous days
    let lastExposure = 0;
    let lastOpenPositions = 0;

    // First, find the exposure state at the start date
    for (const event of events) {
      if (event.date < startDate) {
        lastExposure += event.exposureChange;
        if (event.type === "add") {
          lastOpenPositions += 1;
        } else {
          lastOpenPositions -= 1;
        }
      }
    }

    for (const day of allDays) {
      const dayData = dailyExposure.get(day);
      const date = new Date(day);

      if (dayData) {
        result.push({
          date: day,
          label: date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
          exposure: Math.round(dayData.exposure * 100) / 100,
          openPositions: dayData.openPositions,
          change: Math.round(dayData.change * 100) / 100,
        });
        lastExposure = dayData.exposure;
        lastOpenPositions = dayData.openPositions;
      } else {
        // Carry forward the previous day's exposure
        result.push({
          date: day,
          label: date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
          exposure: Math.round(lastExposure * 100) / 100,
          openPositions: lastOpenPositions,
          change: 0,
        });
      }
    }

    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get exposure timeline"
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

/**
 * Create a placeholder screenshot record for manual entry (Quick Add).
 * This allows bets to be created without an actual uploaded screenshot.
 */
export async function createManualScreenshot({
  userId,
  kind,
}: {
  userId: string;
  kind: "back" | "lay";
}) {
  try {
    const now = new Date();
    const [result] = await db
      .insert(screenshotUpload)
      .values({
        createdAt: now,
        userId,
        kind,
        url: `manual://quick-add/${now.getTime()}-${generateUUID()}`,
        filename: "manual-entry",
        contentType: "application/x-manual",
        status: "parsed",
        parsedOutput: { source: "quick_add", createdAt: now.toISOString() },
      })
      .returning();
    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create manual screenshot"
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Free Bet / Promo Inventory
// ─────────────────────────────────────────────────────────────────────────────

export type FreeBetStatus = "active" | "used" | "expired";

export type CreateFreeBetParams = {
  userId: string;
  accountId: string;
  name: string;
  value: number;
  currency: string;
  minOdds?: number | null;
  expiresAt?: Date | null;
  notes?: string | null;
};

/**
 * Create a new free bet record.
 * Free bets track promotional credits received from bookmakers.
 */
export async function createFreeBet(params: CreateFreeBetParams) {
  try {
    const [result] = await db
      .insert(freeBet)
      .values({
        createdAt: new Date(),
        userId: params.userId,
        accountId: params.accountId,
        name: params.name,
        value: params.value.toString(),
        currency: params.currency.toUpperCase(),
        minOdds: params.minOdds != null ? params.minOdds.toString() : null,
        expiresAt: params.expiresAt ?? null,
        status: "active",
        notes: params.notes ?? null,
      })
      .returning();

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: new Date(),
      userId: params.userId,
      entityType: "account",
      entityId: params.accountId,
      action: "create",
      changes: { freeBetId: result.id, value: params.value },
      notes: `Created free bet: ${params.name}`,
    });

    return result;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create free bet");
  }
}

/**
 * Get a free bet by ID.
 */
export async function getFreeBetById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select()
      .from(freeBet)
      .where(and(eq(freeBet.id, id), eq(freeBet.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to fetch free bet");
  }
}

/**
 * List all free bets for a user.
 * Can optionally filter by status.
 */
export async function listFreeBetsByUser({
  userId,
  status,
  limit = 100,
}: {
  userId: string;
  status?: FreeBetStatus;
  limit?: number;
}) {
  try {
    const conditions: SQL[] = [eq(freeBet.userId, userId)];
    if (status) {
      conditions.push(eq(freeBet.status, status));
    }

    return await db
      .select({
        id: freeBet.id,
        createdAt: freeBet.createdAt,
        userId: freeBet.userId,
        accountId: freeBet.accountId,
        name: freeBet.name,
        value: freeBet.value,
        currency: freeBet.currency,
        minOdds: freeBet.minOdds,
        expiresAt: freeBet.expiresAt,
        status: freeBet.status,
        usedInMatchedBetId: freeBet.usedInMatchedBetId,
        notes: freeBet.notes,
        accountName: account.name,
      })
      .from(freeBet)
      .leftJoin(account, eq(freeBet.accountId, account.id))
      .where(and(...conditions))
      .orderBy(asc(freeBet.expiresAt), desc(freeBet.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list free bets");
  }
}

/**
 * List free bets for a specific account.
 */
export async function listFreeBetsByAccount({
  userId,
  accountId,
  status,
  limit = 100,
}: {
  userId: string;
  accountId: string;
  status?: FreeBetStatus;
  limit?: number;
}) {
  try {
    const conditions: SQL[] = [
      eq(freeBet.userId, userId),
      eq(freeBet.accountId, accountId),
    ];
    if (status) {
      conditions.push(eq(freeBet.status, status));
    }

    return await db
      .select()
      .from(freeBet)
      .where(and(...conditions))
      .orderBy(asc(freeBet.expiresAt), desc(freeBet.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list free bets by account"
    );
  }
}

export type UpdateFreeBetParams = {
  id: string;
  userId: string;
  name?: string;
  value?: number;
  currency?: string;
  minOdds?: number | null;
  expiresAt?: Date | null;
  status?: FreeBetStatus;
  notes?: string | null;
};

/**
 * Update a free bet's details.
 */
export async function updateFreeBet(params: UpdateFreeBetParams) {
  try {
    const updates: Partial<typeof freeBet.$inferInsert> = {};

    if (params.name !== undefined) {
      updates.name = params.name;
    }
    if (params.value !== undefined) {
      updates.value = params.value.toString();
    }
    if (params.currency !== undefined) {
      updates.currency = params.currency.toUpperCase();
    }
    if (params.minOdds !== undefined) {
      updates.minOdds = params.minOdds === null ? null : params.minOdds.toString();
    }
    if (params.expiresAt !== undefined) {
      updates.expiresAt = params.expiresAt;
    }
    if (params.status !== undefined) {
      updates.status = params.status;
    }
    if (params.notes !== undefined) {
      updates.notes = params.notes;
    }

    if (Object.keys(updates).length === 0) {
      return await getFreeBetById({ id: params.id, userId: params.userId });
    }

    const [result] = await db
      .update(freeBet)
      .set(updates)
      .where(and(eq(freeBet.id, params.id), eq(freeBet.userId, params.userId)))
      .returning();

    return result ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update free bet");
  }
}

/**
 * Mark a free bet as used and link it to a matched bet.
 * This is called when a matched bet is created using a free bet.
 */
export async function markFreeBetAsUsed({
  id,
  userId,
  matchedBetId,
}: {
  id: string;
  userId: string;
  matchedBetId: string;
}) {
  try {
    const [result] = await db
      .update(freeBet)
      .set({
        status: "used",
        usedInMatchedBetId: matchedBetId,
      })
      .where(and(eq(freeBet.id, id), eq(freeBet.userId, userId)))
      .returning();

    if (result) {
      // Create audit entry
      await db.insert(auditLog).values({
        createdAt: new Date(),
        userId,
        entityType: "matched_bet",
        entityId: matchedBetId,
        action: "update",
        changes: { freeBetId: id, freeBetValue: result.value },
        notes: `Used free bet: ${result.name}`,
      });
    }

    return result ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to mark free bet as used"
    );
  }
}

/**
 * Count active free bets that are expiring within the given number of days.
 * Used for dashboard warnings.
 */
export async function countExpiringFreeBets({
  userId,
  daysUntilExpiry = 7,
}: {
  userId: string;
  daysUntilExpiry?: number;
}) {
  try {
    const now = new Date();
    const expiryThreshold = new Date(
      now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000
    );

    const [result] = await db
      .select({ count: count(freeBet.id) })
      .from(freeBet)
      .where(
        and(
          eq(freeBet.userId, userId),
          eq(freeBet.status, "active"),
          lte(freeBet.expiresAt, expiryThreshold)
        )
      );

    return result?.count ?? 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to count expiring free bets"
    );
  }
}

/**
 * Get total value of active free bets for a user.
 * Used for dashboard summary.
 */
export async function getActiveFreeBetsSummary({
  userId,
}: {
  userId: string;
}) {
  try {
    const [result] = await db
      .select({
        count: count(freeBet.id),
        totalValue: sum(freeBet.value),
      })
      .from(freeBet)
      .where(and(eq(freeBet.userId, userId), eq(freeBet.status, "active")));

    return {
      count: result?.count ?? 0,
      totalValue: result?.totalValue
        ? Number.parseFloat(result.totalValue)
        : 0,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get active free bets summary"
    );
  }
}

/**
 * Delete a free bet by ID.
 * Only allows deletion of active or expired free bets, not used ones.
 */
export async function deleteFreeBet({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    // Verify the free bet exists and belongs to user
    const existing = await getFreeBetById({ id, userId });
    if (!existing) {
      return null;
    }

    if (existing.status === "used") {
      throw new ChatSDKError(
        "bad_request:api",
        "Cannot delete a used free bet"
      );
    }

    await db
      .delete(freeBet)
      .where(and(eq(freeBet.id, id), eq(freeBet.userId, userId)));

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: new Date(),
      userId,
      entityType: "account",
      entityId: existing.accountId,
      action: "delete",
      changes: { freeBetId: id, value: existing.value },
      notes: `Deleted free bet: ${existing.name}`,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to delete free bet");
  }
}

