import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ThreeSetup } from './useThreeSetup';
import type { CameraPreset, ViewportActions } from '../../types/viewport';

const TRANSITION_MS = 350;

const PRESETS: Record<
  CameraPreset,
  { direction: [number, number, number]; up: [number, number, number] }
> = {
  home:   { direction: [80,   80,  120], up: [0, 1,  0] },
  front:  { direction: [0,     0,    1], up: [0, 1,  0] },
  back:   { direction: [0,     0,   -1], up: [0, 1,  0] },
  left:   { direction: [-1,    0,    0], up: [0, 1,  0] },
  right:  { direction: [1,     0,    0], up: [0, 1,  0] },
  top:    { direction: [0,     1,    0], up: [0, 0, -1] },
  bottom: { direction: [0,    -1,    0], up: [0, 0,  1] },
};

// Ease-out cubic: fast start, gentle arrival
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function sceneBoundingSphere(three: ThreeSetup): THREE.Sphere {
  const box = new THREE.Box3();
  three.scene.traverseVisible((obj) => {
    if (obj instanceof THREE.Mesh) box.expandByObject(obj);
  });
  if (box.isEmpty()) return new THREE.Sphere(new THREE.Vector3(0, 0, 0), 50);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  return sphere;
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

        const { direction, up: targetUp } = PRESETS[preset];
        const { center, radius } = sceneBoundingSphere(three);

        // Distance to fit bounding sphere in the camera frustum (with 20% padding)
        const fovRad = three.camera.fov * (Math.PI / 180);
        const aspect = three.camera.aspect;
        const dist = (radius / (Math.tan(fovRad / 2) * Math.min(1, aspect))) * 1.2;

        const dir = new THREE.Vector3(...direction).normalize();
        const endPos    = center.clone().addScaledVector(dir, dist);
        const endTarget = center.clone();
        const endUp     = new THREE.Vector3(...targetUp);

        const startPos    = three.camera.position.clone();
        const startTarget = controls.target.clone();
        const startUp     = three.camera.up.clone();
        const startTime   = performance.now();

        onBeforeRenderRef.current = () => {
          const t = Math.min((performance.now() - startTime) / TRANSITION_MS, 1);
          const e = easeOut(t);

          three.camera.position.lerpVectors(startPos, endPos, e);
          three.camera.up.lerpVectors(startUp, endUp, e).normalize();
          controls.target.lerpVectors(startTarget, endTarget, e);
          three.camera.lookAt(controls.target);

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
