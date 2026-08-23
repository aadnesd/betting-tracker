ALTER TABLE "Account" ADD COLUMN "exchangeType" varchar DEFAULT 'traditional' NOT NULL;--> statement-breakpoint
ALTER TABLE "LayBet" ADD COLUMN "sharePrice" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "LayBet" ADD COLUMN "shares" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "LayBet" ADD COLUMN "shareSide" varchar;