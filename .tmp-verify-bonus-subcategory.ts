import { chromium, expect } from "@playwright/test";
import { createAuthenticatedContext } from "./tests/helpers";

async function main() {
  const baseUrl = "http://127.0.0.1:3000";
  process.env.HOST = "127.0.0.1";
  process.env.PORT = "3000";

  const browser = await chromium.launch({ headless: true });
  const runId = Date.now();

  try {
    const { context, page, request } = await createAuthenticatedContext({
      browser,
      name: `bonus-subcategory-${runId}`,
    });

    const accountName = `Bonus Test Account ${runId}`;
    const subcategoryName = `Weekly bonus ${runId}`;

    const accountRes = await request.post(`${baseUrl}/api/bets/accounts`, {
      data: { name: accountName, kind: "bookmaker", currency: "NOK" },
    });

    if (!accountRes.ok()) {
      throw new Error(
        `Account create failed: ${accountRes.status()} ${await accountRes.text()}`
      );
    }

    const accountData = await accountRes.json();
    const accountId: string = accountData.account.id;

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
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await page.getByPlaceholder("e.g., Weekly bonus").fill(subcategoryName);
    await page.getByRole("button", { name: "Add" }).click();

    await expect(subTrigger).toContainText(subcategoryName);

    await page.locator("#amount").fill("123.45");

    const createTx = page.waitForResponse((res) => {
      return (
        res.url().includes(`/api/bets/accounts/${accountId}/transactions`) &&
        res.request().method() === "POST"
      );
    });

    await page.getByRole("button", { name: "Record Transaction" }).click();

    const txRes = await createTx;
    if (!txRes.ok()) {
      throw new Error(
        `Transaction create failed: ${txRes.status()} ${await txRes.text()}`
      );
    }

    await page.waitForLoadState("networkidle");

    await page
      .getByRole("button", { name: /Quick Transaction|Txn/i })
      .first()
      .click();

    await page.getByText("Select an account", { exact: false }).first().click();
    await page.getByRole("option", { name: accountName }).first().click();

    await subTrigger.click();
    await expect(
      page.getByRole("option", { name: subcategoryName }).first()
    ).toBeVisible({ timeout: 10_000 });

    const screenshotPath = `/tmp/bonus-subcategory-verified-${runId}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });

    console.log(
      JSON.stringify({ ok: true, accountName, subcategoryName, screenshotPath })
    );

    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
