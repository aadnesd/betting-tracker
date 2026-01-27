ALTER TABLE "AccountTransaction" ADD COLUMN "linkedBackBetId" uuid;--> statement-breakpoint
ALTER TABLE "AccountTransaction" ADD COLUMN "linkedLayBetId" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_linkedBackBetId_BackBet_id_fk" FOREIGN KEY ("linkedBackBetId") REFERENCES "public"."BackBet"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_linkedLayBetId_LayBet_id_fk" FOREIGN KEY ("linkedLayBetId") REFERENCES "public"."LayBet"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
