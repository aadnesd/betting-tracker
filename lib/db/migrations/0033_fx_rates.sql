CREATE TABLE IF NOT EXISTS "FxRate" (
  "baseCurrency" varchar(8) PRIMARY KEY NOT NULL,
  "rateToNok" numeric(18, 8) NOT NULL,
  "updatedAt" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "fx_rate_updated_at_idx" ON "FxRate" ("updatedAt");
