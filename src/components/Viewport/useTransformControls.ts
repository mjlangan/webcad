import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ThreeSetup } from './useThreeSetup';
import { useSceneStore } from '../../store/useSceneStore';

export function useTransformControls(
  threeRef: MutableRefObject<ThreeSetup | null>,
  meshMapRef: MutableRefObject<Map<string, THREE.Mesh>>,
  orbitControlsRef: MutableRefObject<OrbitControls | null>,
): MutableRefObject<boolean> {
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!threeRef.current) return;
    const { scene, camera, renderer } = threeRef.current;

    const tc = new TransformControls(camera, renderer.domElement);
    tc.setMode('translate');
    // In Three.js r162+, TransformControls extends Controls (not Object3D).
    // Add the visual helper to the scene; the controls object itself is not an Object3D.
    const tcHelper = tc.getHelper();
    scene.add(tcHelper);

    // Disable OrbitControls while dragging; write transform back to store on release
    const onDraggingChanged = (event: { value: unknown }) => {
      const dragging = event.value as boolean;
      isDraggingRef.current = dragging;
      if (orbitControlsRef.current) {
        orbitControlsRef.current.enabled = !dragging;
      }

      if (!dragging && tc.object) {
        const obj = tc.object;
        const nodeId = obj.userData.nodeId as string;
        useSceneStore.getState().updateTransform(nodeId, {
          position: obj.position.toArray() as [number, number, number],
          rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
          scale: obj.scale.toArray() as [number, number, number],
        });
      }
    };

    tc.addEventListener('dragging-changed', onDraggingChanged);

    // Attach/detach when selectedId changes
    const unsubscribe = useSceneStore.subscribe((state) => {
      const mesh = state.selectedId ? meshMapRef.current.get(state.selectedId) : undefined;
      if (mesh) {
        tc.attach(mesh);
      } else {
        tc.detach();
      }
    });

    return () => {
      tc.removeEventListener('dragging-changed', onDraggingChanged);
      unsubscribe();
      tc.detach();
      scene.remove(tcHelper);
      tc.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return isDraggingRef;
}
