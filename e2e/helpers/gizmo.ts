import type { Page } from '@playwright/test';

/**
 * Must match GIZMO_SIZE in src/components/Viewport/useTransformControls.ts.
 * TransformControls scales every handle's real-world position and pick region
 * proportionally to `size` (specifically by `cameraDistanceFactor * size / 4`), so
 * any calibrated grab-point offset below that's derived from that factor needs to
 * be scaled by this too, or it'll drift off the actual handle when GIZMO_SIZE changes.
 */
export const GIZMO_SIZE = 1.4;

/** Projects a world-space point (via the app's live camera) to page pixel coordinates. */
export async function worldToPage(page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> {
  const pt = await page.evaluate(([x, y, z]) => window.__E2E__!.worldToPagePx(x, y, z), [x, y, z]);
  if (!pt) throw new Error('worldToPagePx: three setup not ready');
  return pt;
}

export async function dragMouse(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 12,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** Center (in page px) of the main viewport canvas. */
export async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas.viewport-canvas').boundingBox();
  if (!box) throw new Error('viewport canvas has no bounding box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Computes a world-space point along the translate gizmo's +Y arrow, offset from
 * the object's position by `armFraction` of the gizmo's on-screen scale factor
 * (mirrors computeGizmoScaleFactor() in useTransformControls.ts) times GIZMO_SIZE.
 * armFraction=0.12 (at GIZMO_SIZE=1) reliably lands on the Y-arrow's picker mesh
 * without also grabbing the free-move cube (too close to center) or overshooting
 * past the arrow tip (calibrated against a plain box at various camera distances).
 */
export async function gizmoYArmPoint(
  page: Page,
  worldPos: [number, number, number],
  armFraction = 0.12,
): Promise<{ world: [number, number, number]; factor: number }> {
  const factor = await page.evaluate(([x, y, z]) => {
    const cam = window.__E2E__!.three!.camera;
    const dist = Math.hypot(cam.position.x - x, cam.position.y - y, cam.position.z - z);
    return dist * Math.min((1.9 * Math.tan((Math.PI * cam.fov) / 360)) / cam.zoom, 7);
  }, worldPos);
  const armY = worldPos[1] + armFraction * GIZMO_SIZE * factor;
  return { world: [worldPos[0], armY, worldPos[2]], factor };
}
