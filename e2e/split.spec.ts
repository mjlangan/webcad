import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, selectNode, getNodeCount } from './helpers/scene';

type Vec3 = [number, number, number];

// Cone defaults from the shape library: radius 10, height 20, base at y=0.
const CONE_VOLUME = (Math.PI * 100 * 20) / 3; // ≈ 2094.4
// The cone is a 64-sided approximation, so its mesh volume runs ~0.2% under
// the analytic figure; CSG adds no meaningful error beyond that.
const VOLUME_TOLERANCE = 0.02;
// How far a vertex may stray onto the wrong side of the cut plane (mm).
const PLANE_TOLERANCE = 0.01;

/** Sets the workplane directly — equivalent to clicking a face to place it
 *  and then moving it with the toolbar offset inputs. */
async function setWorkplane(
  page: import('@playwright/test').Page,
  origin: Vec3,
  normal: Vec3,
  tangentX: Vec3,
): Promise<void> {
  await page.evaluate(
    ([o, n, t]) => {
      window.__E2E__!.store.getState().setWorkplane({
        origin: o as Vec3,
        normal: n as Vec3,
        tangentX: t as Vec3,
      });
    },
    [origin, normal, tangentX] as const,
  );
}

interface PieceStats {
  name: string;
  volume: number;
  /** Signed plane-distance range over every vertex: [nearest below, furthest above]. */
  minDist: number;
  maxDist: number;
}

/** Measures each result mesh: its enclosed volume and how its vertices sit
 *  relative to the cut plane. */
async function measurePieces(
  page: import('@playwright/test').Page,
  origin: Vec3,
  normal: Vec3,
): Promise<PieceStats[]> {
  return page.evaluate(
    ([o, n]) => {
      const scene = window.__E2E__!.three!.scene;
      const { nodes } = window.__E2E__!.store.getState();
      const on = o as number[];
      const nn = n as number[];
      const len = Math.hypot(nn[0], nn[1], nn[2]);
      const nx = nn[0] / len, ny = nn[1] / len, nz = nn[2] / len;
      const d = -(nx * on[0] + ny * on[1] + nz * on[2]);

      const out: PieceStats[] = [];
      for (const node of nodes) {
        if (node.geometry.type === 'group') continue;
        let found: import('three').Mesh | null = null;
        scene.traverse((obj) => {
          const m = obj as import('three').Mesh;
          if (m.userData?.nodeId === node.id && m.geometry) found = m;
        });
        if (!found) continue;
        const src = (found as import('three').Mesh).geometry;
        const geo = src.index ? src.toNonIndexed() : src;
        const pos = geo.getAttribute('position');
        let volume = 0;
        let minDist = Infinity;
        let maxDist = -Infinity;
        for (let i = 0; i < pos.count; i += 3) {
          const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
          const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1);
          const cx = pos.getX(i + 2), cy = pos.getY(i + 2), cz = pos.getZ(i + 2);
          // Signed volume of the tetrahedron to the origin: a · (b × c) / 6
          volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
          for (const p of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) {
            const dist = nx * p[0] + ny * p[1] + nz * p[2] + d;
            if (dist < minDist) minDist = dist;
            if (dist > maxDist) maxDist = dist;
          }
        }
        out.push({ name: node.name, volume, minDist, maxDist });
      }
      return out;
    },
    [origin, normal] as const,
  ) as Promise<PieceStats[]>;
}

async function splitSelection(page: import('@playwright/test').Page): Promise<void> {
  await page.getByTestId('toolbar-workplane-split').click();
  // The button reads "Splitting…" while the worker runs; wait for it to settle.
  await expect(page.getByTestId('toolbar-workplane-split')).toHaveText('Split', { timeout: 20000 });
}

