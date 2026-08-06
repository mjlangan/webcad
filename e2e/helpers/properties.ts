import type { Page } from '@playwright/test';

/**
 * Sets a PropertiesPanel NumField's value. The data-testid lands on NumField's
 * wrapping <div> (uniform across its MmInput/deg/plain InputNumber variants),
 * so the actual antd <input> is one level down.
 */
export async function setNumField(page: Page, testId: string, value: number): Promise<void> {
  const input = page.getByTestId(testId).locator('input');
  await input.fill(String(value));
  await input.press('Enter');
}

export async function getNumFieldValue(page: Page, testId: string): Promise<string> {
  return page.getByTestId(testId).locator('input').inputValue();
}

/**
 * Sets a Toolbar <InputNumber> value. Unlike PropertiesPanel's NumField (which puts
 * data-testid on a wrapping <div>), Toolbar passes data-testid straight to <InputNumber>,
 * which antd forwards to the real <input> — so no `.locator('input')` hop is needed here.
 */
export async function setToolbarNumber(page: Page, testId: string, value: number): Promise<void> {
  const input = page.getByTestId(testId);
  await input.fill(String(value));
  await input.press('Enter');
}
