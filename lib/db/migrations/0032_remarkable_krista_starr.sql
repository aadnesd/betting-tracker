CREATE INDEX IF NOT EXISTS "account_user_idx" ON "Account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_user_status_idx" ON "Account" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_user_name_idx" ON "Account" USING btree ("userId","nameNormalized");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_tx_user_idx" ON "AccountTransaction" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_tx_account_idx" ON "AccountTransaction" USING btree ("accountId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_tx_account_type_date_idx" ON "AccountTransaction" USING btree ("accountId","type","occurredAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deposit_bonus_user_status_idx" ON "DepositBonus" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "football_match_status_date_idx" ON "FootballMatch" USING btree ("status","matchDate");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "free_bet_user_status_idx" ON "FreeBet" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matched_bet_user_status_idx" ON "MatchedBet" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matched_bet_user_created_idx" ON "MatchedBet" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_user_idx" ON "Wallet" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_tx_wallet_date_idx" ON "WalletTransaction" USING btree ("walletId","date");