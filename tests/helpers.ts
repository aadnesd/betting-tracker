import fs from "node:fs";
import path from "node:path";
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { getUnixTime } from "date-fns";

export type UserContext = {
  context: BrowserContext;
  page: Page;
  request: APIRequestContext;
};

export async function createAuthenticatedContext({
  browser,
  name,
}: {
  browser: Browser;
  name: string;
}): Promise<UserContext> {
  const host = process.env.HOST || "127.0.0.1";
  const port = process.env.PORT || "3000";
  const baseUrl = `http://${host}:${port}`;
  const directory = path.join(__dirname, "../playwright/.sessions");

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const storageFile = path.join(directory, `${name}.json`);

  const context = await browser.newContext();
  const page = await context.newPage();

  const email = `test-${name}@playwright.com`;

  // Use the test-only auth route to create and get token
  const response = await page.request.post(`${baseUrl}/api/auth/test`, {
    data: { email },
  });

  if (!response.ok()) {
    const text = await response.text();
    console.error("Test auth failed:", response.status(), text);
    throw new Error(
      `Failed to authenticate test user: ${response.status()} ${text}`
    );
  }

  const { cookieName, token } = await response.json();

  const responseHeaders = response.headers();
  const userIdHeader = responseHeaders["x-test-user-id"] ?? null;

  // Set the auth cookie in the browser context
  await context.addCookies([
    {
      name: cookieName,
      value: token,
      url: baseUrl,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  // Save the session state
  await context.storageState({ path: storageFile });
  await page.close();

  const extraHeaders = userIdHeader
    ? { "x-test-user-id": userIdHeader }
    : undefined;
  const newContext = await browser.newContext({
    storageState: storageFile,
    extraHTTPHeaders: extraHeaders,
  });
  const newPage = await newContext.newPage();

  return {
    context: newContext,
    page: newPage,
    request: newContext.request,
  };
}

export function generateRandomTestUser() {
  const email = `test-${getUnixTime(new Date())}@playwright.com`;

  return {
    email,
  };
}
