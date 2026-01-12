import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  json,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { AppUsage } from "../usage";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
  lastContext: jsonb("lastContext").$type<AppUsage | null>(),
});

export type Chat = InferSelectModel<typeof chat>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const messageDeprecated = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  content: json("content").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const voteDeprecated = pgTable(
  "Vote",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  }
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

export const screenshotUpload = pgTable("ScreenshotUpload", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  kind: varchar("kind", { enum: ["back", "lay"] }).notNull(),
  url: text("url").notNull(),
  filename: text("filename"),
  contentType: varchar("contentType", { length: 64 }),
  size: numeric("size", { precision: 12, scale: 0 }),
  status: varchar("status", {
    enum: ["uploaded", "parsed", "needs_review", "error"],
  })
    .notNull()
    .default("uploaded"),
  parsedOutput: jsonb("parsedOutput"),
  confidence: jsonb("confidence"),
  error: text("error"),
});

export type ScreenshotUpload = InferSelectModel<typeof screenshotUpload>;

const accountKindEnum = ["bookmaker", "exchange"] as const;
const accountStatusEnum = ["active", "archived"] as const;

export const account = pgTable("Account", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  name: text("name").notNull(),
  nameNormalized: text("nameNormalized").notNull(),
  kind: varchar("kind", { enum: accountKindEnum }).notNull(),
  currency: varchar("currency", { length: 3 }),
  commission: numeric("commission", { precision: 6, scale: 4 }),
  status: varchar("status", { enum: accountStatusEnum })
    .notNull()
    .default("active"),
  limits: jsonb("limits"),
});

export type Account = InferSelectModel<typeof account>;

export const promo = pgTable("Promo", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  type: text("type").notNull(),
  typeNormalized: text("typeNormalized").notNull(),
  minOdds: numeric("minOdds", { precision: 12, scale: 4 }),
  maxStake: numeric("maxStake", { precision: 12, scale: 2 }),
  expiry: timestamp("expiry"),
  terms: text("terms"),
});

export type Promo = InferSelectModel<typeof promo>;

const transactionTypeEnum = [
  "deposit",
  "withdrawal",
  "bonus",
  "adjustment",
] as const;

export const accountTransaction = pgTable("AccountTransaction", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  accountId: uuid("accountId")
    .notNull()
    .references(() => account.id),
  type: varchar("type", { enum: transactionTypeEnum }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  occurredAt: timestamp("occurredAt").notNull(),
  notes: text("notes"),
});

export type AccountTransaction = InferSelectModel<typeof accountTransaction>;

const betStatusEnum = [
  "draft",
  "placed",
  "matched",
  "settled",
  "needs_review",
  "error",
] as const;

export const backBet = pgTable("BackBet", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  accountId: uuid("accountId").references(() => account.id),
  screenshotId: uuid("screenshotId")
    .references(() => screenshotUpload.id)
    .notNull(),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  odds: numeric("odds", { precision: 12, scale: 4 }).notNull(),
  stake: numeric("stake", { precision: 12, scale: 2 }).notNull(),
  exchange: text("exchange").notNull(),
  currency: varchar("currency", { length: 3 }),
  placedAt: timestamp("placedAt"),
  settledAt: timestamp("settledAt"),
  profitLoss: numeric("profitLoss", { precision: 14, scale: 2 }),
  confidence: jsonb("confidence"),
  status: varchar("status", { enum: betStatusEnum })
    .notNull()
    .default("draft"),
  error: text("error"),
});

export type BackBet = InferSelectModel<typeof backBet>;

export const layBet = pgTable("LayBet", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  accountId: uuid("accountId").references(() => account.id),
  screenshotId: uuid("screenshotId")
    .references(() => screenshotUpload.id)
    .notNull(),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  odds: numeric("odds", { precision: 12, scale: 4 }).notNull(),
  stake: numeric("stake", { precision: 12, scale: 2 }).notNull(),
  exchange: text("exchange").notNull(),
  currency: varchar("currency", { length: 3 }),
  placedAt: timestamp("placedAt"),
  settledAt: timestamp("settledAt"),
  profitLoss: numeric("profitLoss", { precision: 14, scale: 2 }),
  confidence: jsonb("confidence"),
  status: varchar("status", { enum: betStatusEnum })
    .notNull()
    .default("draft"),
  error: text("error"),
});

export type LayBet = InferSelectModel<typeof layBet>;

export const matchedBet = pgTable("MatchedBet", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  backBetId: uuid("backBetId").references(() => backBet.id),
  layBetId: uuid("layBetId").references(() => layBet.id),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  promoId: uuid("promoId").references(() => promo.id),
  promoType: text("promoType"),
  status: varchar("status", {
    enum: ["draft", "matched", "settled", "needs_review"],
  })
    .notNull()
    .default("draft"),
  netExposure: numeric("netExposure", { precision: 14, scale: 2 }),
  notes: text("notes"),
  confirmedAt: timestamp("confirmedAt"),
  lastError: text("lastError"),
});

export type MatchedBet = InferSelectModel<typeof matchedBet>;

const auditEntityTypeEnum = [
  "back_bet",
  "lay_bet",
  "matched_bet",
  "account",
  "screenshot",
] as const;

const auditActionEnum = [
  "create",
  "update",
  "delete",
  "status_change",
  "reconcile",
  "attach_leg",
] as const;

export const auditLog = pgTable("AuditLog", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  entityType: varchar("entityType", { enum: auditEntityTypeEnum }).notNull(),
  entityId: uuid("entityId").notNull(),
  action: varchar("action", { enum: auditActionEnum }).notNull(),
  changes: jsonb("changes"),
  notes: text("notes"),
});

export type AuditLog = InferSelectModel<typeof auditLog>;

const freeBetStatusEnum = ["active", "used", "expired"] as const;

export const freeBet = pgTable("FreeBet", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  accountId: uuid("accountId")
    .notNull()
    .references(() => account.id),
  name: text("name").notNull(),
  value: numeric("value", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  minOdds: numeric("minOdds", { precision: 12, scale: 4 }),
  expiresAt: timestamp("expiresAt"),
  status: varchar("status", { enum: freeBetStatusEnum })
    .notNull()
    .default("active"),
  usedInMatchedBetId: uuid("usedInMatchedBetId").references(() => matchedBet.id),
  notes: text("notes"),
});

export type FreeBet = InferSelectModel<typeof freeBet>;
