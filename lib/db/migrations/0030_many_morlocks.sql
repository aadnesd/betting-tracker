CREATE TABLE IF NOT EXISTS "FreeBetWageringBet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"freeBetId" uuid NOT NULL,
	"backBetId" uuid,
	"matchedBetId" uuid,
	"stake" numeric(14, 2) NOT NULL,
	"odds" numeric(12, 4) NOT NULL,
	"qualified" varchar NOT NULL
);
--> statement-breakpoint
ALTER TABLE "FreeBet" ADD COLUMN "stakeReturned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "FreeBet" ADD COLUMN "winWageringMultiplier" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "FreeBet" ADD COLUMN "winWageringMinOdds" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "FreeBet" ADD COLUMN "winWageringRequirement" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "FreeBet" ADD COLUMN "winWageringProgress" numeric(14, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "FreeBet" ADD COLUMN "winWageringStartedAt" timestamp;--> statement-breakpoint
ALTER TABLE "FreeBet" ADD COLUMN "winWageringCompletedAt" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FreeBetWageringBet" ADD CONSTRAINT "FreeBetWageringBet_freeBetId_FreeBet_id_fk" FOREIGN KEY ("freeBetId") REFERENCES "public"."FreeBet"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FreeBetWageringBet" ADD CONSTRAINT "FreeBetWageringBet_backBetId_BackBet_id_fk" FOREIGN KEY ("backBetId") REFERENCES "public"."BackBet"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FreeBetWageringBet" ADD CONSTRAINT "FreeBetWageringBet_matchedBetId_MatchedBet_id_fk" FOREIGN KEY ("matchedBetId") REFERENCES "public"."MatchedBet"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
