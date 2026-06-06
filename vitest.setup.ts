// Ensure Playwright-style mocks are used when running unit tests.
// Integration tests set REAL_AI=true to bypass this.
if (!process.env.REAL_AI) {
  process.env.PLAYWRIGHT = process.env.PLAYWRIGHT || "true";
}

// Unit tests mock the database layer, but importing `@/lib/db/connection`
// still throws at module load if POSTGRES_URL is unset. Provide a dummy DSN so
// the suite runs without a real database or local .env.local.
process.env.POSTGRES_URL =
  process.env.POSTGRES_URL || "postgres://test:test@localhost:5432/test";
