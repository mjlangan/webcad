import * as THREE from 'three';
import Module from 'manifold-3d';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';

let wasmPromise: Promise<ManifoldToplevel> | null = null;

/** Lazily loads and initializes the manifold-3d WASM module (once per worker realm). */
export function getManifoldWasm(): Promise<ManifoldToplevel> {
  if (!wasmPromise) {
    wasmPromise = Module().then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return wasmPromise;
}

/**
 * Converts a THREE.BufferGeometry into a Manifold. Non-indexed geometry (e.g.
 * parsed from STL) is a "triangle soup" — every triangle corner is its own
 * vertex, even where it's positionally coincident with corners of adjacent
 * triangles. mesh.merge() welds those coincident positions (within tolerance)
 * so the result is recognized as an actual watertight solid rather than being
 * rejected as non-manifold.
 */
export function geometryToManifold(wasm: ManifoldToplevel, geometry: THREE.BufferGeometry): Manifold {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = geo.getAttribute('position') as THREE.BufferAttribute;
  const vertProperties = new Float32Array(position.array as Float32Array);
  const triVerts = new Uint32Array(position.count);
  for (let i = 0; i < position.count; i++) triVerts[i] = i;

  const mesh = new wasm.Mesh({ numProp: 3, vertProperties, triVerts });
  mesh.merge();
  const manifold = new wasm.Manifold(mesh);
  if (geo !== geometry) geo.dispose();
  return manifold;
}

export function manifoldToGeometry(manifold: Manifold): THREE.BufferGeometry {
  const mesh = manifold.getMesh();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.vertProperties, mesh.numProp));
  geo.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
  return geo;
}
