CREATE TABLE IF NOT EXISTS "EmailPromoCandidate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"userId" uuid NOT NULL,
	"gmailConnectionId" uuid NOT NULL,
	"gmailMessageId" text NOT NULL,
	"gmailThreadId" text,
	"receivedAt" timestamp,
	"sender" text,
	"subject" text NOT NULL,
	"snippet" text,
	"bodyHash" varchar(64) NOT NULL,
	"accountId" uuid,
	"accountNameGuess" text,
	"promoKind" varchar NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"terms" jsonb,
	"expiresAt" timestamp,
	"minOdds" numeric(12, 4),
	"maxStake" numeric(14, 2),
	"currency" varchar(3),
	"confidence" numeric(5, 4) NOT NULL,
	"status" varchar DEFAULT 'new' NOT NULL,
	"rawModelOutput" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "GmailConnection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"userId" uuid NOT NULL,
	"gmailEmail" text NOT NULL,
	"accessTokenCiphertext" text NOT NULL,
	"refreshTokenCiphertext" text,
	"tokenExpiresAt" timestamp,
	"scope" text,
	"historyId" text,
	"watchExpiration" timestamp,
	"status" varchar DEFAULT 'connected' NOT NULL,
	"lastSyncedAt" timestamp,
	"lastError" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EmailPromoCandidate" ADD CONSTRAINT "EmailPromoCandidate_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EmailPromoCandidate" ADD CONSTRAINT "EmailPromoCandidate_gmailConnectionId_GmailConnection_id_fk" FOREIGN KEY ("gmailConnectionId") REFERENCES "public"."GmailConnection"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EmailPromoCandidate" ADD CONSTRAINT "EmailPromoCandidate_accountId_Account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_promo_user_status_idx" ON "EmailPromoCandidate" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_promo_user_received_idx" ON "EmailPromoCandidate" USING btree ("userId","receivedAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_promo_user_message_unique_idx" ON "EmailPromoCandidate" USING btree ("userId","gmailMessageId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gmail_connection_user_unique_idx" ON "GmailConnection" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gmail_connection_status_idx" ON "GmailConnection" USING btree ("status");