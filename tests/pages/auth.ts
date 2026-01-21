import type { Page } from "@playwright/test";
import { expect } from "../fixtures";

/**
 * Page helper for OAuth login/register pages.
 * Note: OAuth authentication cannot be fully automated in tests.
 * Use the test-only auth route (/api/auth/test) for test authentication.
 */
export class AuthPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoLogin() {
    await this.page.goto("/login");
    await expect(this.page.getByRole("heading")).toContainText("Sign In");
  }

  async gotoRegister() {
    await this.page.goto("/register");
    await expect(this.page.getByRole("heading")).toContainText("Create Account");
  }

  async expectToastToContain(text: string) {
    await expect(this.page.getByTestId("toast")).toContainText(text);
  }

  async openSidebar() {
    const sidebarToggleButton = this.page.getByTestId("sidebar-toggle-button");
    await sidebarToggleButton.click();
  }
}
