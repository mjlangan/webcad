import { useEffect, useRef, type MutableRefObject } from 'react';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ThreeSetup } from './useThreeSetup';

export function useOrbitControls(
  threeRef: MutableRefObject<ThreeSetup | null>,
  onBeforeRender: MutableRefObject<(() => void) | null>,
): MutableRefObject<OrbitControls | null> {
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    if (!threeRef.current) return;
    const { camera, renderer } = threeRef.current;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1;
    controls.maxDistance = 2000;

    controlsRef.current = controls;
    onBeforeRender.current = () => controls.update();

    return () => {
      controls.dispose();
      controlsRef.current = null;
      onBeforeRender.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return controlsRef;
}
