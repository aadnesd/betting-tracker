CREATE TABLE IF NOT EXISTS "FxRate" (
	"baseCurrency" varchar(8) PRIMARY KEY NOT NULL,
	"rateToNok" numeric(18, 8) NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "WalletTransaction" ADD COLUMN "linkedWalletTransactionId" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fx_rate_updated_at_idx" ON "FxRate" USING btree ("updatedAt");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "WalletTransaction" ADD CONSTRAINT "wallet_tx_linked_wallet_fk" FOREIGN KEY ("linkedWalletTransactionId") REFERENCES "public"."WalletTransaction"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_tx_linked_wallet_idx" ON "WalletTransaction" USING btree ("linkedWalletTransactionId");