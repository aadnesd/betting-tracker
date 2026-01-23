CREATE TABLE IF NOT EXISTS "BonusQualifyingBet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"depositBonusId" uuid NOT NULL,
	"backBetId" uuid,
	"matchedBetId" uuid,
	"stake" numeric(14, 2) NOT NULL,
	"odds" numeric(12, 4) NOT NULL,
	"qualified" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "DepositBonus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"userId" uuid NOT NULL,
	"accountId" uuid NOT NULL,
	"name" text NOT NULL,
	"depositAmount" numeric(14, 2) NOT NULL,
	"bonusAmount" numeric(14, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"wageringMultiplier" numeric(6, 2) NOT NULL,
	"wageringBase" varchar NOT NULL,
	"wageringRequirement" numeric(14, 2) NOT NULL,
	"wageringProgress" numeric(14, 2) DEFAULT '0' NOT NULL,
	"minOdds" numeric(12, 4) NOT NULL,
	"maxBetPercent" numeric(5, 2),
	"expiresAt" timestamp,
	"status" varchar DEFAULT 'active' NOT NULL,
	"linkedTransactionId" uuid,
	"clearedAt" timestamp,
	"notes" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BonusQualifyingBet" ADD CONSTRAINT "BonusQualifyingBet_depositBonusId_DepositBonus_id_fk" FOREIGN KEY ("depositBonusId") REFERENCES "public"."DepositBonus"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BonusQualifyingBet" ADD CONSTRAINT "BonusQualifyingBet_backBetId_BackBet_id_fk" FOREIGN KEY ("backBetId") REFERENCES "public"."BackBet"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BonusQualifyingBet" ADD CONSTRAINT "BonusQualifyingBet_matchedBetId_MatchedBet_id_fk" FOREIGN KEY ("matchedBetId") REFERENCES "public"."MatchedBet"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DepositBonus" ADD CONSTRAINT "DepositBonus_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DepositBonus" ADD CONSTRAINT "DepositBonus_accountId_Account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DepositBonus" ADD CONSTRAINT "DepositBonus_linkedTransactionId_AccountTransaction_id_fk" FOREIGN KEY ("linkedTransactionId") REFERENCES "public"."AccountTransaction"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
