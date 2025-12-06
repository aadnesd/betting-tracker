ALTER TABLE "BackBet" ADD COLUMN "currency" varchar(3);
ALTER TABLE "LayBet" ADD COLUMN "currency" varchar(3);
ALTER TABLE "BackBet" DROP COLUMN IF EXISTS "potentialReturn";
ALTER TABLE "BackBet" DROP COLUMN IF EXISTS "betReference";
ALTER TABLE "LayBet" DROP COLUMN IF EXISTS "potentialReturn";
ALTER TABLE "LayBet" DROP COLUMN IF EXISTS "betReference";
