// Ensure Playwright-style mocks are used when running unit tests.
// Integration tests set REAL_AI=true to bypass this.
if (!process.env.REAL_AI) {
  process.env.PLAYWRIGHT = process.env.PLAYWRIGHT || "true";
}
