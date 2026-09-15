import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against the containerised web service (see the `visual` service in
 * docker-compose.yml), which is what makes the committed baselines
 * platform-stable — Chromium rasterises fonts differently per OS, so a
 * baseline generated on a developer's host would fail for anyone else.
 */
const baseURL = process.env.VISUAL_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  use: {
    baseURL,
    trace: 'off',
  },
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
