ALTER TABLE "MatchedBet" ADD COLUMN "settledProfitNok" numeric(14, 2);--> statement-breakpoint
UPDATE "MatchedBet" AS matched
SET "settledProfitNok" = (
  COALESCE(back_bet."profitLossNok", 0) + COALESCE(lay_bet."profitLossNok", 0)
)
FROM "BackBet" AS back_bet, "LayBet" AS lay_bet
WHERE matched."backBetId" = back_bet."id"
  AND matched."layBetId" = lay_bet."id"
  AND matched."status" = 'settled'
  AND back_bet."profitLossNok" IS NOT NULL
  AND lay_bet."profitLossNok" IS NOT NULL;
