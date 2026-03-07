import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { ThreeSetup } from './useThreeSetup';
import { useSceneStore } from '../../store/useSceneStore';

export function useRaycasting(
  threeRef: RefObject<ThreeSetup | null>,
  meshMapRef: RefObject<Map<string, THREE.Mesh>>,
  isDraggingRef: RefObject<boolean>,
): void {
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!threeRef.current) return;
    const { camera, renderer } = threeRef.current;
    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function onPointerDown(e: PointerEvent) {
      pointerDownPos.current = { x: e.clientX, y: e.clientY };
    }

    function onPointerUp(e: PointerEvent) {
      if (!pointerDownPos.current) return;
      const dx = e.clientX - pointerDownPos.current.x;
      const dy = e.clientY - pointerDownPos.current.y;
      pointerDownPos.current = null;

      // Ignore drags (>4px) and active TC drags
      if (Math.sqrt(dx * dx + dy * dy) > 4) return;
      if (isDraggingRef.current) return;

      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const meshes = Array.from(meshMapRef.current.values()).filter((m) => m.visible);
      const hits = raycaster.intersectObjects(meshes, false);

      if (hits.length > 0) {
        const nodeId = hits[0].object.userData.nodeId as string;
        if (e.shiftKey) {
          useSceneStore.getState().toggleNodeSelection(nodeId);
        } else {
          useSceneStore.getState().selectNode(nodeId);
        }
      } else if (!e.shiftKey) {
        useSceneStore.getState().clearSelection();
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    // pointerup on window: TransformControls may call stopPropagation on the canvas
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
