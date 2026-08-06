import type { Page } from '@playwright/test';

/** Navigate to the app and wait until the three.js setup (and E2E bridge) are live. */
export async function gotoReady(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__E2E__?.three);
}
