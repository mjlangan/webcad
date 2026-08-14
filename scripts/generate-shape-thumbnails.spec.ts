import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';
import { gotoReady } from '../e2e/helpers/app';
import { addPrimitive, type PrimitiveType } from '../e2e/helpers/scene';

// Regenerates the transparent-background PNG thumbnails used by the Shape
// Library tile grid (src/components/ShapeLibrary/ShapeLibrary.tsx). Not
// picked up by the normal test suite — playwright.config.ts's testDir is
// `./e2e`, and this file lives outside it. Run explicitly via:
//   npm run generate:thumbnails
//
// Rerun this whenever a shape's default params or geometry construction
// changes, so the tiles never go stale.

const SHAPE_TYPES: PrimitiveType[] = [
  'box', 'sphere', 'cylinder', 'cone', 'torus', 'beerglass',
  'wedge', 'roof', 'pyramid', 'tube', 'dome',
  'polygon', 'ellipsoid', 'capsule', 'torusknot',
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../src/assets/shapeThumbnails');

// Same direction as the "Home" camera preset (useCameraPresets.ts's PRESETS.home)
// so thumbnails match the app's own default view angle.
const HOME_DIRECTION = [80, 80, 120] as const;

test.use({ viewport: { width: 900, height: 700 } });

for (const type of SHAPE_TYPES) {
  test(`generate thumbnail: ${type}`, async ({ page }) => {
    await gotoReady(page);
    const nodeId = await addPrimitive(page, type);

    await page.evaluate(
      ({ nodeId, direction }) => {
        const three = window.__E2E__!.three!;
        const controls = window.__E2E__!.controls!;

        // Transparent background — scene.background normally paints the
        // opaque #1a1a1a viewport backdrop; null it just for this capture.
        three.scene.background = null;

        // Hide grid/gizmo/snap-marker helpers so only the shape itself renders.
        // GridHelper isn't tagged userData.isHelper (that flag is only used by
        // transient interaction helpers), so it needs an explicit check too.
        three.scene.traverse((obj) => {
          if (obj.userData.isHelper || obj.type === 'GridHelper') obj.visible = false;
        });

        // Find the mesh we just added.
        let found: import('three').Mesh | null = null;
        three.scene.traverse((obj) => {
          if ((obj as unknown as { userData: { nodeId?: string } }).userData.nodeId === nodeId) {
            found = obj as unknown as import('three').Mesh;
          }
        });
        if (!found) throw new Error(`mesh for node ${nodeId} not found`);
        const mesh: import('three').Mesh = found;

        // Bounding sphere in the mesh's local space, shifted to world space by
        // its position — safe here since a freshly-added default-workplane
        // primitive always has identity rotation and (1,1,1) scale.
        mesh.geometry.computeBoundingSphere();
        const { center, radius } = mesh.geometry.boundingSphere!;
        const worldCenter = {
          x: center.x + mesh.position.x,
          y: center.y + mesh.position.y,
          z: center.z + mesh.position.z,
        };

        // Fit distance so the sphere's true angular radius (asin, not the
        // small-angle tan() approximation useCameraPresets.ts uses — that's
        // fine there since it's normally framing a whole distant scene, but
        // breaks down here where a single shape deliberately fills most of
        // the frame) stays within the camera's half-FOV, with a 20% padded
        // radius reserved as margin.
        const [dx, dy, dz] = direction;
        const dirLen = Math.hypot(dx, dy, dz);
        // This script always drives the app in its default (perspective) camera mode.
        const camera = three.camera as import('three').PerspectiveCamera;
        const fovRad = camera.fov * (Math.PI / 180);
        const aspect = camera.aspect;
        const halfAngle = Math.min(fovRad / 2, Math.atan(Math.tan(fovRad / 2) * aspect));
        const dist = (radius * 1.2) / Math.sin(halfAngle);

        three.camera.position.set(
          worldCenter.x + (dx / dirLen) * dist,
          worldCenter.y + (dy / dirLen) * dist,
          worldCenter.z + (dz / dirLen) * dist,
        );
        three.camera.up.set(0, 1, 0);
        three.camera.lookAt(worldCenter.x, worldCenter.y, worldCenter.z);
        three.camera.updateProjectionMatrix();

        // OrbitControls.update() runs every frame (wired into the render
        // loop) and re-derives the camera's look direction from its OWN
        // target each time — without this, it silently snaps the camera
        // back to looking at the stale default target (the scene origin)
        // on the very next frame, overriding the lookAt() above.
        controls.target.set(worldCenter.x, worldCenter.y, worldCenter.z);
        controls.update();

        three.renderer.render(three.scene, three.camera);
      },
      { nodeId, direction: HOME_DIRECTION },
    );

    // Hide UI chrome that visually overlaps the canvas (the Shape Library
    // drawer/handle opened by addPrimitive, any lingering hover tooltip, and
    // the corner axes-gizmo — a separate overlapping <canvas>). Playwright's
    // element screenshot captures whatever's actually composited on screen,
    // not the target element in isolation, so these must be hidden first.
    await page.evaluate(() => {
      document.querySelectorAll('[data-testid="shape-library-handle"]').forEach((el) => {
        (el.parentElement as HTMLElement).style.display = 'none';
      });
      document.querySelectorAll('.ant-drawer, .ant-tooltip, .axes-gizmo').forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
    });

    await page.locator('canvas.viewport-canvas').screenshot({
      path: path.join(OUTPUT_DIR, `${type}.png`),
      omitBackground: true,
    });
  });
}
