import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { ThreeSetup } from './useThreeSetup';
import { useSceneStore } from '../../store/useSceneStore';
import { undoStack } from '../../store/undoStack';
import { TransformCommand } from '../../store/commands';
import type { SceneNode, Transform } from '../../types/scene';

function collectIds(nodeId: string, nodes: SceneNode[]): string[] {
  const result: string[] = [nodeId];
  const n = nodes.find((x) => x.id === nodeId);
  if (n) for (const c of n.childIds) result.push(...collectIds(c, nodes));
  return result;
}

/**
 * Face-align mode: user clicks a face on the selected object and the object is
 * re-oriented + translated so that chosen face lies flush on the workplane.
 *
 * Algorithm:
 *  1. Compute quaternion that rotates the picked face normal → workplane normal.
 *  2. Apply that quaternion to the node's current rotation.
 *  3. Sample all descendant vertices through the hypothetical new world matrix
 *     to find the minimum signed distance to the workplane.
 *  4. Translate along the workplane normal to bring the lowest point flush.
 *  5. Push a TransformCommand for full undo/redo.
 */
export function useFaceAlignMode(
  threeRef: RefObject<ThreeSetup | null>,
  meshMapRef: RefObject<Map<string, THREE.Mesh>>,
  isDraggingRef: RefObject<boolean>,
): void {
  const hoveredMeshRef = useRef<THREE.Mesh | null>(null);
  const savedEmissiveRef = useRef<THREE.Color | null>(null);

  useEffect(() => {
    if (!threeRef.current) return;
    const { scene, camera, renderer } = threeRef.current;
    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    // Small ghost plane shown at the hovered face to preview alignment target
    const ghostGeometry = new THREE.PlaneGeometry(50, 50);
    const ghostMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8844,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ghostPlane = new THREE.Mesh(ghostGeometry, ghostMaterial);
    ghostPlane.visible = false;
    ghostPlane.renderOrder = 999;
    scene.add(ghostPlane);

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

    const getPickableMeshes = () => {
      const { selectedIds, nodes } = useSceneStore.getState();
      const rootIds = selectedIds.filter((id) => {
        const node = nodes.find((n) => n.id === id);
        return node?.parentId === null;
      });
      const pickableIds = new Set<string>();
      for (const id of rootIds) {
        collectIds(id, nodes).forEach((did) => pickableIds.add(did));
      }
      return Array.from(meshMapRef.current?.values() ?? []).filter(
        (m) => m.visible && pickableIds.has(m.userData.nodeId as string),
      );
    };

    const onPointerMove = (e: PointerEvent) => {
      const { faceAlignMode } = useSceneStore.getState();
      if (!faceAlignMode || isDraggingRef.current) {
        ghostPlane.visible = false;
        clearHoverHighlight();
        canvas.style.cursor = '';
        return;
      }

      canvas.style.cursor = 'crosshair';
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);

      const meshes = getPickableMeshes();
      const intersects = raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const hit = intersects[0];
        const hitMesh = hit.object as THREE.Mesh;
        const hitNormal = hit.face?.normal
          ? hit.face.normal.clone().transformDirection(hitMesh.matrixWorld).normalize()
          : new THREE.Vector3(0, 1, 0);

        ghostPlane.position.copy(hit.point);
        ghostPlane.lookAt(hit.point.clone().add(hitNormal));
        ghostPlane.visible = true;

        if (hoveredMeshRef.current !== hitMesh) {
          clearHoverHighlight();
          const mat = hitMesh.material as THREE.MeshStandardMaterial;
          savedEmissiveRef.current = mat.emissive.clone();
          mat.emissive.set(0x884422);
          hoveredMeshRef.current = hitMesh;
        }
      } else {
        ghostPlane.visible = false;
        clearHoverHighlight();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const { faceAlignMode, selectedIds, nodes, workplane } = useSceneStore.getState();
      if (!faceAlignMode) return;

      // Right-click cancels
      if (e.button !== 0) {
        useSceneStore.getState().setFaceAlignMode(false);
        ghostPlane.visible = false;
        clearHoverHighlight();
        canvas.style.cursor = '';
        return;
      }

      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);

      const meshes = getPickableMeshes();
      const intersects = raycaster.intersectObjects(meshes, false);
      if (intersects.length === 0) return;

      const hit = intersects[0];
      const hitMesh = hit.object as THREE.Mesh;
      const faceNormal = hit.face?.normal
        ? hit.face.normal.clone().transformDirection(hitMesh.matrixWorld).normalize()
        : new THREE.Vector3(0, 1, 0);

      const wpNormal = new THREE.Vector3(...workplane.normal).normalize();
      const wpOrigin = new THREE.Vector3(...workplane.origin);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(wpNormal, wpOrigin);

      // Rotation that maps faceNormal → -wpNormal (face points into workplane = lies flush on it)
      const alignQuat = new THREE.Quaternion().setFromUnitVectors(faceNormal, wpNormal.clone().negate());

      const rootIds = selectedIds.filter((id) => {
        const node = nodes.find((n) => n.id === id);
        return node?.parentId === null;
      });

      const ids: string[] = [];
      const befores: Transform[] = [];
      const afters: Transform[] = [];

      scene.updateMatrixWorld();
      const tempVertex = new THREE.Vector3();
      const tempMatrix = new THREE.Matrix4();

      for (const rootId of rootIds) {
        const node = nodes.find((n) => n.id === rootId);
        if (!node) continue;

        const [px, py, pz] = node.transform.position;
        const [rx, ry, rz] = node.transform.rotation;
        const [sx, sy, sz] = node.transform.scale;

        const currentQuat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(rx, ry, rz),
        );

        // Compose the new world rotation: alignQuat applied on top of current rotation
        const newQuat = alignQuat.clone().multiply(currentQuat);

        // Build old and new world matrices (root nodes: world matrix = local matrix)
        const pos = new THREE.Vector3(px, py, pz);
        const scale = new THREE.Vector3(sx, sy, sz);
        const M_old = new THREE.Matrix4().compose(pos, currentQuat, scale);
        const M_new = new THREE.Matrix4().compose(pos, newQuat, scale);

        // Delta: transforms vertices from old world-space to new world-space
        const delta = M_new.clone().multiply(M_old.clone().invert());

        // Sample all descendant vertices through the hypothetical new world matrix
        const descendantIds = new Set(collectIds(rootId, nodes));
        let minDist = Infinity;

        scene.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          if (!descendantIds.has(obj.userData.nodeId as string)) return;
          const positions = obj.geometry.attributes.position;
          if (!positions) return;
          tempMatrix.multiplyMatrices(delta, obj.matrixWorld);
          for (let i = 0; i < positions.count; i++) {
            tempVertex.fromBufferAttribute(positions, i).applyMatrix4(tempMatrix);
            const d = plane.distanceToPoint(tempVertex);
            if (d < minDist) minDist = d;
          }
        });

        if (minDist === Infinity) continue;

        // Translate along -wpNormal so the closest point touches the workplane
        const finalPos: [number, number, number] = [
          px - wpNormal.x * minDist,
          py - wpNormal.y * minDist,
          pz - wpNormal.z * minDist,
        ];

        const newEuler = new THREE.Euler().setFromQuaternion(newQuat, 'XYZ');
        const finalRot: [number, number, number] = [newEuler.x, newEuler.y, newEuler.z];

        ids.push(rootId);
        befores.push(node.transform);
        afters.push({ ...node.transform, position: finalPos, rotation: finalRot });
      }

      if (ids.length > 0) {
        undoStack.push(new TransformCommand(ids, befores, afters));
      }

      useSceneStore.getState().setFaceAlignMode(false);
      ghostPlane.visible = false;
      clearHoverHighlight();
      canvas.style.cursor = '';
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useSceneStore.getState().faceAlignMode) {
        useSceneStore.getState().setFaceAlignMode(false);
        ghostPlane.visible = false;
        clearHoverHighlight();
        canvas.style.cursor = '';
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
      canvas.style.cursor = '';
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
