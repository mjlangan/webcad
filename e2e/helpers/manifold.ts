/**
 * Counts edges that aren't shared by exactly two triangles — the definition of
 * a non-manifold ("open" or over-shared) edge — in a flat, non-indexed
 * triangle-soup position array: [x0,y0,z0, x1,y1,z1, x2,y2,z2, ...], 9 numbers
 * per triangle. This is exactly the shape STLLoader produces and geometryToStl
 * consumes, so it directly reflects what a slicer would see in the exported file.
 */
export function countNonManifoldEdges(positions: readonly number[], precision = 5): number {
  const key = (base: number) =>
    `${positions[base].toFixed(precision)},${positions[base + 1].toFixed(precision)},${positions[base + 2].toFixed(precision)}`;

  const edgeCounts = new Map<string, number>();
  const triangleCount = positions.length / 9;

  for (let t = 0; t < triangleCount; t++) {
    const base = t * 9;
    const vertKeys = [key(base), key(base + 3), key(base + 6)];
    for (let i = 0; i < 3; i++) {
      const a = vertKeys[i];
      const b = vertKeys[(i + 1) % 3];
      const edgeKey = a < b ? `${a}|${b}` : `${b}|${a}`;
      edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) ?? 0) + 1);
    }
  }

  let nonManifold = 0;
  for (const count of edgeCounts.values()) {
    if (count !== 2) nonManifold++;
  }
  return nonManifold;
}
