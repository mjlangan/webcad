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

/**
 * Stubs showSaveFilePicker with a fake handle whose createWritable().write()
 * captures the written text on window.__e2eSavedContent, so saveProject()'s
 * File System Access API path (rather than the prompt+Blob download fallback)
 * can be exercised and asserted on without driving a real native OS picker.
 * Must be called before gotoReady().
 */
export async function mockFileSystemAccessApiSave(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // @ts-expect-error test-only override — not in this lib target
    window.showSaveFilePicker = async () => ({
      createWritable: async () => ({
        write: async (data: string) => {
          // @ts-expect-error test-only global, read back via getMockedSavedContent
          window.__e2eSavedContent = data;
        },
        close: async () => {},
      }),
    });
  });
}

/** Reads back the content captured by mockFileSystemAccessApiSave. */
export function getMockedSavedContent(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    // @ts-expect-error test-only global set by mockFileSystemAccessApiSave
    return window.__e2eSavedContent as string | undefined;
  });
}
