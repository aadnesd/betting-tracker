-- Add iOS Shortcut API key columns to UserSettings table
-- Why: Enables users to authenticate API requests from iOS Shortcuts without session cookies.
-- The API key is stored as a SHA-256 hash for security, with only the last 8 chars visible.

ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "shortcutApiKeyHash" varchar(64);--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "shortcutApiKeyHint" varchar(8);--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "shortcutApiKeyCreatedAt" timestamp;--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "lastShortcutRequestAt" timestamp;
