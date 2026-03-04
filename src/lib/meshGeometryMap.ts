import type * as THREE from 'three';

// Module-level map from meshId to imported BufferGeometry.
// These geometries are session resources and must NOT be disposed when
// a node is removed from the scene — only when the browser tab is closed.
export const meshGeometryMap = new Map<string, THREE.BufferGeometry>();
