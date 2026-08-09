import type * as THREE from 'three';

/** Disposes a mesh/line material, correctly handling the multi-material
 *  (array) case Three.js allows even though nothing in this app assigns one. */
export function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((m) => m.dispose());
  } else {
    material.dispose();
  }
}
