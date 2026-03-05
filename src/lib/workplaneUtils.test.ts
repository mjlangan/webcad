import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  computeTangentFrame,
  workplaneToThreePlane,
  workplaneSpawn,
  createWorkplaneFromHit,
} from './workplaneUtils';
import type { Workplane } from '../types/scene';
import { DEFAULT_WORKPLANE } from '../types/scene';

// Helpers

function vec(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

function wp(
  normal: [number, number, number],
  origin: [number, number, number] = [0, 0, 0],
  tangentX?: [number, number, number],
): Workplane {
  // If no tangentX provided, derive one so we have a valid Workplane
  if (!tangentX) {
    const { tangentX: tx } = computeTangentFrame(new THREE.Vector3(...normal));
    tangentX = tx.toArray() as [number, number, number];
  }
  return { origin, normal, tangentX };
}

// ── computeTangentFrame ────────────────────────────────────────────────────────

describe('computeTangentFrame', () => {
  it('result vectors are unit-length', () => {
    for (const normal of [vec(1,0,0), vec(0,1,0), vec(0,0,1), vec(0,-1,0), vec(1,1,0).normalize()]) {
      const { tangentX, tangentZ } = computeTangentFrame(normal);
      expect(tangentX.length()).toBeCloseTo(1, 5);
      expect(tangentZ.length()).toBeCloseTo(1, 5);
    }
  });

  it('tangentX and tangentZ are both perpendicular to the normal', () => {
    for (const normal of [vec(1,0,0), vec(0,1,0), vec(0,0,1), vec(0,-1,0)]) {
      const { tangentX, tangentZ } = computeTangentFrame(normal);
      expect(tangentX.dot(normal)).toBeCloseTo(0, 5);
      expect(tangentZ.dot(normal)).toBeCloseTo(0, 5);
    }
  });

  it('tangentX and tangentZ are perpendicular to each other', () => {
    const { tangentX, tangentZ } = computeTangentFrame(vec(1, 0, 0));
    expect(tangentX.dot(tangentZ)).toBeCloseTo(0, 5);
  });

  it('tangentX × tangentZ equals the normal (right-handed frame)', () => {
    for (const n of [vec(1,0,0), vec(0,1,0), vec(0,0,1), vec(0,-1,0)]) {
      const { tangentX, tangentZ } = computeTangentFrame(n);
      const cross = tangentX.clone().cross(tangentZ);
      expect(cross.x).toBeCloseTo(n.x, 5);
      expect(cross.y).toBeCloseTo(n.y, 5);
      expect(cross.z).toBeCloseTo(n.z, 5);
    }
  });

  it('normal = [0,1,0] triggers pole fallback → tangentX = [0,0,1]', () => {
    // |dot([0,1,0], worldUp)| = 1 > 0.999 → pole fallback, reference = worldX
    const { tangentX, tangentZ } = computeTangentFrame(vec(0, 1, 0));
    expect(tangentX.x).toBeCloseTo(0, 5);
    expect(tangentX.y).toBeCloseTo(0, 5);
    expect(tangentX.z).toBeCloseTo(1, 5);
    expect(tangentZ.x).toBeCloseTo(1, 5);
    expect(tangentZ.y).toBeCloseTo(0, 5);
    expect(tangentZ.z).toBeCloseTo(0, 5);
  });

  it('normal = [0,-1,0] triggers pole fallback', () => {
    // |dot([0,-1,0], worldUp)| = 1 > 0.999 → pole fallback
    const { tangentX, tangentZ } = computeTangentFrame(vec(0, -1, 0));
    // Vectors must still be perpendicular to normal and unit-length
    expect(tangentX.dot(vec(0, -1, 0))).toBeCloseTo(0, 5);
    expect(tangentX.length()).toBeCloseTo(1, 5);
    expect(tangentZ.length()).toBeCloseTo(1, 5);
  });

  it('normal = [1,0,0] uses world-up reference → tangentX = [0,0,-1]', () => {
    const { tangentX, tangentZ } = computeTangentFrame(vec(1, 0, 0));
    expect(tangentX.x).toBeCloseTo(0, 5);
    expect(tangentX.y).toBeCloseTo(0, 5);
    expect(tangentX.z).toBeCloseTo(-1, 5);
    expect(tangentZ.x).toBeCloseTo(0, 5);
    expect(tangentZ.y).toBeCloseTo(1, 5);
    expect(tangentZ.z).toBeCloseTo(0, 5);
  });

  it('normal = [0,0,1] uses world-up reference → tangentX = [1,0,0]', () => {
    const { tangentX, tangentZ } = computeTangentFrame(vec(0, 0, 1));
    expect(tangentX.x).toBeCloseTo(1, 5);
    expect(tangentX.y).toBeCloseTo(0, 5);
    expect(tangentX.z).toBeCloseTo(0, 5);
  });

  it('accepts an unnormalized normal and still returns unit vectors', () => {
    const { tangentX, tangentZ } = computeTangentFrame(vec(3, 0, 0)); // length=3, points along X
    expect(tangentX.length()).toBeCloseTo(1, 5);
    expect(tangentZ.length()).toBeCloseTo(1, 5);
    // Normalised normal is still [1,0,0], so results should match the unit-input case
    const ref = computeTangentFrame(vec(1, 0, 0));
    expect(tangentX.x).toBeCloseTo(ref.tangentX.x, 5);
    expect(tangentX.z).toBeCloseTo(ref.tangentX.z, 5);
  });
});

// ── workplaneToThreePlane ──────────────────────────────────────────────────────

describe('workplaneToThreePlane', () => {
  it('default workplane: origin is on the plane (distance = 0)', () => {
    const plane = workplaneToThreePlane(DEFAULT_WORKPLANE);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 0, 0))).toBeCloseTo(0, 5);
  });

  it('default workplane: positive Y is above the plane', () => {
    const plane = workplaneToThreePlane(DEFAULT_WORKPLANE);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 5, 0))).toBeCloseTo(5, 5);
  });

  it('default workplane: negative Y is below the plane', () => {
    const plane = workplaneToThreePlane(DEFAULT_WORKPLANE);
    expect(plane.distanceToPoint(new THREE.Vector3(0, -3, 0))).toBeCloseTo(-3, 5);
  });

  it('shifted workplane (origin at [0,10,0]): origin is on the plane', () => {
    const workplane = wp([0, 1, 0], [0, 10, 0]);
    const plane = workplaneToThreePlane(workplane);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 10, 0))).toBeCloseTo(0, 5);
  });

  it('shifted workplane (origin at [0,10,0]): world origin is below', () => {
    const workplane = wp([0, 1, 0], [0, 10, 0]);
    const plane = workplaneToThreePlane(workplane);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 0, 0))).toBeCloseTo(-10, 5);
  });

  it('vertical workplane (normal=[1,0,0], origin=[5,0,0]): correct distances', () => {
    const workplane = wp([1, 0, 0], [5, 0, 0]);
    const plane = workplaneToThreePlane(workplane);
    // Point on the plane
    expect(plane.distanceToPoint(new THREE.Vector3(5, 7, -3))).toBeCloseTo(0, 5);
    // Point 3 units in front
    expect(plane.distanceToPoint(new THREE.Vector3(8, 0, 0))).toBeCloseTo(3, 5);
    // Point 2 units behind
    expect(plane.distanceToPoint(new THREE.Vector3(3, 0, 0))).toBeCloseTo(-2, 5);
  });
});

