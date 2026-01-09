ALTER TABLE "BackBet" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "LayBet" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "MatchedBet" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "BackBet" ADD COLUMN "settledAt" timestamp;--> statement-breakpoint
ALTER TABLE "BackBet" ADD COLUMN "profitLoss" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "LayBet" ADD COLUMN "settledAt" timestamp;--> statement-breakpoint
ALTER TABLE "LayBet" ADD COLUMN "profitLoss" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "MatchedBet" ADD COLUMN "promoType" text;