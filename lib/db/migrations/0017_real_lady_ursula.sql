CREATE TABLE IF NOT EXISTS "QualifyingBet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"freeBetId" uuid NOT NULL,
	"matchedBetId" uuid NOT NULL,
	"contribution" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "FreeBet" ADD COLUMN "unlockType" varchar;--> statement-breakpoint
ALTER TABLE "FreeBet" ADD COLUMN "unlockTarget" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "FreeBet" ADD COLUMN "unlockMinOdds" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "FreeBet" ADD COLUMN "unlockProgress" numeric(14, 2) DEFAULT '0';--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "QualifyingBet" ADD CONSTRAINT "QualifyingBet_freeBetId_FreeBet_id_fk" FOREIGN KEY ("freeBetId") REFERENCES "public"."FreeBet"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "QualifyingBet" ADD CONSTRAINT "QualifyingBet_matchedBetId_MatchedBet_id_fk" FOREIGN KEY ("matchedBetId") REFERENCES "public"."MatchedBet"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
