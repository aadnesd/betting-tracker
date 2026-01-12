CREATE TABLE IF NOT EXISTS "FreeBet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"userId" uuid NOT NULL,
	"accountId" uuid NOT NULL,
	"name" text NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"minOdds" numeric(12, 4),
	"expiresAt" timestamp,
	"status" varchar DEFAULT 'active' NOT NULL,
	"usedInMatchedBetId" uuid,
	"notes" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FreeBet" ADD CONSTRAINT "FreeBet_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FreeBet" ADD CONSTRAINT "FreeBet_accountId_Account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FreeBet" ADD CONSTRAINT "FreeBet_usedInMatchedBetId_MatchedBet_id_fk" FOREIGN KEY ("usedInMatchedBetId") REFERENCES "public"."MatchedBet"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
