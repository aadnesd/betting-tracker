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
  // Link to a football match for auto-settlement (optional until match picker is implemented)
  matchId: uuid("matchId"),
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
  "free_bet",
] as const;

const auditActionEnum = [
  "create",
  "update",
  "delete",
  "status_change",
  "reconcile",
  "attach_leg",
  "auto_settle_detected",
  "auto_settle_applied",
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

const freeBetStatusEnum = ["active", "used", "expired", "locked"] as const;

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
  // Progress tracking for recurring/multi-step promos
  // unlockType: null = already unlocked, 'stake' = total stake required, 'bets' = number of bets required
  unlockType: varchar("unlockType", { enum: ["stake", "bets"] as const }),
  // The target value to unlock (e.g., 50 for "Bet £50", or 3 for "Place 3 bets")
  unlockTarget: numeric("unlockTarget", { precision: 14, scale: 2 }),
  // Minimum odds required for qualifying bets (separate from minOdds for using the free bet)
  unlockMinOdds: numeric("unlockMinOdds", { precision: 12, scale: 4 }),
  // Current progress toward unlock
  unlockProgress: numeric("unlockProgress", { precision: 14, scale: 2 }).default("0"),
});

export type FreeBet = InferSelectModel<typeof freeBet>;

/**
 * QualifyingBet - Links bets that contribute to unlocking a promo/free bet.
 * Why: Tracks which bets count toward multi-step promo requirements.
 */
export const qualifyingBet = pgTable("QualifyingBet", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  freeBetId: uuid("freeBetId")
    .notNull()
    .references(() => freeBet.id),
  matchedBetId: uuid("matchedBetId")
    .notNull()
    .references(() => matchedBet.id),
  // The contribution amount (stake for 'stake' type, 1 for 'bets' type)
  contribution: numeric("contribution", { precision: 14, scale: 2 }).notNull(),
});

export type QualifyingBet = InferSelectModel<typeof qualifyingBet>;

/**
 * FootballMatch - Local cache of match data from football-data.org.
 * Why: Enables linking bets to specific matches for auto-settlement.
 */
const matchStatusEnum = [
  "SCHEDULED",
  "TIMED",
  "IN_PLAY",
  "PAUSED",
  "FINISHED",
  "POSTPONED",
  "SUSPENDED",
  "CANCELLED",
] as const;

export const footballMatch = pgTable("FootballMatch", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  // External ID from football-data.org API
  externalId: numeric("externalId", { precision: 10, scale: 0 }).notNull().unique(),
  homeTeam: text("homeTeam").notNull(),
  awayTeam: text("awayTeam").notNull(),
  competition: text("competition").notNull(),
  // Competition code from football-data.org (e.g., "PL" for Premier League)
  competitionCode: varchar("competitionCode", { length: 10 }),
  matchDate: timestamp("matchDate").notNull(),
  status: varchar("status", { enum: matchStatusEnum }).notNull().default("SCHEDULED"),
  homeScore: numeric("homeScore", { precision: 3, scale: 0 }),
  awayScore: numeric("awayScore", { precision: 3, scale: 0 }),
  // When the match data was last synced from the API
  lastSyncedAt: timestamp("lastSyncedAt").notNull(),
});

export type FootballMatch = InferSelectModel<typeof footballMatch>;

export type FootballMatchStatus = (typeof matchStatusEnum)[number];

/**
 * UserSettings - Stores user preferences for the matched betting tracker.
 * Why: Enables per-user configuration of features like competition sync.
 */
export const userSettings = pgTable("UserSettings", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id)
    .unique(),
  // Array of competition codes to sync (e.g., ["PL", "CL", "BL1"])
  enabledCompetitions: jsonb("enabledCompetitions").$type<string[]>(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export type UserSettings = InferSelectModel<typeof userSettings>;

/**
 * Available competitions for syncing from football-data.org.
 * Code is the API identifier, name is for display.
 */
export const AVAILABLE_COMPETITIONS = [
  { code: "PL", name: "Premier League", country: "England" },
  { code: "CL", name: "Champions League", country: "Europe" },
  { code: "EL", name: "Europa League", country: "Europe" },
  { code: "EC", name: "Conference League", country: "Europe" },
  { code: "BL1", name: "Bundesliga", country: "Germany" },
  { code: "SA", name: "Serie A", country: "Italy" },
  { code: "PD", name: "La Liga", country: "Spain" },
  { code: "FL1", name: "Ligue 1", country: "France" },
  { code: "DED", name: "Eredivisie", country: "Netherlands" },
  { code: "PPL", name: "Primeira Liga", country: "Portugal" },
  { code: "ELC", name: "Championship", country: "England" },
  { code: "FAC", name: "FA Cup", country: "England" },
  { code: "EFL", name: "EFL Cup", country: "England" },
  { code: "WC", name: "World Cup", country: "International" },
  { code: "CLI", name: "Copa Libertadores", country: "South America" },
] as const;

export const DEFAULT_COMPETITION_CODES = ["PL", "CL", "EL", "FL1", "BL1", "SA", "PD"];
