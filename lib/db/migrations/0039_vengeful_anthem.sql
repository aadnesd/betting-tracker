ALTER TABLE "MatchedBet" ADD COLUMN "betGroupId" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matched_bet_group_idx" ON "MatchedBet" USING btree ("userId","betGroupId");