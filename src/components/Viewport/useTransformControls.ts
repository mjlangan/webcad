import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ThreeSetup } from './useThreeSetup';
import { useSceneStore } from '../../store/useSceneStore';
import { undoStack } from '../../store/undoStack';
import { TransformCommand } from '../../store/commands';
import type { Transform } from '../../types/scene';
import { workplaneToThreePlane } from '../../lib/workplaneUtils';
import { computeWorldMatrix } from '../../lib/worldMatrix';

/**
 * Converts a mesh's current world transform into a store Transform for the
 * given node.  For children of a general-purpose group the result is in local
 * space relative to the parent; for root-level nodes it is world space.
 */
function meshTransformToStoreTransform(mesh: THREE.Mesh, nodeId: string): Transform {
  const { nodes } = useSceneStore.getState();
  const node = nodes.find((n) => n.id === nodeId);
  const parentNode = node?.parentId
    ? nodes.find((n) => n.id === node.parentId)
    : null;

  const worldPos = mesh.position.clone();
  const worldQuat = mesh.quaternion.clone();
  const worldScale = mesh.scale.clone();

  if (parentNode?.geometry.type === 'group') {
    // Convert world → local relative to the parent group
    const parentWorldMatInv = computeWorldMatrix(parentNode.id, nodes).invert();
    const childWorldMat = new THREE.Matrix4().compose(worldPos, worldQuat, worldScale);
    const localMat = parentWorldMatInv.multiply(childWorldMat);

    const localPos = new THREE.Vector3();
    const localQuat = new THREE.Quaternion();
    const localScale = new THREE.Vector3();
    localMat.decompose(localPos, localQuat, localScale);
    const euler = new THREE.Euler().setFromQuaternion(localQuat);
    return {
      position: [localPos.x, localPos.y, localPos.z],
      rotation: [euler.x, euler.y, euler.z],
      scale: [localScale.x, localScale.y, localScale.z],
    };
  }

  // Root node or CSG child — transform is stored in world space
  const euler = new THREE.Euler().setFromQuaternion(worldQuat);
  return {
    position: worldPos.toArray() as [number, number, number],
    rotation: [euler.x, euler.y, euler.z],
    scale: worldScale.toArray() as [number, number, number],
  };
}

export function useTransformControls(
  threeRef: RefObject<ThreeSetup | null>,
  meshMapRef: RefObject<Map<string, THREE.Mesh>>,
  orbitControlsRef: RefObject<OrbitControls | null>,
): RefObject<boolean> {
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
        const primaryObj = tc.object as THREE.Mesh;
        const afterTransforms: Transform[] = dragIds.map((id, i) => {
          const mesh = i === 0 ? primaryObj : (meshMapRef.current.get(id) ?? null);
          if (!mesh) return dragBeforeTransforms[i];
          // Convert the mesh's world transform to the store format (local for group children)
          return meshTransformToStoreTransform(mesh, id);
        });
        undoStack.push(new TransformCommand(dragIds, dragBeforeTransforms, afterTransforms));
        dragIds = [];
        dragBeforeTransforms = [];
      }
    };

    // Move secondary meshes in real-time to match the primary's translation delta.
    // Also projects the primary onto the active workplane when translating.
    const onChange = () => {
      if (!isDraggingRef.current || !tc.object) return;

      // Workplane constraint: project the primary object onto the workplane plane during
      // translate. This replaces the implicit world-XZ drag plane with the active workplane.
      const { workplane, transformMode, nodes } = useSceneStore.getState();
      if (transformMode === 'translate') {
        const isDefaultWorkplane =
          workplane.normal[0] === 0 && workplane.normal[1] === 1 && workplane.normal[2] === 0 &&
          workplane.origin[0] === 0 && workplane.origin[1] === 0 && workplane.origin[2] === 0;
        if (!isDefaultWorkplane) {
          const plane = workplaneToThreePlane(workplane);
          const normal = new THREE.Vector3(...workplane.normal);
          const dist = plane.distanceToPoint(tc.object.position);
          tc.object.position.addScaledVector(normal, -dist);
        }
      }

      // Move secondary selected meshes (multi-select translate)
      if (dragIds.length > 1) {
        const delta = tc.object.position.clone().sub(startPrimary);
        dragIds.slice(1).forEach((id) => {
          const mesh = meshMapRef.current.get(id);
          const start = startSecondariesPos.get(id);
          if (mesh && start) {
            mesh.position.copy(start).add(delta);
          }
        });
      }

      // If the primary is a group, update all its children's mesh positions live
      // so they move with the group gizmo instead of snapping at drag end.
      if (dragIds.length > 0) {
        const primaryNode = nodes.find((n) => n.id === dragIds[0]);
        if (primaryNode?.geometry.type === 'group') {
          const groupWorldMat = new THREE.Matrix4().compose(
            tc.object.position,
            tc.object.quaternion,
            tc.object.scale,
          );
          primaryNode.childIds.forEach((childId) => {
            const childNode = nodes.find((n) => n.id === childId);
            const childMesh = meshMapRef.current.get(childId);
            if (!childNode || !childMesh) return;
            const childLocalMat = new THREE.Matrix4().compose(
              new THREE.Vector3(...childNode.transform.position),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(...childNode.transform.rotation)),
              new THREE.Vector3(...childNode.transform.scale),
            );
            const childWorldMat = groupWorldMat.clone().multiply(childLocalMat);
            childWorldMat.decompose(childMesh.position, childMesh.quaternion, childMesh.scale);
            childMesh.rotation.setFromQuaternion(childMesh.quaternion);
          });
        }
      }
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
