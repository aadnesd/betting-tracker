ALTER TABLE "AccountTransaction" ADD COLUMN "bonusSubcategory" text;--> statement-breakpoint
CREATE INDEX "account_tx_user_bonus_subcategory_idx" ON "AccountTransaction" USING btree ("userId","type","bonusSubcategory");
