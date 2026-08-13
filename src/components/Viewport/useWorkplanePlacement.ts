import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { ThreeSetup } from './useThreeSetup';
import { useSceneStore } from '../../store/useSceneStore';
import { undoStack } from '../../store/undoStack';
import { SetWorkplaneCommand } from '../../store/commands';
import { createWorkplaneFromHit } from '../../lib/workplaneUtils';
import { disposeMaterial } from './disposeMaterial';
import { pointerEventToNdc } from '../../lib/screenProjection';
import { createPointerRaycaster, getVisibleMeshes, makeHoverHighlighter, createHelperGhostPlane } from './interactionHelpers';

/**
 * Manages workplane placement mode:
 * - Raycasts to find face hits on meshes
 * - Shows a ghost plane following the cursor
 * - Highlights the hovered face
 * - Commits workplane on click
 * - Cancels on Escape or right-click
 */
export function useWorkplanePlacement(
  threeRef: RefObject<ThreeSetup | null>,
  meshMapRef: RefObject<Map<string, THREE.Mesh>>,
  isDraggingRef: RefObject<boolean>,
): void {
  const ghostPlaneRef = useRef<THREE.Mesh | null>(null);
  const hoveredMeshRef = useRef<THREE.Mesh | null>(null);
  const savedEmissiveRef = useRef<THREE.Color | null>(null);

  useEffect(() => {
    if (!threeRef.current) return;
    const { scene, camera, renderer } = threeRef.current;
    const canvas = renderer.domElement;
    const { raycaster, pointer } = createPointerRaycaster();

    const ghostPlane = createHelperGhostPlane({ width: 100, height: 100, color: 0x44aaff, opacity: 0.3 });
    scene.add(ghostPlane);
    ghostPlaneRef.current = ghostPlane;

    const { clear: clearHoverHighlight, setHover } = makeHoverHighlighter(hoveredMeshRef, savedEmissiveRef, 0x226688);

    const onPointerMove = (e: PointerEvent) => {
      const { workplanePlacementMode } = useSceneStore.getState();
      if (!workplanePlacementMode || isDraggingRef.current) {
        ghostPlane.visible = false;
        clearHoverHighlight();
        return;
      }

      pointerEventToNdc(e, canvas, pointer);
      raycaster.setFromCamera(pointer, camera);

      const meshes = getVisibleMeshes(meshMapRef);
      const intersects = raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const hit = intersects[0];
        const hitMesh = hit.object as THREE.Mesh;
        const hitPoint = hit.point;
        const hitNormal = hit.face?.normal
          ? hit.face.normal.clone().transformDirection(hitMesh.matrixWorld)
          : new THREE.Vector3(0, 1, 0);

        // Position and orient ghost plane
        ghostPlane.position.copy(hitPoint);
        ghostPlane.lookAt(hitPoint.clone().add(hitNormal));
        ghostPlane.visible = true;

        // Highlight hovered face
        setHover(hitMesh);
      } else {
        ghostPlane.visible = false;
        clearHoverHighlight();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const { workplanePlacementMode, workplane } = useSceneStore.getState();
      if (!workplanePlacementMode) return;

      // Right-click or Escape cancels
      if (e.button !== 0) {
        useSceneStore.getState().setWorkplanePlacementMode(false);
        ghostPlane.visible = false;
        clearHoverHighlight();
        return;
      }

      // Left-click commits
      pointerEventToNdc(e, canvas, pointer);
      raycaster.setFromCamera(pointer, camera);

      const meshes = getVisibleMeshes(meshMapRef);
      const intersects = raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const hit = intersects[0];
        const hitMesh = hit.object as THREE.Mesh;
        const hitPoint = hit.point;
        const hitNormal = hit.face?.normal
          ? hit.face.normal.clone().transformDirection(hitMesh.matrixWorld)
          : new THREE.Vector3(0, 1, 0);

        const newWorkplane = createWorkplaneFromHit(hitPoint, hitNormal);
        undoStack.push(new SetWorkplaneCommand(workplane, newWorkplane));
        useSceneStore.getState().setWorkplanePlacementMode(false);
        ghostPlane.visible = false;
        clearHoverHighlight();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const { workplanePlacementMode } = useSceneStore.getState();
      if (workplanePlacementMode && e.key === 'Escape') {
        useSceneStore.getState().setWorkplanePlacementMode(false);
        ghostPlane.visible = false;
        clearHoverHighlight();
      }
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      scene.remove(ghostPlane);
      ghostPlane.geometry.dispose();
      disposeMaterial(ghostPlane.material);
      clearHoverHighlight();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
