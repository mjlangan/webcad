import { useEffect, useRef, type MutableRefObject } from 'react';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ThreeSetup } from './useThreeSetup';

export function useOrbitControls(
  threeRef: MutableRefObject<ThreeSetup | null>,
  onBeforeRenderRef: MutableRefObject<(() => void) | null>,
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

    // Configure mouse buttons: middle button for panning instead of zooming
    // ROTATE: left button (0), PAN: middle button (2), ZOOM: scroll wheel (no button needed)
    controls.mouseButtons.MIDDLE = 2; // PAN

    controlsRef.current = controls;
    onBeforeRenderRef.current = () => controls.update();

    return () => {
      controls.dispose();
      controlsRef.current = null;
      onBeforeRenderRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return controlsRef;
}
