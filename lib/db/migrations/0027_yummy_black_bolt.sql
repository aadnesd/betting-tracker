CREATE TABLE IF NOT EXISTS "BalanceSnapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"userId" uuid NOT NULL,
	"totalCapitalNok" numeric(20, 2) NOT NULL,
	"accountsNok" numeric(20, 2),
	"walletsNok" numeric(20, 2)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "BalanceSnapshot" ADD CONSTRAINT "BalanceSnapshot_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
