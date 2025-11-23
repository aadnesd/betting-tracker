CREATE TABLE IF NOT EXISTS "ScreenshotUpload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"userId" uuid NOT NULL,
	"kind" varchar NOT NULL,
	"url" text NOT NULL,
	"filename" text,
	"contentType" varchar(64),
	"size" numeric(12, 0),
	"status" varchar NOT NULL DEFAULT 'uploaded',
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "BackBet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"userId" uuid NOT NULL,
	"screenshotId" uuid NOT NULL,
	"market" text NOT NULL,
	"selection" text NOT NULL,
	"odds" numeric(12, 4) NOT NULL,
	"stake" numeric(12, 2) NOT NULL,
	"exchange" text NOT NULL,
	"potentialReturn" numeric(14, 2),
	"betReference" text,
	"placedAt" timestamp,
	"confidence" jsonb,
	"status" varchar NOT NULL DEFAULT 'parsed',
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "LayBet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"userId" uuid NOT NULL,
	"screenshotId" uuid NOT NULL,
	"market" text NOT NULL,
	"selection" text NOT NULL,
	"odds" numeric(12, 4) NOT NULL,
	"stake" numeric(12, 2) NOT NULL,
	"exchange" text NOT NULL,
	"potentialReturn" numeric(14, 2),
	"betReference" text,
	"placedAt" timestamp,
	"confidence" jsonb,
	"status" varchar NOT NULL DEFAULT 'parsed',
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MatchedBet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"userId" uuid NOT NULL,
	"backBetId" uuid NOT NULL,
	"layBetId" uuid NOT NULL,
	"market" text NOT NULL,
	"selection" text NOT NULL,
	"status" varchar NOT NULL DEFAULT 'pending',
	"netExposure" numeric(14, 2),
	"notes" text,
	"confirmedAt" timestamp,
	"lastError" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ScreenshotUpload" ADD CONSTRAINT "ScreenshotUpload_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BackBet" ADD CONSTRAINT "BackBet_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BackBet" ADD CONSTRAINT "BackBet_screenshotId_ScreenshotUpload_id_fk" FOREIGN KEY ("screenshotId") REFERENCES "public"."ScreenshotUpload"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "LayBet" ADD CONSTRAINT "LayBet_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "LayBet" ADD CONSTRAINT "LayBet_screenshotId_ScreenshotUpload_id_fk" FOREIGN KEY ("screenshotId") REFERENCES "public"."ScreenshotUpload"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatchedBet" ADD CONSTRAINT "MatchedBet_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatchedBet" ADD CONSTRAINT "MatchedBet_backBetId_BackBet_id_fk" FOREIGN KEY ("backBetId") REFERENCES "public"."BackBet"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatchedBet" ADD CONSTRAINT "MatchedBet_layBetId_LayBet_id_fk" FOREIGN KEY ("layBetId") REFERENCES "public"."LayBet"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
