ALTER TABLE "AccountTransaction" ADD COLUMN "depositFeeAmount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "AccountTransaction" ADD COLUMN "depositFeeCurrency" varchar(3);--> statement-breakpoint
ALTER TABLE "AccountTransaction" ADD COLUMN "depositFeeAmountNok" numeric(14, 2);