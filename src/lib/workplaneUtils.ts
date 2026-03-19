import * as THREE from 'three';
import type { Workplane } from '../types/scene';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_X = new THREE.Vector3(1, 0, 0);
const POLE_THRESHOLD = 0.999;

/**
 * Computes a tangent frame for a workplane given a normal vector.
 * 
 * The tangent frame defines the workplane's local X and Z axes:
 * - tangentX = cross(normal, worldUp) [or worldZ when near pole]
 * - tangentZ = cross(normal, tangentX)
 * 
 * When the normal is nearly parallel to world +Y or -Y (|dot(normal, worldUp)| > 0.999),
 * we use world X as the reference vector instead to avoid singularities.
 * 
 * @param normal - The workplane normal vector (does not need to be normalized)
 * @returns Object with tangentX and tangentZ as Vector3
 */
export function computeTangentFrame(normal: THREE.Vector3): {
  tangentX: THREE.Vector3;
  tangentZ: THREE.Vector3;
} {
  const n = normal.clone().normalize();
  
  // Check if we're near the pole (normal nearly parallel to world Y)
  const dotUp = Math.abs(n.dot(WORLD_UP));
  const nearPole = dotUp > POLE_THRESHOLD;
  
  // Choose reference vector: world up normally, world X when near pole
  const reference = nearPole ? WORLD_X : WORLD_UP;
  
  // Compute tangentX perpendicular to both normal and reference
  const tangentX = new THREE.Vector3()
    .crossVectors(reference, n)
    .normalize();
  
  // Compute tangentZ perpendicular to both normal and tangentX
  const tangentZ = new THREE.Vector3()
    .crossVectors(n, tangentX)
    .normalize();
  
  return { tangentX, tangentZ };
}

/**
 * Converts a Workplane to a THREE.Plane for raycasting and other operations.
 */
export function workplaneToThreePlane(workplane: Workplane): THREE.Plane {
  const normal = new THREE.Vector3(...workplane.normal);
  const origin = new THREE.Vector3(...workplane.origin);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
}

/**
 * Computes the spawn position and rotation for a new object placed on a workplane.
 *
 * The object is positioned at the workplane origin offset by halfHeight along the
 * workplane normal, and rotated so that its local Y axis aligns with the normal.
 *
 * @param workplane - The active workplane
 * @param halfHeight - The half-height of the object's bounding box in its local Y direction
 */
export function workplaneSpawn(
  workplane: Workplane,
  halfHeight: number,
): { position: [number, number, number]; rotation: [number, number, number] } {
  const normal = new THREE.Vector3(...workplane.normal).normalize();
  const origin = new THREE.Vector3(...workplane.origin);

  const position = origin.clone().addScaledVector(normal, halfHeight);

  // Rotate local Y to align with workplane normal
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    normal,
  );
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  // Normalize -0 to 0 to avoid confusing assertions and serialization
  const r = (v: number) => (Object.is(v, -0) ? 0 : v);

  return {
    position: position.toArray() as [number, number, number],
    rotation: [r(e.x), r(e.y), r(e.z)],
  };
}

/**
 * Creates a Workplane from a surface hit point and normal.
 * Computes the tangent frame automatically.
 */
export function createWorkplaneFromHit(
  hitPoint: THREE.Vector3,
  normal: THREE.Vector3,
): Workplane {
  const { tangentX } = computeTangentFrame(normal);

  return {
    origin: hitPoint.toArray(),
    normal: normal.clone().normalize().toArray(),
    tangentX: tangentX.toArray(),
  };
}

/**
 * Decomposes the workplane origin into components along the given axes.
 * Global mode: returns the raw world-space origin [x, y, z].
 * Local mode: returns the origin projected onto [tangentX, normal, tangentZ].
 */
export function decomposeWorkplaneOrigin(
  workplane: Workplane,
  mode: 'global' | 'local',
): [number, number, number] {
  const origin = new THREE.Vector3(...workplane.origin);
  if (mode === 'global') {
    return origin.toArray() as [number, number, number];
  }
  const tx = new THREE.Vector3(...workplane.tangentX);
  const n = new THREE.Vector3(...workplane.normal);
  const tz = new THREE.Vector3().crossVectors(n, tx);
  return [origin.dot(tx), origin.dot(n), origin.dot(tz)];
}

/**
 * Returns a new Workplane with its origin moved to the given values in the
 * specified reference frame, keeping normal and tangentX unchanged.
 * Global mode: values are the new world-space origin directly.
 * Local mode: values are components along [tangentX, normal, tangentZ]; the
 *   new world origin is reconstructed as localX·tangentX + localN·normal + localZ·tangentZ.
 */
export function recomposeWorkplaneOrigin(
  workplane: Workplane,
  values: [number, number, number],
  mode: 'global' | 'local',
): Workplane {
  let newOrigin: THREE.Vector3;
  if (mode === 'global') {
    newOrigin = new THREE.Vector3(...values);
  } else {
    const tx = new THREE.Vector3(...workplane.tangentX);
    const n = new THREE.Vector3(...workplane.normal);
    const tz = new THREE.Vector3().crossVectors(n, tx);
    newOrigin = tx.clone().multiplyScalar(values[0])
      .addScaledVector(n, values[1])
      .addScaledVector(tz, values[2]);
  }
  return { ...workplane, origin: newOrigin.toArray() as [number, number, number] };
}
