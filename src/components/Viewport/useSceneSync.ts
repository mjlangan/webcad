import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { ThreeSetup } from './useThreeSetup';
import { useSceneStore } from '../../store/useSceneStore';
import { buildGeometry } from '../../lib/buildGeometry';
import { computeWorldMatrix } from '../../lib/worldMatrix';

const SELECTED_COLOR = new THREE.Color('#ff8822');
const SELECTED_EMISSIVE = new THREE.Color('#331100');
const DEFAULT_EMISSIVE = new THREE.Color('#000000');

export function useSceneSync(
  threeRef: RefObject<ThreeSetup | null>,
): RefObject<Map<string, THREE.Mesh>> {
  const meshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());

  useEffect(() => {
    if (!threeRef.current) return;
    const { scene } = threeRef.current;
    const meshMap = meshMapRef.current;

    const syncToScene = () => {
      const { nodes, selectedIds } = useSceneStore.getState();
      const selectedSet = new Set(selectedIds);
      const seen = new Set<string>();

      nodes.forEach((node) => {
        seen.add(node.id);

        // Determine if this node is a child of a general-purpose group.
        // If so, its transform in the store is LOCAL, and we must compute the
        // world matrix by walking the parent chain.
        const parentNode = node.parentId
          ? nodes.find((n) => n.id === node.parentId)
          : null;
        const isGroupChild = parentNode?.geometry.type === 'group';

        // Include parentId in the key so that reparenting triggers mesh recreate
        // (to reset matrixAutoUpdate and other per-mesh state).
        const stateKey = JSON.stringify(node.geometry) + '|' + (node.parentId ?? '');

        let mesh = meshMap.get(node.id);

        if (!mesh) {
          const geo = buildGeometry(node.geometry);
          const mat = new THREE.MeshStandardMaterial({
            color: node.material.color,
            opacity: node.material.opacity,
            transparent: node.material.opacity < 1,
          });
          mesh = new THREE.Mesh(geo, mat);
          mesh.userData.nodeId = node.id;
          mesh.userData.stateKey = stateKey;
          mesh.userData.ownedGeometry = node.geometry.type !== 'imported';
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          scene.add(mesh);
          meshMap.set(node.id, mesh);
        } else {
          // Recreate geometry if params or parent changed
          if (mesh.userData.stateKey !== stateKey) {
            if (mesh.userData.ownedGeometry as boolean) mesh.geometry.dispose();
            mesh.geometry = buildGeometry(node.geometry);
            mesh.userData.stateKey = stateKey;
            mesh.userData.ownedGeometry = node.geometry.type !== 'imported';
          }
        }

        const mat = mesh.material as THREE.MeshStandardMaterial;
        const isSelected = selectedSet.has(node.id);

        mat.color.set(isSelected ? SELECTED_COLOR : node.material.color);
        mat.emissive.set(isSelected ? SELECTED_EMISSIVE : DEFAULT_EMISSIVE);

        const newTransparent = node.material.opacity < 1;
        if (mat.transparent !== newTransparent) {
          mat.transparent = newTransparent;
          mat.needsUpdate = true;
        }
        mat.opacity = node.material.opacity;
        mat.wireframe = node.material.wireframe;

        if (isGroupChild) {
          // Child of a general group: the store holds a LOCAL transform.
          // Compute the world matrix and decompose it into the mesh's world-space
          // properties so that Three.js and TransformControls both work normally.
          const worldMat = computeWorldMatrix(node.id, nodes);
          worldMat.decompose(mesh.position, mesh.quaternion, mesh.scale);
          mesh.rotation.setFromQuaternion(mesh.quaternion);
          mesh.matrixAutoUpdate = true;
        } else {
          // Root node or CSG child: transform stored in world space, apply directly.
          mesh.matrixAutoUpdate = true;
          mesh.position.set(...node.transform.position);
          mesh.rotation.set(...node.transform.rotation);
          mesh.scale.set(...node.transform.scale);
        }

        mesh.visible = node.visible;
      });

      // Remove orphaned meshes
      meshMap.forEach((mesh, id) => {
        if (!seen.has(id)) {
          scene.remove(mesh);
          if (mesh.userData.ownedGeometry as boolean) mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
          meshMap.delete(id);
        }
      });
    };

    // Prime the scene with the current store state immediately
    syncToScene();

    // Subscribe to all future store changes
    const unsubscribe = useSceneStore.subscribe(syncToScene);

    return () => {
      unsubscribe();
      meshMap.forEach((mesh) => {
        scene.remove(mesh);
        if (mesh.userData.ownedGeometry as boolean) mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      meshMap.clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return meshMapRef;
}
