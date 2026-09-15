import { expect, test } from '@playwright/test';

/**
 * One entry per showcase block on /design-system, matched to its data-vr
 * attribute. Adding a component to the library without adding it here is
 * exactly what `the_documentation_page_lists_every_component` below exists
 * to catch.
 */
const BLOCKS = [
  'button',
  'card',
  'badge',
  'meter',
  'chip',
  'field',
  'icons',
  'stack',
  'grid',
  'loading',
  'empty',
  'error',
] as const;

/**
 * Light is the product's default regardless of OS preference, so Playwright's
 * `colorScheme` context emulation (which only affects prefers-color-scheme)
 * no longer selects a theme here — it would just render light either way.
 * Forcing dark means writing the same explicit choice a real visitor's
 * toggle click would: seeding localStorage before the app's own init script
 * runs, via addInitScript rather than a post-load evaluate.
 */
async function gotoDocs(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  if (theme === 'dark') {
    await page.addInitScript(() => window.localStorage.setItem('eq-theme', 'dark'));
  }
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { name: 'Design System' })).toBeVisible();
}

/**
 * `/login` needs no session, unlike `/settings` — which is why only the
 * login screen has a baseline here. Settings sits behind the session guard,
 * and this repo has no e2e auth-seeding pattern yet (no storageState fixture,
 * no test-login helper); inventing one without a live API to verify it
 * against would ship untested scaffolding, not a real check. See
 * docs/F22-design-reference-and-visual-realignment/progress.md, Stage 4.
 */
async function gotoLogin(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  if (theme === 'dark') {
    await page.addInitScript(() => window.localStorage.setItem('eq-theme', 'dark'));
  }
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
}

test.describe('light theme', () => {
  test('every_showcase_block_matches_its_light_baseline', async ({ page }) => {
    await gotoDocs(page, 'light');

    for (const block of BLOCKS) {
      const section = page.locator(`[data-vr="${block}"]`);
      await expect(section).toBeVisible();
      await expect(section).toHaveScreenshot(`${block}-light.png`);
    }
  });
});

test.describe('dark theme', () => {
  test('every_showcase_block_matches_its_dark_baseline', async ({ page }) => {
    await gotoDocs(page, 'dark');

    for (const block of BLOCKS) {
      const section = page.locator(`[data-vr="${block}"]`);
      await expect(section).toBeVisible();
      await expect(section).toHaveScreenshot(`${block}-dark.png`);
    }
  });
});

test.describe('login screen', () => {
  test('the_login_screen_matches_its_light_baseline', async ({ page }) => {
    await gotoLogin(page, 'light');
    await expect(page).toHaveScreenshot('login-screen-light.png');
  });

  test('the_login_screen_matches_its_dark_baseline', async ({ page }) => {
    await gotoLogin(page, 'dark');
    await expect(page).toHaveScreenshot('login-screen-dark.png');
  });
});

test('the_documentation_page_lists_every_component', async ({ page }) => {
  await gotoDocs(page, 'light');

  const vrIds = await page.locator('[data-vr]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-vr')),
  );

  expect(new Set(vrIds)).toEqual(new Set(BLOCKS));
});
