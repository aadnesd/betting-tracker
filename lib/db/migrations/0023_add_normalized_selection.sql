-- Add normalizedSelection column to BackBet, LayBet, and MatchedBet tables
-- Why: Enables reliable auto-settlement by storing the normalized selection (HOME_TEAM, AWAY_TEAM, DRAW)
-- determined during match linking. This matches the football-data.org API's winner field format.

ALTER TABLE "BackBet" ADD COLUMN IF NOT EXISTS "normalizedSelection" varchar;--> statement-breakpoint
ALTER TABLE "LayBet" ADD COLUMN IF NOT EXISTS "normalizedSelection" varchar;--> statement-breakpoint
ALTER TABLE "MatchedBet" ADD COLUMN IF NOT EXISTS "normalizedSelection" varchar;
