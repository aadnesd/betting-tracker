CREATE TABLE IF NOT EXISTS "EmailMailboxScan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"mailboxEmail" text NOT NULL,
	"checkedUntil" timestamp with time zone,
	"scanAfter" timestamp with time zone,
	"scanBefore" timestamp with time zone,
	"pageToken" text,
	"leaseToken" uuid,
	"leaseUntil" timestamp with time zone,
	"attemptedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "EmailOffer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"mailboxEmail" text NOT NULL,
	"messageId" text NOT NULL,
	"threadId" text NOT NULL,
	"sender" text NOT NULL,
	"subject" text NOT NULL,
	"receivedAt" timestamp with time zone NOT NULL,
	"assessment" jsonb NOT NULL,
	"status" varchar DEFAULT 'new' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EmailMailboxScan" ADD CONSTRAINT "EmailMailboxScan_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EmailOffer" ADD CONSTRAINT "EmailOffer_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_mailbox_scan_idx" ON "EmailMailboxScan" USING btree ("userId","mailboxEmail");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_offer_message_idx" ON "EmailOffer" USING btree ("userId","mailboxEmail","messageId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_offer_inbox_idx" ON "EmailOffer" USING btree ("userId","status","receivedAt");