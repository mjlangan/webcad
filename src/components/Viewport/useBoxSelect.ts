import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { ThreeSetup } from './useThreeSetup';
import { useSceneStore } from '../../store/useSceneStore';

export interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function useBoxSelect(
  threeRef: RefObject<ThreeSetup | null>,
  meshMapRef: RefObject<Map<string, THREE.Mesh>>,
  isDraggingRef: RefObject<boolean>,
): BoxRect | null {
  const [boxRect, setBoxRect] = useState<BoxRect | null>(null);
  const startClientRef = useRef<{ x: number; y: number } | null>(null);
  const isBoxSelectingRef = useRef(false);

  useEffect(() => {
    if (!threeRef.current) return;
    const { camera, renderer } = threeRef.current;
    const canvas = renderer.domElement;

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      if (!e.shiftKey) return; // Only start box select when Shift is held
      startClientRef.current = { x: e.clientX, y: e.clientY };
      isBoxSelectingRef.current = false;
    }

    function onPointerMove(e: PointerEvent) {
      if (!startClientRef.current) return;
      if (isDraggingRef.current) return; // TC is active — don't start box select

      const dx = e.clientX - startClientRef.current.x;
      const dy = e.clientY - startClientRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) < 4) return;

      isBoxSelectingRef.current = true;
      const rect = canvas.getBoundingClientRect();
      const x1 = startClientRef.current.x - rect.left;
      const y1 = startClientRef.current.y - rect.top;
      const x2 = e.clientX - rect.left;
      const y2 = e.clientY - rect.top;
      setBoxRect({
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1),
      });
    }

    function onPointerUp(e: PointerEvent) {
      if (!isBoxSelectingRef.current) {
        startClientRef.current = null;
        return;
      }

      const start = startClientRef.current;
      startClientRef.current = null;
      isBoxSelectingRef.current = false;
      setBoxRect(null);

      if (!start) return;

      const rect = canvas.getBoundingClientRect();
      // Box in canvas-local pixels
      const x1 = Math.min(start.x, e.clientX) - rect.left;
      const y1 = Math.min(start.y, e.clientY) - rect.top;
      const x2 = Math.max(start.x, e.clientX) - rect.left;
      const y2 = Math.max(start.y, e.clientY) - rect.top;

      if (x2 - x1 < 2 || y2 - y1 < 2) return; // too small

      // Project each mesh's world-space center to canvas-local pixels
      const meshes = meshMapRef.current;
      const selectedIds: string[] = [];
      const worldPos = new THREE.Vector3();

      meshes.forEach((mesh) => {
        if (!mesh.visible) return;
        mesh.geometry.computeBoundingSphere();
        const sphere = mesh.geometry.boundingSphere;
        if (!sphere) return;
        worldPos.copy(sphere.center).applyMatrix4(mesh.matrixWorld);

        // Project to NDC then to canvas pixels
        worldPos.project(camera);
        const px = (worldPos.x * 0.5 + 0.5) * rect.width;
        const py = (-worldPos.y * 0.5 + 0.5) * rect.height;

        // Behind camera check
        if (worldPos.z > 1) return;

        if (px >= x1 && px <= x2 && py >= y1 && py <= y2) {
          const nodeId = mesh.userData.nodeId as string;
          if (nodeId) selectedIds.push(nodeId);
        }
      });

      useSceneStore.getState().selectNodes(selectedIds);
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    // pointerup on window in case pointer leaves canvas during drag
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return boxRect;
}
