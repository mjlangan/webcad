import { useEffect, useRef, type RefObject } from 'react';
import { MOUSE } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ThreeSetup } from './useThreeSetup';

export function useOrbitControls(
  threeRef: RefObject<ThreeSetup | null>,
  onBeforeRenderRef: RefObject<(() => void) | null>,
): RefObject<OrbitControls | null> {
  const controlsRef = useRef<OrbitControls | null>(null);
  const isShiftHeldRef = useRef(false);

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

    // Disable left-button rotation when Shift is held (for box select)
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Shift') {
        isShiftHeldRef.current = true;
        controls.mouseButtons.LEFT = null; // Disable left-button rotation
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Shift') {
        isShiftHeldRef.current = false;
        controls.mouseButtons.LEFT = MOUSE.ROTATE; // Re-enable left-button rotation
      }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    controlsRef.current = controls;
    onBeforeRenderRef.current = () => controls.update();

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      controls.dispose();
      controlsRef.current = null;
      onBeforeRenderRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return controlsRef;
}
