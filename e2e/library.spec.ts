import { test, expect, type Page } from "@playwright/test";

const TEST_PASSWORD = "test1234abc";

async function registerAndLogin(page: Page, prefix: string) {
  const email = `${prefix}-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel(/confirm/i).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /create account|sign up|register/i }).click();
  await page.waitForURL(/\/app/);
  return email;
}

test.describe.configure({ mode: "serial" });

test.describe("F04 library e2e", () => {
  test("empty_state_renders_for_new_user", async ({ page }) => {
    await registerAndLogin(page, "empty");
    await expect(page.getByTestId("library-empty-state")).toBeVisible();
    await expect(
      page.getByText("Upload your first video to get started"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /drop videos here|drag a video/i }),
    ).toBeVisible();
  });

  test("view_mode_persists_across_reload", async ({ page }) => {
    await registerAndLogin(page, "view-toggle");
    const listToggle = page.getByTestId("view-toggle-list");
    await expect(listToggle).toBeVisible();
    await Promise.all([page.waitForLoadState("networkidle"), listToggle.click()]);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("library-client")).toHaveAttribute("data-view", "list");
    await expect(page.getByTestId("view-toggle-list")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
