ALTER TABLE "AccountTransaction" ADD COLUMN "linkedWalletTransactionId" uuid;--> statement-breakpoint
ALTER TABLE "WalletTransaction" ADD COLUMN "linkedAccountTransactionId" uuid;