import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import type { PrimitiveParams } from '../types/scene';
import { meshGeometryMap } from './meshGeometryMap';

export function buildGeometry(params: PrimitiveParams): THREE.BufferGeometry {
  switch (params.type) {
    case 'box': {
      const geo = new THREE.BoxGeometry(params.width, params.height, params.depth);
      geo.translate(0, params.height / 2, 0);
      return geo;
    }
    case 'sphere': {
      const geo = new THREE.SphereGeometry(
        params.radius,
        params.widthSegments,
        params.heightSegments,
      );
      geo.translate(0, params.radius, 0);
      return geo;
    }
    case 'cylinder': {
      const geo = new THREE.CylinderGeometry(
        params.radiusTop,
        params.radiusBottom,
        params.height,
        params.radialSegments,
      );
      geo.translate(0, params.height / 2, 0);
      return geo;
    }
    case 'cone': {
      const geo = new THREE.ConeGeometry(
        params.radius,
        params.height,
        params.radialSegments,
      );
      geo.translate(0, params.height / 2, 0);
      return geo;
    }
    case 'torus': {
      const geo = new THREE.TorusGeometry(
        params.radius,
        params.tube,
        params.radialSegments,
        params.tubularSegments,
      );
      geo.rotateX(Math.PI / 2);  // lay flat (ring in XZ plane, hole along Y)
      geo.translate(0, params.tube, 0);
      return geo;
    }
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
      const topCap = new THREE.CircleGeometry(ru, segs);
      topCap.rotateX(-Math.PI / 2);
      topCap.translate(0, h, 0);
      return mergeGeometries([lathe, topCap]) ?? new THREE.BufferGeometry();
    }
    case 'wedge': {
      const { width: w, depth: d, height: h } = params;
      const points = [
        new THREE.Vector3(-w / 2, 0, -d / 2),
        new THREE.Vector3(w / 2, 0, -d / 2),
        new THREE.Vector3(-w / 2, 0, d / 2),
        new THREE.Vector3(w / 2, 0, d / 2),
        new THREE.Vector3(-w / 2, h, -d / 2),
        new THREE.Vector3(w / 2, h, -d / 2),
      ];
      return new ConvexGeometry(points);
    }
    case 'roof': {
      const { width: w, depth: d, height: h } = params;
      const points = [
        new THREE.Vector3(-w / 2, 0, -d / 2),
        new THREE.Vector3(w / 2, 0, -d / 2),
        new THREE.Vector3(-w / 2, 0, d / 2),
        new THREE.Vector3(w / 2, 0, d / 2),
        new THREE.Vector3(-w / 2, h, 0),
        new THREE.Vector3(w / 2, h, 0),
      ];
      return new ConvexGeometry(points);
    }
    case 'pyramid': {
      const { width: w, depth: d, height: h } = params;
      const points = [
        new THREE.Vector3(-w / 2, 0, -d / 2),
        new THREE.Vector3(w / 2, 0, -d / 2),
        new THREE.Vector3(-w / 2, 0, d / 2),
        new THREE.Vector3(w / 2, 0, d / 2),
        new THREE.Vector3(0, h, 0),
      ];
      return new ConvexGeometry(points);
    }
    case 'tube': {
      const outerShape = new THREE.Shape();
      outerShape.absarc(0, 0, params.outerRadius, 0, Math.PI * 2, false);
      const innerHole = new THREE.Path();
      innerHole.absarc(0, 0, params.innerRadius, 0, Math.PI * 2, true);
      outerShape.holes.push(innerHole);
      const geo = new THREE.ExtrudeGeometry(outerShape, {
        depth: params.height,
        bevelEnabled: false,
        curveSegments: params.radialSegments,
      });
      // Extrusion runs along +Z by default; rotate it onto +Y (up), bottom-aligned at y=0.
      geo.rotateX(-Math.PI / 2);
      return geo;
    }
    case 'dome': {
      // thetaLength = PI/2 keeps only the upper half (pole at y=radius down to the
      // equator at y=0) — already bottom-aligned, no translate needed.
      const shell = new THREE.SphereGeometry(
        params.radius,
        params.widthSegments,
        params.heightSegments,
        0, Math.PI * 2,
        0, Math.PI / 2,
      );
      const cap = new THREE.CircleGeometry(params.radius, params.widthSegments);
      cap.rotateX(Math.PI / 2); // face the cap downward to close the open equator
      return mergeGeometries([shell, cap]) ?? new THREE.BufferGeometry();
    }
    case 'polygon': {
      const geo = new THREE.CylinderGeometry(
        params.radius,
        params.radius,
        params.height,
        params.sides,
      );
      geo.translate(0, params.height / 2, 0);
      return geo;
    }
    case 'ellipsoid': {
      const geo = new THREE.SphereGeometry(1, params.widthSegments, params.heightSegments);
      geo.scale(params.radiusX, params.radiusY, params.radiusZ);
      geo.translate(0, params.radiusY, 0);
      return geo;
    }
    case 'capsule': {
      const geo = new THREE.CapsuleGeometry(
        params.radius,
        params.length,
        params.capSegments,
        params.radialSegments,
      );
      geo.translate(0, params.radius + params.length / 2, 0);
      return geo;
    }
    case 'torusknot': {
      const geo = new THREE.TorusKnotGeometry(
        params.radius,
        params.tube,
        params.tubularSegments,
        params.radialSegments,
        params.p,
        params.q,
      );
      // Unlike the other shapes, a torus knot's vertical extent isn't a clean
      // function of its params (depends on the p/q winding), so bottom-align
      // by measuring the actual bounding box instead of a formula.
      geo.computeBoundingBox();
      geo.translate(0, -geo.boundingBox!.min.y, 0);
      return geo;
    }
    case 'imported': {
      const geo = meshGeometryMap.get(params.meshId);
      if (!geo) {
        return new THREE.BufferGeometry();
      }
      return geo;
    }
    case 'group': {
      // Group nodes have no geometry; an empty BufferGeometry is used as a
      // placeholder so the TransformControls gizmo can attach to the node.
      return new THREE.BufferGeometry();
    }
  }
}
