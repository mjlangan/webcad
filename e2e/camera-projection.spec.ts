import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive } from './helpers/scene';

async function switchToOrthographic(page: import('@playwright/test').Page): Promise<void> {
  await page.getByTestId('toolbar-prefs').click();
  await page.getByTestId('toolbar-prefs-camera-orthographic').click();
  await expect.poll(
    () => page.evaluate(() => window.__E2E__!.three!.camera.type),
  ).toBe('OrthographicCamera');
  await page.locator('.ant-modal-close').click(); // close the Preferences modal
  await expect(page.locator('.ant-modal-mask')).toHaveCount(0);
}

test('toggling camera projection switches the live camera type', async ({ page }) => {
  await gotoReady(page);

  expect(await page.evaluate(() => window.__E2E__!.three!.camera.type)).toBe('PerspectiveCamera');

  await switchToOrthographic(page);

  // Switching back works too.
  await page.getByTestId('toolbar-prefs').click();
  await page.getByTestId('toolbar-prefs-camera-perspective').click();
  await expect.poll(
    () => page.evaluate(() => window.__E2E__!.three!.camera.type),
  ).toBe('PerspectiveCamera');
});

test('the camera view (position/target) survives a projection toggle', async ({ page }) => {
  await gotoReady(page);

  const before = await page.evaluate(() => {
    const cam = window.__E2E__!.three!.camera;
    return { x: cam.position.x, y: cam.position.y, z: cam.position.z };
  });

  await switchToOrthographic(page);

  const after = await page.evaluate(() => {
    const cam = window.__E2E__!.three!.camera;
    return { x: cam.position.x, y: cam.position.y, z: cam.position.z };
  });

  expect(after.x).toBeCloseTo(before.x, 3);
  expect(after.y).toBeCloseTo(before.y, 3);
  expect(after.z).toBeCloseTo(before.z, 3);
});

test('camera presets frame the scene without producing NaN in orthographic mode', async ({ page }) => {
  await gotoReady(page);
  await addPrimitive(page, 'box');
  await switchToOrthographic(page);

  await page.getByTestId('toolbar-view-front').click();

  // Wait for the preset's animateTo transition (~350ms) to finish settling.
  let lastZ: number | null = null;
  await expect.poll(async () => {
    const z = await page.evaluate(() => window.__E2E__!.three!.camera.position.z);
    const stable = z === lastZ;
    lastZ = z;
    return stable;
  }, { timeout: 2000, intervals: [50] }).toBe(true);

  const state = await page.evaluate(() => {
    const cam = window.__E2E__!.three!.camera as unknown as { position: { x: number; y: number; z: number }; zoom: number };
    return { x: cam.position.x, y: cam.position.y, z: cam.position.z, zoom: cam.zoom };
  });

  for (const v of Object.values(state)) {
    expect(Number.isFinite(v)).toBe(true);
  }
  expect(state.zoom).toBeGreaterThan(0);
});

test('orbit-drag still moves the camera in orthographic mode', async ({ page }) => {
  await gotoReady(page);
  await switchToOrthographic(page);

  const before = await page.evaluate(() => {
    const cam = window.__E2E__!.three!.camera;
    return { x: cam.position.x, y: cam.position.y, z: cam.position.z };
  });

  const box = (await page.locator('canvas.viewport-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 40, { steps: 8 });
  await page.mouse.up();

  // OrbitControls has enableDamping on, so the rotation applies inertially over
  // several subsequent RAF frames rather than instantly on pointerup — poll
  // instead of reading position immediately.
  await expect.poll(async () => {
    return page.evaluate(() => {
      const cam = window.__E2E__!.three!.camera;
      return { x: cam.position.x, y: cam.position.y, z: cam.position.z };
    });
  }, { timeout: 2000 }).not.toEqual(before);
});
