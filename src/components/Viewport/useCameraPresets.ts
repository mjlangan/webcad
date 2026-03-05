import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ThreeSetup } from './useThreeSetup';
import type { CameraPreset, ViewportActions } from '../../types/viewport';

const ORIGIN = new THREE.Vector3(0, 0, 0);
const TRANSITION_MS = 350;

const PRESETS: Record<
  CameraPreset,
  { position: [number, number, number]; up: [number, number, number] }
> = {
  home:   { position: [80,   80,  120], up: [0, 1,  0] },
  front:  { position: [0,     0,  140], up: [0, 1,  0] },
  back:   { position: [0,     0, -140], up: [0, 1,  0] },
  left:   { position: [-140,  0,    0], up: [0, 1,  0] },
  right:  { position: [140,   0,    0], up: [0, 1,  0] },
  top:    { position: [0,   140,    0], up: [0, 0, -1] },
  bottom: { position: [0,  -140,    0], up: [0, 0,  1] },
};

// Ease-out cubic: fast start, gentle arrival
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function useCameraPresets(
  threeRef: RefObject<ThreeSetup | null>,
  orbitControlsRef: RefObject<OrbitControls | null>,
  actionsRef: RefObject<ViewportActions | null>,
  onBeforeRenderRef: RefObject<(() => void) | null>,
): void {
  useEffect(() => {
    actionsRef.current = {
      setPreset: (preset: CameraPreset) => {
        const three = threeRef.current;
        const controls = orbitControlsRef.current;
        if (!three || !controls) return;

        const { position: targetPos, up: targetUp } = PRESETS[preset];

        const startPos  = three.camera.position.clone();
        const startUp   = three.camera.up.clone();
        const endPos    = new THREE.Vector3(...targetPos);
        const endUp     = new THREE.Vector3(...targetUp);
        const startTime = performance.now();

        onBeforeRenderRef.current = () => {
          const t = Math.min((performance.now() - startTime) / TRANSITION_MS, 1);
          const e = easeOut(t);

          three.camera.position.lerpVectors(startPos, endPos, e);
          three.camera.up.lerpVectors(startUp, endUp, e).normalize();
          three.camera.lookAt(ORIGIN);
          controls.target.copy(ORIGIN);

          if (t >= 1) {
            onBeforeRenderRef.current = () => controls.update();
            controls.update();
          }
        };
      },
    };

    return () => {
      actionsRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
