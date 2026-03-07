import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PrimitiveParams } from '../types/scene';
import { meshGeometryMap } from './meshGeometryMap';

export function buildGeometry(params: PrimitiveParams): THREE.BufferGeometry {
  switch (params.type) {
    case 'box':
      return new THREE.BoxGeometry(params.width, params.height, params.depth);
    case 'sphere':
      return new THREE.SphereGeometry(
        params.radius,
        params.widthSegments,
        params.heightSegments,
      );
    case 'cylinder':
      return new THREE.CylinderGeometry(
        params.radiusTop,
        params.radiusBottom,
        params.height,
        params.radialSegments,
      );
    case 'cone':
      return new THREE.ConeGeometry(
        params.radius,
        params.height,
        params.radialSegments,
      );
    case 'torus':
      return new THREE.TorusGeometry(
        params.radius,
        params.tube,
        params.radialSegments,
        params.tubularSegments,
      );
    case 'beerglass': {
      const rl   = params.radiusLower;
      const ru   = params.radiusUpper;
      const h    = params.height;
      const segs = params.radialSegments;
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      // Superfest profile — all proportions derived from real-glass measurements:
      //   base Ø ≈ 44 mm, rim Ø ≈ 57 mm, height 130 mm (250 ml / largest size).
      // The shape has three zones:
      //   1. Flat base disc  (horizontal segment → closed bottom when revolved)
      //   2. Nearly vertical lower body (slight ~2 % outward draft) up to ~43 % height
      //   3. S-curve shoulder at ~43–50 % that steps out to the widest point (rmax > ru)
      //   4. Upper body: near-vertical but gently narrows from rmax back down to ru at the rim
      const rmax = ru * 1.07; // shoulder is ~7 % wider than the rim
      const profile = [
        new THREE.Vector2(0,                        0),         // center bottom
        new THREE.Vector2(rl,                       0),         // base edge (flat disc)
        new THREE.Vector2(rl,                       h * 0.03),  // base wall
        new THREE.Vector2(rl * 1.01,                h * 0.35),  // lower body — nearly vertical
        new THREE.Vector2(lerp(rl, rmax, 0.40),     h * 0.42),  // shoulder curve begins
        new THREE.Vector2(rmax,                     h * 0.50),  // shoulder — widest point
        new THREE.Vector2(lerp(rmax, ru, 0.18),     h * 0.60),  // upper body, gentle inward taper
        new THREE.Vector2(lerp(rmax, ru, 0.45),     h * 0.73),  // mid upper body
        new THREE.Vector2(lerp(rmax, ru, 0.72),     h * 0.85),  // upper body
        new THREE.Vector2(lerp(rmax, ru, 0.93),     h * 0.95),  // near rim
        new THREE.Vector2(ru,                       h),          // rim
      ];
      const lathe  = new THREE.LatheGeometry(profile, segs);
      lathe.translate(0, -h / 2, 0);
      const topCap = new THREE.CircleGeometry(ru, segs);
      topCap.rotateX(-Math.PI / 2);
      topCap.translate(0, h / 2, 0);
      return mergeGeometries([lathe, topCap]) ?? new THREE.BufferGeometry();
    }
    case 'imported': {
      const geo = meshGeometryMap.get(params.meshId);
      if (!geo) {
        return new THREE.BufferGeometry();
      }
      return geo;
    }
  }
}
