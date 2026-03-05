import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import type { ThreeSetup } from './useThreeSetup';
import { useSceneStore } from '../../store/useSceneStore';
import type { Workplane } from '../../types/scene';

const AXIS_LENGTH = 50;

function applyWorkplaneToObject(obj: THREE.Object3D, workplane: Workplane): void {
  const normal = new THREE.Vector3(...workplane.normal);
  const tangentX = new THREE.Vector3(...workplane.tangentX);
  const tangentZ = new THREE.Vector3().crossVectors(tangentX, normal).normalize();
  const m = new THREE.Matrix4().makeBasis(tangentX, normal, tangentZ);
  obj.position.set(...workplane.origin);
  obj.setRotationFromMatrix(m);
}

/**
 * Renders the active workplane as a distinctly-colored GridHelper with
 * red (local X) and green (local Z) axis lines through the origin.
 * The world grid (from useThreeSetup) stays visible simultaneously.
 */
export function useWorkplaneVisualization(
  threeRef: RefObject<ThreeSetup | null>,
): void {
  useEffect(() => {
    if (!threeRef.current) return;
    const { scene } = threeRef.current;

    const container = new THREE.Object3D();

    // Distinctly-colored grid so it reads differently from the world grid
    const grid = new THREE.GridHelper(200, 20, '#ff6600', '#883300');
    container.add(grid);

    // Local X axis line (red)
    const xGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-AXIS_LENGTH, 0, 0),
      new THREE.Vector3(AXIS_LENGTH, 0, 0),
    ]);
    const xLine = new THREE.Line(xGeo, new THREE.LineBasicMaterial({ color: 0xff2222 }));

    // Local Z axis line (green)
    const zGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -AXIS_LENGTH),
      new THREE.Vector3(0, 0, AXIS_LENGTH),
    ]);
    const zLine = new THREE.Line(zGeo, new THREE.LineBasicMaterial({ color: 0x22ff22 }));

    container.add(xLine);
    container.add(zLine);
    scene.add(container);

    applyWorkplaneToObject(container, useSceneStore.getState().workplane);

    const unsubscribe = useSceneStore.subscribe((state) => {
      applyWorkplaneToObject(container, state.workplane);
    });

    return () => {
      unsubscribe();
      scene.remove(container);
      grid.dispose();
      xGeo.dispose();
      zGeo.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