// ── workplaneSpawn ─────────────────────────────────────────────────────────────

describe('workplaneSpawn', () => {
  it('default workplane with halfHeight=0: at origin, no rotation', () => {
    const { position, rotation } = workplaneSpawn(DEFAULT_WORKPLANE, 0);
    expect(position).toEqual([0, 0, 0]);
    expect(rotation).toEqual([0, 0, 0]);
  });

  it('default workplane: position.y equals halfHeight', () => {
    const { position, rotation } = workplaneSpawn(DEFAULT_WORKPLANE, 10);
    expect(position).toEqual([0, 10, 0]);
    expect(rotation).toEqual([0, 0, 0]);
  });

  it('does not produce -0 in rotation for the default workplane', () => {
    const { rotation } = workplaneSpawn(DEFAULT_WORKPLANE, 5);
    rotation.forEach((v) => expect(Object.is(v, -0)).toBe(false));
  });

  it('shifted default workplane (origin=[3,7,2]): position offset by halfHeight along Y', () => {
    const workplane = wp([0, 1, 0], [3, 7, 2]);
    const { position, rotation } = workplaneSpawn(workplane, 5);
    expect(position[0]).toBeCloseTo(3, 5);
    expect(position[1]).toBeCloseTo(12, 5); // 7 + 5
    expect(position[2]).toBeCloseTo(2, 5);
    expect(rotation).toEqual([0, 0, 0]);
  });

  it('vertical face (normal=[1,0,0], origin=[10,0,0]): position along X, rotation around Z by -π/2', () => {
    const workplane = wp([1, 0, 0], [10, 0, 0]);
    const { position, rotation } = workplaneSpawn(workplane, 3);
    // Position: origin + normal * halfHeight = [10+3, 0, 0]
    expect(position[0]).toBeCloseTo(13, 5);
    expect(position[1]).toBeCloseTo(0, 5);
    expect(position[2]).toBeCloseTo(0, 5);
    // Rotation: [0,1,0] → [1,0,0] = -90° around Z
    expect(rotation[0]).toBeCloseTo(0, 5);
    expect(rotation[1]).toBeCloseTo(0, 5);
    expect(rotation[2]).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('the rotation aligns local-Y with the workplane normal', () => {
    // For any workplane, applying the spawn rotation to world-Y should give the normal
    const workplanes: [number, number, number][] = [
      [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1],
    ];
    for (const normal of workplanes) {
      const workplane = wp(normal);
      const { rotation } = workplaneSpawn(workplane, 0);
      const euler = new THREE.Euler(...rotation);
      const localY = new THREE.Vector3(0, 1, 0).applyEuler(euler);
      expect(localY.x).toBeCloseTo(normal[0], 4);
      expect(localY.y).toBeCloseTo(normal[1], 4);
      expect(localY.z).toBeCloseTo(normal[2], 4);
    }
  });

  it('halfHeight=0 places the object exactly at the workplane origin', () => {
    const workplane = wp([0, 0, 1], [5, 3, 8]);
    const { position } = workplaneSpawn(workplane, 0);
    expect(position[0]).toBeCloseTo(5, 5);
    expect(position[1]).toBeCloseTo(3, 5);
    expect(position[2]).toBeCloseTo(8, 5);
  });
});

// ── createWorkplaneFromHit ─────────────────────────────────────────────────────

describe('createWorkplaneFromHit', () => {
  it('origin equals the hit point', () => {
    const hit = new THREE.Vector3(3, 7, -2);
    const result = createWorkplaneFromHit(hit, new THREE.Vector3(0, 1, 0));
    expect(result.origin[0]).toBeCloseTo(3, 5);
    expect(result.origin[1]).toBeCloseTo(7, 5);
    expect(result.origin[2]).toBeCloseTo(-2, 5);
  });

  it('normal is normalised and stored', () => {
    const hit = new THREE.Vector3(0, 0, 0);
    const result = createWorkplaneFromHit(hit, new THREE.Vector3(3, 0, 0)); // length=3
    expect(result.normal[0]).toBeCloseTo(1, 5);
    expect(result.normal[1]).toBeCloseTo(0, 5);
    expect(result.normal[2]).toBeCloseTo(0, 5);
  });

  it('tangentX is perpendicular to the normal', () => {
    const hit = new THREE.Vector3(0, 0, 0);
    for (const n of [[1,0,0],[0,1,0],[0,0,1]] as [number,number,number][]) {
      const result = createWorkplaneFromHit(hit, new THREE.Vector3(...n));
      const dot = result.tangentX[0]*result.normal[0]
                + result.tangentX[1]*result.normal[1]
                + result.tangentX[2]*result.normal[2];
      expect(dot).toBeCloseTo(0, 5);
    }
  });

  it('tangentX is a unit vector', () => {
    const hit = new THREE.Vector3(0, 0, 0);
    const result = createWorkplaneFromHit(hit, new THREE.Vector3(1, 0, 0));
    const len = Math.sqrt(result.tangentX.reduce((s, v) => s + v*v, 0));
    expect(len).toBeCloseTo(1, 5);
  });
});
