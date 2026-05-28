import { chromium } from "@playwright/test";
import { createAuthenticatedContext } from "./tests/helpers";

async function shot(page: any, name: string) {
  const p = `/tmp/bonus-ui-${Date.now()}-${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  console.log("screenshot", p);
}

async function main() {
  const baseUrl = "http://127.0.0.1:3000";
  process.env.HOST = "127.0.0.1";
  process.env.PORT = "3000";

  const browser = await chromium.launch({ headless: true });
  const runId = Date.now();

  try {
    const { context, page, request } = await createAuthenticatedContext({
      browser,
      name: `bonus-create-ui-${runId}`,
    });

    const accountName = `Bonus UI Account ${runId}`;

    const accountRes = await request.post(`${baseUrl}/api/bets/accounts`, {
      data: { name: accountName, kind: "bookmaker", currency: "NOK" },
    });
    if (!accountRes.ok()) {
      throw new Error(await accountRes.text());
    }

    await page.goto(`${baseUrl}/bets`);
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("button", { name: /Quick Transaction|Txn/i })
      .first()
      .click();

    await page.getByText("Select an account", { exact: false }).first().click();
    await page.getByRole("option", { name: accountName }).first().click();

    const subTrigger = page.getByLabel("Bonus Subcategory");
    await subTrigger.click();
    await shot(page, "dropdown-open");

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await shot(page, "after-keyboard-select");

    const createInputCount = await page
      .getByPlaceholder("e.g., Weekly bonus")
      .count();
    console.log("create input count", createInputCount);

    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
