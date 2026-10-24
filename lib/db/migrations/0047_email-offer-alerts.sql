CREATE TABLE IF NOT EXISTS "EmailAlertSettings" (
	"userId" uuid PRIMARY KEY NOT NULL,
	"chatId" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabledAt" timestamp with time zone,
	"bindingId" uuid DEFAULT gen_random_uuid() NOT NULL,
	"pendingChatId" text,
	"verificationHash" text,
	"verificationExpiresAt" timestamp with time zone,
	"verificationAttempts" integer DEFAULT 0 NOT NULL,
	"requestedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "EmailOfferAlert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offerId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"bindingId" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"dueAt" timestamp with time zone DEFAULT now() NOT NULL,
	"sentAt" timestamp with time zone,
	"skippedAt" timestamp with time zone,
	"leaseToken" uuid,
	"leaseUntil" timestamp with time zone,
	"messageId" integer,
	"lastError" text
);
--> statement-breakpoint
DROP INDEX IF EXISTS "email_mailbox_scan_idx";--> statement-breakpoint
ALTER TABLE "EmailMailboxScan" ADD COLUMN "kind" varchar DEFAULT 'history' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EmailAlertSettings" ADD CONSTRAINT "EmailAlertSettings_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EmailOfferAlert" ADD CONSTRAINT "EmailOfferAlert_offerId_EmailOffer_id_fk" FOREIGN KEY ("offerId") REFERENCES "public"."EmailOffer"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EmailOfferAlert" ADD CONSTRAINT "EmailOfferAlert_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_offer_alert_offer_idx" ON "EmailOfferAlert" USING btree ("offerId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_offer_alert_due_idx" ON "EmailOfferAlert" USING btree ("dueAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_mailbox_scan_idx" ON "EmailMailboxScan" USING btree ("userId","mailboxEmail","kind");