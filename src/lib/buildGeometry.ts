import * as THREE from 'three';
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
    case 'imported': {
      const geo = meshGeometryMap.get(params.meshId);
      if (!geo) {
        return new THREE.BufferGeometry();
      }
      return geo;
    }
  }
}
