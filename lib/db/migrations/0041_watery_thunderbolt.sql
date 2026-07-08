ALTER TABLE "UserSettings" ADD COLUMN "defaultLayExchangeAccountId" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_defaultLayExchangeAccountId_Account_id_fk" FOREIGN KEY ("defaultLayExchangeAccountId") REFERENCES "public"."Account"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
