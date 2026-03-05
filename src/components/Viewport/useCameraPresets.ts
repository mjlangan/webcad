import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ThreeSetup } from './useThreeSetup';
import type { CameraPreset, ViewportActions } from '../../types/viewport';

const ORIGIN = new THREE.Vector3(0, 0, 0);

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

export function useCameraPresets(
  threeRef: RefObject<ThreeSetup | null>,
  orbitControlsRef: RefObject<OrbitControls | null>,
  actionsRef: RefObject<ViewportActions | null>,
): void {
  useEffect(() => {
    actionsRef.current = {
      setPreset: (preset: CameraPreset) => {
        const three = threeRef.current;
        const controls = orbitControlsRef.current;
        if (!three || !controls) return;

        const { position, up } = PRESETS[preset];
        three.camera.position.set(...position);
        three.camera.up.set(...up);
        controls.target.copy(ORIGIN);
        controls.update();
      },
    };

    return () => {
      actionsRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
