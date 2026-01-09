CREATE TABLE IF NOT EXISTS "AuditLog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"userId" uuid NOT NULL,
	"entityType" varchar NOT NULL,
	"entityId" uuid NOT NULL,
	"action" varchar NOT NULL,
	"changes" jsonb,
	"notes" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
