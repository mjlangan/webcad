import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ThreeSetup } from './useThreeSetup';
import { useSceneStore } from '../../store/useSceneStore';
import { undoStack } from '../../store/undoStack';
import { TransformCommand } from '../../store/commands';
import type { Transform } from '../../types/scene';

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

    // Drag state — populated on drag start, consumed on drag end
    let dragIds: string[] = [];
    let dragBeforeTransforms: Transform[] = [];
    let startPrimary = new THREE.Vector3();
    const startSecondariesPos = new Map<string, THREE.Vector3>();

    const onDraggingChanged = (event: { value: unknown }) => {
      const dragging = event.value as boolean;
      isDraggingRef.current = dragging;
      if (orbitControlsRef.current) {
        orbitControlsRef.current.enabled = !dragging;
      }

      if (dragging && tc.object) {
        // Capture before-state from store for all selected nodes
        const { selectedIds, nodes } = useSceneStore.getState();
        dragIds = [...selectedIds];
        dragBeforeTransforms = dragIds.map((id) => {
          const node = nodes.find((n) => n.id === id);
          return node
            ? { ...node.transform }
            : { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] };
        });
        // Record mesh start positions to compute delta for secondaries
        startPrimary = tc.object.position.clone();
        startSecondariesPos.clear();
        dragIds.forEach((id) => {
          const mesh = meshMapRef.current.get(id);
          if (mesh) startSecondariesPos.set(id, mesh.position.clone());
        });
      }

      if (!dragging && tc.object && dragIds.length > 0) {
        const primaryObj = tc.object;
        const afterTransforms: Transform[] = dragIds.map((id, i) => {
          if (i === 0) {
            return {
              position: primaryObj.position.toArray() as [number, number, number],
              rotation: [primaryObj.rotation.x, primaryObj.rotation.y, primaryObj.rotation.z],
              scale: primaryObj.scale.toArray() as [number, number, number],
            };
          }
          const mesh = meshMapRef.current.get(id);
          if (!mesh) return dragBeforeTransforms[i];
          return {
            position: mesh.position.toArray() as [number, number, number],
            rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
            scale: mesh.scale.toArray() as [number, number, number],
          };
        });
        undoStack.push(new TransformCommand(dragIds, dragBeforeTransforms, afterTransforms));
        dragIds = [];
        dragBeforeTransforms = [];
      }
    };

    // Move secondary meshes in real-time to match the primary's translation delta
    const onChange = () => {
      if (!isDraggingRef.current || !tc.object || dragIds.length <= 1) return;
      const delta = tc.object.position.clone().sub(startPrimary);
      dragIds.slice(1).forEach((id) => {
        const mesh = meshMapRef.current.get(id);
        const start = startSecondariesPos.get(id);
        if (mesh && start) {
          mesh.position.copy(start).add(delta);
        }
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tc.addEventListener('dragging-changed', onDraggingChanged as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tc.addEventListener('change', onChange as any);

    // Reattach TC and update mode whenever selection or transformMode changes
    const unsubscribe = useSceneStore.subscribe((state) => {
      const { selectedIds, transformMode } = state;
      if (selectedIds.length === 0) {
        tc.detach();
        return;
      }
      const primaryMesh = meshMapRef.current.get(selectedIds[0]);
      if (primaryMesh) {
        tc.attach(primaryMesh);
        // Multi-select only supports translate (rotate/scale are single-object operations)
        tc.setMode(selectedIds.length > 1 ? 'translate' : transformMode);
      } else {
        tc.detach();
      }
    });

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tc.removeEventListener('dragging-changed', onDraggingChanged as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tc.removeEventListener('change', onChange as any);
      unsubscribe();
      tc.detach();
      scene.remove(tcHelper);
      tc.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return isDraggingRef;
}