test('splits a cone cleanly along an angled workplane set on its sloped face', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'cone');

  // Normal of the cone's lateral surface, with the tangent frame the
  // face-click placement would produce.
  const L = Math.hypot(20, 10);
  const normal: Vec3 = [20 / L, 10 / L, 0];
  const tangentX: Vec3 = [0, 0, -1];
  // Moved onto the cone's axis so the plane genuinely bisects it.
  const origin: Vec3 = [0, 8, 0];
  await setWorkplane(page, origin, normal, tangentX);

  await selectNode(page, id);
  await splitSelection(page);

  expect(await getNodeCount(page)).toBe(2);
  const pieces = await measurePieces(page, origin, normal);
  expect(pieces).toHaveLength(2);

  const above = pieces.find((p) => p.name.endsWith('1'))!;
  const below = pieces.find((p) => p.name.endsWith('2'))!;

  // Each piece lies wholly on its own side of the workplane. This is the
  // regression: a mirrored cutting box made the CSG evaluator read the box as
  // inside-out, so the pieces straddled the plane instead of meeting at it.
  expect(above.minDist).toBeGreaterThan(-PLANE_TOLERANCE);
  expect(below.maxDist).toBeLessThan(PLANE_TOLERANCE);

  // Both pieces are substantial — not one sliver plus "mostly one shape".
  expect(above.volume).toBeGreaterThan(CONE_VOLUME * 0.2);
  expect(below.volume).toBeGreaterThan(CONE_VOLUME * 0.2);

  // And together they still account for the whole cone.
  expect(above.volume + below.volume).toBeCloseTo(CONE_VOLUME, -1);
  expect(Math.abs(above.volume + below.volume - CONE_VOLUME) / CONE_VOLUME)
    .toBeLessThan(VOLUME_TOLERANCE);
});

test('splits a cone at a known height, with piece 1 above and piece 2 below', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'cone');

  const origin: Vec3 = [0, 10, 0];
  const normal: Vec3 = [0, 1, 0];
  await setWorkplane(page, origin, normal, [1, 0, 0]);

  await selectNode(page, id);
  await splitSelection(page);

  const pieces = await measurePieces(page, origin, normal);
  const above = pieces.find((p) => p.name.endsWith('1'))!;
  const below = pieces.find((p) => p.name.endsWith('2'))!;

  // Cutting at half height leaves a cone of half the radius on top.
  const topCone = (Math.PI * 25 * 10) / 3; // ≈ 261.8
  expect(Math.abs(above.volume - topCone) / topCone).toBeLessThan(VOLUME_TOLERANCE);
  expect(Math.abs(below.volume - (CONE_VOLUME - topCone)) / (CONE_VOLUME - topCone))
    .toBeLessThan(VOLUME_TOLERANCE);

  // Piece 1 is the half on the normal's side, piece 2 the opposite half.
  expect(above.minDist).toBeGreaterThan(-PLANE_TOLERANCE);
  expect(below.maxDist).toBeLessThan(PLANE_TOLERANCE);
});

test('splits correctly when the workplane origin sits far to one side of the object', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'cone');

  // Same cutting plane as above (y = 10), but with its origin moved far along
  // the plane — which the toolbar offset inputs allow and which leaves the
  // plane itself unchanged. Regression: the cutting box was sized only from
  // the along-normal distance, so a laterally distant origin left the box
  // missing the object entirely and "splitting" returned it in one piece.
  const origin: Vec3 = [800, 10, 0];
  const normal: Vec3 = [0, 1, 0];
  await setWorkplane(page, origin, normal, [1, 0, 0]);

  await selectNode(page, id);
  await splitSelection(page);

  expect(await getNodeCount(page)).toBe(2);
  const pieces = await measurePieces(page, origin, normal);
  const topCone = (Math.PI * 25 * 10) / 3;
  const above = pieces.find((p) => p.name.endsWith('1'))!;
  expect(Math.abs(above.volume - topCone) / topCone).toBeLessThan(VOLUME_TOLERANCE);
});

test('reports an error when the workplane misses the selection entirely', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'cone');
  await setWorkplane(page, [0, 100, 0], [0, 1, 0], [1, 0, 0]);

  await selectNode(page, id);
  await page.getByTestId('toolbar-workplane-split').click();

  await expect(page.locator('.ant-message')).toContainText('does not intersect');
  expect(await getNodeCount(page)).toBe(1);
});
