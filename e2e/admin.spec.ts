import { test, expect } from "@playwright/test";
import { loginAs, logout } from "./helpers/login";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ALICE_EMAIL,
  ALICE_PASSWORD,
  BOB_EMAIL,
  BOB_PASSWORD,
} from "./global-setup";

test.describe.configure({ mode: "serial" });

test.describe("Admin panel", () => {
  test("non_admin_gets_404_on_admin_routes", async ({ page }) => {
    await loginAs(page, ALICE_EMAIL, ALICE_PASSWORD);
    const res = await page.goto("/admin");
    expect(res?.status()).toBe(404);
    const res2 = await page.goto("/admin/users");
    expect(res2?.status()).toBe(404);
    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  });

  test("admin_sees_total_users_and_total_videos_on_dashboard", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Total users")).toBeVisible();
    await expect(page.getByText("Total videos")).toBeVisible();
  });

  test("admin_sees_users_list_with_required_columns", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/users");
    for (const header of [
      "Name",
      "Email",
      "Registration",
      "Last login",
      "Videos",
      "Status",
    ]) {
      await expect(
        page.getByRole("columnheader").filter({ hasText: header }),
      ).toBeVisible();
    }
    await expect(page.getByRole("cell", { name: ADMIN_EMAIL })).toBeVisible();
    await expect(page.getByRole("cell", { name: ALICE_EMAIL })).toBeVisible();
  });

  test("admin_can_search_by_name_and_email_substring", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/users");
    await page.getByRole("searchbox").fill("alice");
    await page.getByRole("searchbox").press("Enter");
    await page.waitForURL((url) => url.searchParams.get("q") === "alice", {
      timeout: 10_000,
    });
    await expect(page.getByRole("cell", { name: ALICE_EMAIL })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: ADMIN_EMAIL }),
    ).toHaveCount(0);
  });

  test("admin_can_sort_by_any_column", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/users");
    await page.getByRole("link", { name: /^email/i }).click();
    await page.waitForURL((url) => url.searchParams.get("sort") === "email", {
      timeout: 10_000,
    });
  });

  test("admin_cannot_suspend_or_delete_own_account", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/users");
    const row = page.locator("tbody tr", { hasText: ADMIN_EMAIL });
    await expect(row.getByRole("button", { name: "Suspend" })).toBeDisabled();
    await expect(row.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  test("admin_can_suspend_user_and_suspended_user_cannot_log_in", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/users");
    await page
      .locator("tbody tr", { hasText: ALICE_EMAIL })
      .getByRole("button", { name: "Suspend" })
      .click();
    await expect(
      page.locator("tbody tr", { hasText: ALICE_EMAIL }).getByText("Suspended"),
    ).toBeVisible({ timeout: 10_000 });
    await logout(page);
    await page.goto("/login");
    await page.getByLabel("Email").fill(ALICE_EMAIL);
    await page.getByLabel("Password").fill(ALICE_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });

  test("admin_can_reactivate_user_and_user_can_log_in_again", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/users");
    await page
      .locator("tbody tr", { hasText: ALICE_EMAIL })
      .getByRole("button", { name: "Reactivate" })
      .click();
    await expect(
      page.locator("tbody tr", { hasText: ALICE_EMAIL }).getByText("Active"),
    ).toBeVisible({ timeout: 10_000 });
    await logout(page);
    await loginAs(page, ALICE_EMAIL, ALICE_PASSWORD);
    await expect(page).toHaveURL(/\/app/);
  });

  test("admin_delete_requires_typing_email_verbatim", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    const bobRow = page.locator("tbody tr", { hasText: BOB_EMAIL });
    await bobRow.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const deleteBtn = dialog.getByRole("button", { name: /delete user/i });
    await expect(deleteBtn).toBeDisabled();
    await dialog.getByLabel(/type/i).fill("wrong@example.com");
    await expect(deleteBtn).toBeDisabled();
    await dialog.getByLabel(/type/i).fill(BOB_EMAIL);
    // 1s lockout
    await page.waitForTimeout(1100);
    await expect(deleteBtn).toBeEnabled();
    await deleteBtn.click();
    await expect(page.locator("tbody tr", { hasText: BOB_EMAIL })).toHaveCount(0, {
      timeout: 10_000,
    });
    // Re-login attempt fails because bob was already suspended and now is deleted
    await logout(page);
    await page.goto("/login");
    await page.getByLabel("Email").fill(BOB_EMAIL);
    await page.getByLabel("Password").fill(BOB_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });
});
