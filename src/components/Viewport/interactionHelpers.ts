import type { RefObject } from 'react';
import * as THREE from 'three';

/** Constructs a fresh Raycaster + reusable NDC pointer Vector2 for a pointer-driven interaction hook. */
export function createPointerRaycaster(): { raycaster: THREE.Raycaster; pointer: THREE.Vector2 } {
  return { raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2() };
}

/** Returns the currently-visible meshes tracked in meshMapRef, safe to call even before it's populated. */
export function getVisibleMeshes(meshMapRef: RefObject<Map<string, THREE.Mesh> | null>): THREE.Mesh[] {
  return Array.from(meshMapRef.current?.values() ?? []).filter((m) => m.visible);
}

/**
 * Tracks and restores a single hovered mesh's emissive color for hover-preview
 * highlighting (used by workplane placement and face-align pointer modes).
 */
export function makeHoverHighlighter(
  hoveredMeshRef: RefObject<THREE.Mesh | null>,
  savedEmissiveRef: RefObject<THREE.Color | null>,
  emissiveHex: number,
): { clear: () => void; setHover: (mesh: THREE.Mesh) => void } {
  const clear = () => {
    if (hoveredMeshRef.current && savedEmissiveRef.current) {
      const mat = hoveredMeshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissive.copy(savedEmissiveRef.current);
      hoveredMeshRef.current = null;
      savedEmissiveRef.current = null;
    }
  };

  const setHover = (mesh: THREE.Mesh) => {
    if (hoveredMeshRef.current === mesh) return;
    clear();
    const mat = mesh.material as THREE.MeshStandardMaterial;
    savedEmissiveRef.current = mat.emissive.clone();
    mat.emissive.set(emissiveHex);
    hoveredMeshRef.current = mesh;
  };

  return { clear, setHover };
}

export interface GhostPlaneOptions {
  width: number;
  height: number;
  color: number;
  opacity: number;
  depthWrite?: boolean;
  renderOrder?: number;
}

/** Builds a hidden, non-pickable preview plane mesh for a pointer-hover mode. Caller adds it to the scene and disposes it on cleanup. */
export function createHelperGhostPlane(opts: GhostPlaneOptions): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(opts.width, opts.height);
  const material = new THREE.MeshBasicMaterial({
    color: opts.color,
    transparent: true,
    opacity: opts.opacity,
    side: THREE.DoubleSide,
    depthWrite: opts.depthWrite,
  });
  const plane = new THREE.Mesh(geometry, material);
  plane.visible = false;
  plane.userData.isHelper = true;
  if (opts.renderOrder !== undefined) plane.renderOrder = opts.renderOrder;
  return plane;
}
