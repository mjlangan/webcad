import type { PrimitiveParams, SceneNode } from '../types/scene';

// Shape types whose own dimension params can absorb a non-uniform axis scale
// (see applyAxisScaleToGeometry). Kept in sync with that function's switch —
// scaleToGeometry.test.ts asserts every type here returns non-null and every
// type not here returns null, so the two can't silently drift apart.
const DIRECT_DIMENSION_SCALE_TYPES = new Set<PrimitiveParams['type']>([
  'box', 'cylinder', 'cone', 'torus', 'beerglass',
  'wedge', 'roof', 'pyramid', 'tube', 'polygon',
  'ellipsoid', 'capsule',
]);

/** True if this shape type's own params can represent a resize directly (see applyAxisScaleToGeometry). */
export function hasDirectDimensionScale(type: PrimitiveParams['type']): boolean {
  return DIRECT_DIMENSION_SCALE_TYPES.has(type);
}

const MIN_DIM = 0.01;
const clampPositive = (v: number): number => Math.max(MIN_DIM, v);
const clampNonNegative = (v: number): number => Math.max(0, v);

/**
 * Picks whichever of two axis factors deviates further from 1 — used for
 * shapes with a single radius shared between X and Z. A drag typically only
 * moves one axis handle at a time (the other factor stays exactly 1), so this
 * makes the radius track the axis the user actually dragged, rather than
 * averaging it down with the untouched axis.
 */
function dominantFactor(a: number, b: number): number {
  return Math.abs(a - 1) >= Math.abs(b - 1) ? a : b;
}

/**
 * Applies a per-axis scale factor directly to a shape's own dimension params,
 * instead of a separate transform.scale multiplier — the TinkerCAD/SketchUp
 * model: resizing edits the shape's real dimensions, so the Properties panel
 * never shows a stale nominal value after a non-uniform scale.
 *
 * Returns null for shapes with no clean 1:1 (or tied-pair) mapping from X/Y/Z
 * to a dimension param — sphere and dome only have a single uniform radius
 * (no ellipsoid-style per-axis fields), torusknot's shape is a function of
 * radius/tube/p/q together with no separate "height", and group/imported
 * nodes have no parametric dimensions at all. Those keep using transform.scale.
 */
export function applyAxisScaleToGeometry(
  geometry: PrimitiveParams,
  factors: [number, number, number],
): PrimitiveParams | null {
  const [sx, sy, sz] = factors;
  const radial = dominantFactor(sx, sz);

  switch (geometry.type) {
    case 'box':
      return { ...geometry, width: clampPositive(geometry.width * sx), height: clampPositive(geometry.height * sy), depth: clampPositive(geometry.depth * sz) };
    case 'wedge':
    case 'roof':
    case 'pyramid':
      return { ...geometry, width: clampPositive(geometry.width * sx), height: clampPositive(geometry.height * sy), depth: clampPositive(geometry.depth * sz) };
    case 'cylinder':
      return { ...geometry, radius: clampPositive(geometry.radius * radial), height: clampPositive(geometry.height * sy) };
    case 'cone':
      return {
        ...geometry,
        radiusTop: clampNonNegative(geometry.radiusTop * radial),
        radiusBottom: clampPositive(geometry.radiusBottom * radial),
        height: clampPositive(geometry.height * sy),
      };
    case 'torus':
      return { ...geometry, radius: clampPositive(geometry.radius * radial), tube: clampPositive(geometry.tube * sy) };
    case 'beerglass':
      return {
        ...geometry,
        radiusUpper: clampPositive(geometry.radiusUpper * radial),
        radiusLower: clampPositive(geometry.radiusLower * radial),
        height: clampPositive(geometry.height * sy),
      };
    case 'tube':
      return {
        ...geometry,
        outerRadius: clampPositive(geometry.outerRadius * radial),
        innerRadius: clampNonNegative(geometry.innerRadius * radial),
        height: clampPositive(geometry.height * sy),
      };
    case 'polygon':
      return { ...geometry, radius: clampPositive(geometry.radius * radial), height: clampPositive(geometry.height * sy) };
    case 'ellipsoid':
      return { ...geometry, radiusX: clampPositive(geometry.radiusX * sx), radiusY: clampPositive(geometry.radiusY * sy), radiusZ: clampPositive(geometry.radiusZ * sz) };
    case 'capsule':
      return { ...geometry, radius: clampPositive(geometry.radius * radial), length: clampNonNegative(geometry.length * sy) };
    default:
      return null;
  }
}

/**
 * One-time migration for scenes loaded from disk: if a node was saved with a
 * non-identity scale on a shape that now supports direct dimension scaling,
 * bake that scale into its params and reset transform.scale to identity, so
 * the "mapped shapes never carry a separate scale multiplier" invariant holds
 * for scenes saved before this existed too, not just freshly-scaled ones.
 */
export function bakeScaleIntoDimensions(node: SceneNode): SceneNode {
  const [sx, sy, sz] = node.transform.scale;
  if (sx === 1 && sy === 1 && sz === 1) return node;

  const bakedGeometry = applyAxisScaleToGeometry(node.geometry, [sx, sy, sz]);
  if (!bakedGeometry) return node;

  return {
    ...node,
    geometry: bakedGeometry,
    transform: { ...node.transform, scale: [1, 1, 1] },
  };
}
