import { useEffect, type RefObject } from 'react';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ThreeSetup } from './useThreeSetup';
import { saveCameraView } from './lastCameraView';

/**
 * Captures the camera's position/target/up as the Viewport unmounts. Must be
 * called last among the Viewport's hooks — React runs effect cleanups in
 * reverse mount order, so a hook mounted last cleans up first, meaning this
 * fires before useThreeSetup's cleanup tears down the camera it's reading.
 */
export function useCameraViewPersistence(
  threeRef: RefObject<ThreeSetup | null>,
  orbitControlsRef: RefObject<OrbitControls | null>,
): void {
  useEffect(() => {
    return () => {
      const three = threeRef.current;
      const controls = orbitControlsRef.current;
      if (!three || !controls) return;
      saveCameraView({
        position: [three.camera.position.x, three.camera.position.y, three.camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
        up: [three.camera.up.x, three.camera.up.y, three.camera.up.z],
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
