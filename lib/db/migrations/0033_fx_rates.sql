CREATE TABLE "FxRate" (
  "baseCurrency" varchar(8) PRIMARY KEY NOT NULL,
  "rateToNok" numeric(18, 8) NOT NULL,
  "updatedAt" timestamp NOT NULL
);

CREATE INDEX "fx_rate_updated_at_idx" ON "FxRate" ("updatedAt");
