import type { Page } from "@playwright/test";

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login")),
    page.getByRole("button", { name: "Log in" }).click(),
  ]);
}

export async function logout(page: Page) {
  await page
    .locator("header")
    .getByRole("button", { name: "Log out" })
    .click();
  await page.waitForURL((url) => url.pathname === "/");
}
