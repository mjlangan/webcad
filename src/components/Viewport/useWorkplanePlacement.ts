import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { ThreeSetup } from './useThreeSetup';
import { useSceneStore } from '../../store/useSceneStore';
import { undoStack } from '../../store/undoStack';
import { SetWorkplaneCommand } from '../../store/commands';
import { createWorkplaneFromHit } from '../../lib/workplaneUtils';

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
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    // Create ghost plane mesh (semi-transparent, 100x100 size)
    const ghostGeometry = new THREE.PlaneGeometry(100, 100);
    const ghostMaterial = new THREE.MeshBasicMaterial({
      color: 0x44aaff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const ghostPlane = new THREE.Mesh(ghostGeometry, ghostMaterial);
    ghostPlane.visible = false;
    scene.add(ghostPlane);
    ghostPlaneRef.current = ghostPlane;

    const updatePointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const clearHoverHighlight = () => {
      if (hoveredMeshRef.current && savedEmissiveRef.current) {
        const mat = hoveredMeshRef.current.material as THREE.MeshStandardMaterial;
        mat.emissive.copy(savedEmissiveRef.current);
        hoveredMeshRef.current = null;
        savedEmissiveRef.current = null;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const { workplanePlacementMode } = useSceneStore.getState();
      if (!workplanePlacementMode || isDraggingRef.current) {
        ghostPlane.visible = false;
        clearHoverHighlight();
        return;
      }

      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);

      const meshes = Array.from(meshMapRef.current?.values() ?? []);
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
        if (hoveredMeshRef.current !== hitMesh) {
          clearHoverHighlight();
          const mat = hitMesh.material as THREE.MeshStandardMaterial;
          savedEmissiveRef.current = mat.emissive.clone();
          mat.emissive.set(0x226688);
          hoveredMeshRef.current = hitMesh;
        }
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
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);

      const meshes = Array.from(meshMapRef.current?.values() ?? []);
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
      ghostGeometry.dispose();
      ghostMaterial.dispose();
      clearHoverHighlight();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
