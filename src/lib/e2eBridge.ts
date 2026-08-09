import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useSceneStore } from '../store/useSceneStore';
import { worldToPagePx } from './screenProjection';

export interface E2EThreeSetup {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export interface E2ERotateMarker {
  angleDeg: number;
  x: number;
  y: number;
}

export interface E2EBridge {
  store: typeof useSceneStore;
  three: E2EThreeSetup | null;
  /** The live OrbitControls instance. Its `target` must be kept in sync with
   *  any manual camera repositioning — its per-frame `update()` call (wired
   *  into the render loop) re-derives the camera's look direction from this
   *  target every frame, silently overriding a one-off `camera.lookAt()`. */
  controls: OrbitControls | null;
  /** Populated only while a rotate-mode gizmo drag is in progress; null otherwise. */
  rotateMarkers: E2ERotateMarker[] | null;
  /** World point (plain numbers so it's JSON-serializable across page.evaluate) -> page px, or null if not ready. */
  worldToPagePx: (x: number, y: number, z: number) => { x: number; y: number } | null;
}

declare global {
  interface Window {
    __E2E__?: E2EBridge;
  }
}

/**
 * Installs a test-only bridge on window, exposing the scene store and three.js
 * setup for Playwright to drive/assert against directly instead of scraping
 * formatted DOM text or re-deriving the app's own camera-projection math.
 * Only active when built with `--mode e2e` (see .env.e2e); the guard is a
 * literal import.meta.env check so this whole module is dead-code-eliminated
 * from the real production bundle.
 */
export function installE2EBridge(): void {
  if (!import.meta.env.VITE_E2E) return;
  window.__E2E__ = {
    store: useSceneStore,
    three: null,
    controls: null,
    rotateMarkers: null,
    worldToPagePx: (x, y, z) => {
      const three = window.__E2E__?.three;
      if (!three) return null;
      return worldToPagePx(new THREE.Vector3(x, y, z), three.camera, three.renderer.domElement);
    },
  };
}
