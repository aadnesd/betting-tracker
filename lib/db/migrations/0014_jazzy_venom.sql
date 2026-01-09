CREATE TABLE IF NOT EXISTS "Account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"userId" uuid NOT NULL,
	"name" text NOT NULL,
	"nameNormalized" text NOT NULL,
	"kind" varchar NOT NULL,
	"currency" varchar(3),
	"commission" numeric(6, 4),
	"status" varchar DEFAULT 'active' NOT NULL,
	"limits" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AccountTransaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"userId" uuid NOT NULL,
	"accountId" uuid NOT NULL,
	"type" varchar NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"occurredAt" timestamp NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Promo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"userId" uuid NOT NULL,
	"type" text NOT NULL,
	"typeNormalized" text NOT NULL,
	"minOdds" numeric(12, 4),
	"maxStake" numeric(12, 2),
	"expiry" timestamp,
	"terms" text
);
--> statement-breakpoint
ALTER TABLE "BackBet" ADD COLUMN "accountId" uuid;--> statement-breakpoint
ALTER TABLE "LayBet" ADD COLUMN "accountId" uuid;--> statement-breakpoint
ALTER TABLE "MatchedBet" ADD COLUMN "promoId" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_accountId_Account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Promo" ADD CONSTRAINT "Promo_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BackBet" ADD CONSTRAINT "BackBet_accountId_Account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "LayBet" ADD CONSTRAINT "LayBet_accountId_Account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatchedBet" ADD CONSTRAINT "MatchedBet_promoId_Promo_id_fk" FOREIGN KEY ("promoId") REFERENCES "public"."Promo"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
