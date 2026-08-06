import type { Page } from '@playwright/test';

/** Auto-accepts every native dialog (confirm/alert) for the rest of the test. */
export function acceptAllDialogs(page: Page): void {
  page.on('dialog', (d) => { void d.accept(); });
}

/**
 * showSaveFilePicker triggers a native OS picker Playwright can't drive — remove it
 * before any app script runs so saveProject() deterministically takes the
 * window.prompt + Blob-download fallback path. Must be called before gotoReady().
 */
export async function stubOutFileSystemAccessApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // @ts-expect-error test-only override — showSaveFilePicker isn't in this lib target
    delete window.showSaveFilePicker;
  });
}
