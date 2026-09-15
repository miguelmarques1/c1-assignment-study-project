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

test('the_documentation_page_lists_every_component', async ({ page }) => {
  await gotoDocs(page, 'light');

  const vrIds = await page.locator('[data-vr]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-vr')),
  );

  expect(new Set(vrIds)).toEqual(new Set(BLOCKS));
});
