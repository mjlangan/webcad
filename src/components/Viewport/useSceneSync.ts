import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { ThreeSetup } from './useThreeSetup';
import { useSceneStore } from '../../store/useSceneStore';
import type { PrimitiveParams } from '../../types/scene';
import { meshGeometryMap } from '../../lib/meshGeometryMap';

const SELECTED_COLOR = new THREE.Color('#ff8822');
const SELECTED_EMISSIVE = new THREE.Color('#331100');
const DEFAULT_EMISSIVE = new THREE.Color('#000000');

function buildGeometry(params: PrimitiveParams): THREE.BufferGeometry {
  switch (params.type) {
    case 'box':
      return new THREE.BoxGeometry(params.width, params.height, params.depth);
    case 'sphere':
      return new THREE.SphereGeometry(
        params.radius,
        params.widthSegments,
        params.heightSegments,
      );
    case 'cylinder':
      return new THREE.CylinderGeometry(
        params.radiusTop,
        params.radiusBottom,
        params.height,
        params.radialSegments,
      );
    case 'cone':
      return new THREE.ConeGeometry(
        params.radius,
        params.height,
        params.radialSegments,
      );
    case 'torus':
      return new THREE.TorusGeometry(
        params.radius,
        params.tube,
        params.radialSegments,
        params.tubularSegments,
      );
    case 'imported': {
      const geo = meshGeometryMap.get(params.meshId);
      if (!geo) {
        // Fallback for a missing imported mesh (e.g. after re-mount before import completes)
        return new THREE.BufferGeometry();
      }
      return geo;
    }
  }
}

export function useSceneSync(
  threeRef: MutableRefObject<ThreeSetup | null>,
): MutableRefObject<Map<string, THREE.Mesh>> {
  const meshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());

  useEffect(() => {
    if (!threeRef.current) return;
    const { scene } = threeRef.current;
    const meshMap = meshMapRef.current;

    const syncToScene = () => {
      const { nodes, selectedId } = useSceneStore.getState();
      const seen = new Set<string>();

      nodes.forEach((node) => {
        seen.add(node.id);
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
          mesh.userData.geometryKey = JSON.stringify(node.geometry);
          mesh.userData.ownedGeometry = node.geometry.type !== 'imported';
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          scene.add(mesh);
          meshMap.set(node.id, mesh);
        } else {
          // Recreate geometry if params changed
          const newKey = JSON.stringify(node.geometry);
          if (mesh.userData.geometryKey !== newKey) {
            if (mesh.userData.ownedGeometry as boolean) mesh.geometry.dispose();
            mesh.geometry = buildGeometry(node.geometry);
            mesh.userData.geometryKey = newKey;
            mesh.userData.ownedGeometry = node.geometry.type !== 'imported';
          }
        }

        const mat = mesh.material as THREE.MeshStandardMaterial;
        const isSelected = selectedId === node.id;

        mat.color.set(isSelected ? SELECTED_COLOR : node.material.color);
        mat.emissive.set(isSelected ? SELECTED_EMISSIVE : DEFAULT_EMISSIVE);

        mesh.position.set(...node.transform.position);
        mesh.rotation.set(...node.transform.rotation);
        mesh.scale.set(...node.transform.scale);
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
