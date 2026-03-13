import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ThreeSetup } from './useThreeSetup';
import type { CameraPreset, ViewportActions } from '../../types/viewport';
import { useSceneStore } from '../../store/useSceneStore';
import { undoStack } from '../../store/undoStack';
import { TransformCommand } from '../../store/commands';
import type { Transform } from '../../types/scene';

const TRANSITION_MS = 350;

const PRESETS: Record<
  CameraPreset,
  { direction: [number, number, number]; up: [number, number, number] }
> = {
  home:   { direction: [80,   80,  120], up: [0, 1,  0] },
  front:  { direction: [0,     0,    1], up: [0, 1,  0] },
  back:   { direction: [0,     0,   -1], up: [0, 1,  0] },
  left:   { direction: [-1,    0,    0], up: [0, 1,  0] },
  right:  { direction: [1,     0,    0], up: [0, 1,  0] },
  top:    { direction: [0,     1,    0], up: [0, 0, -1] },
  bottom: { direction: [0,    -1,    0], up: [0, 0,  1] },
};

// Ease-out cubic: fast start, gentle arrival
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function sceneBoundingSphere(three: ThreeSetup): THREE.Sphere {
  const box = new THREE.Box3();
  three.scene.traverseVisible((obj) => {
    if (obj instanceof THREE.Mesh) box.expandByObject(obj);
  });
  if (box.isEmpty()) return new THREE.Sphere(new THREE.Vector3(0, 0, 0), 50);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  return sphere;
}

function selectionBoundingSphere(three: ThreeSetup, nodeIds: Set<string>): THREE.Sphere | null {
  const box = new THREE.Box3();
  three.scene.traverseVisible((obj) => {
    if (obj instanceof THREE.Mesh && nodeIds.has(obj.userData.nodeId as string)) {
      box.expandByObject(obj);
    }
  });
  if (box.isEmpty()) return null;
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  return sphere;
}

export function useCameraPresets(
  threeRef: RefObject<ThreeSetup | null>,
  orbitControlsRef: RefObject<OrbitControls | null>,
  actionsRef: RefObject<ViewportActions | null>,
  onBeforeRenderRef: RefObject<(() => void) | null>,
): void {
  useEffect(() => {
    function animateTo(
      three: ThreeSetup,
      controls: OrbitControls,
      sphere: THREE.Sphere,
      direction: THREE.Vector3,
      up: THREE.Vector3,
    ) {
      const { center, radius } = sphere;
      const fovRad = three.camera.fov * (Math.PI / 180);
      const aspect = three.camera.aspect;
      const dist = (radius / (Math.tan(fovRad / 2) * Math.min(1, aspect))) * 1.2;

      const endPos    = center.clone().addScaledVector(direction, dist);
      const endTarget = center.clone();
      const startPos    = three.camera.position.clone();
      const startTarget = controls.target.clone();
      const startUp     = three.camera.up.clone();
      const startTime   = performance.now();

      onBeforeRenderRef.current = () => {
        const t = Math.min((performance.now() - startTime) / TRANSITION_MS, 1);
        const e = easeOut(t);

        three.camera.position.lerpVectors(startPos, endPos, e);
        three.camera.up.lerpVectors(startUp, up, e).normalize();
        controls.target.lerpVectors(startTarget, endTarget, e);
        three.camera.lookAt(controls.target);

        if (t >= 1) {
          onBeforeRenderRef.current = () => controls.update();
          controls.update();
        }
      };
    }

    actionsRef.current = {
      setPreset: (preset: CameraPreset) => {
        const three = threeRef.current;
        const controls = orbitControlsRef.current;
        if (!three || !controls) return;

        const { direction, up: targetUp } = PRESETS[preset];
        const sphere = sceneBoundingSphere(three);
        animateTo(
          three,
          controls,
          sphere,
          new THREE.Vector3(...direction).normalize(),
          new THREE.Vector3(...targetUp),
        );
      },

      dropToWorkplane: () => {
        const three = threeRef.current;
        if (!three) return;

        const { nodes, selectedIds, workplane } = useSceneStore.getState();
        // Only root-level nodes
        const rootIds = selectedIds.filter((id) => {
          const node = nodes.find((n) => n.id === id);
          return node?.parentId === null;
        });
        if (rootIds.length === 0) return;

        const normal = new THREE.Vector3(...workplane.normal).normalize();
        const origin = new THREE.Vector3(...workplane.origin);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);

        // Collect all descendant nodeIds for a given root (to include group children in bounds)
        function collectIds(nodeId: string): string[] {
          const result: string[] = [nodeId];
          const n = nodes.find((x) => x.id === nodeId);
          if (n) for (const c of n.childIds) result.push(...collectIds(c));
          return result;
        }

        const ids: string[] = [];
        const befores: Transform[] = [];
        const afters: Transform[] = [];

        // Ensure world matrices are up to date before sampling vertices
        three.scene.updateMatrixWorld();

        const tempVertex = new THREE.Vector3();

        for (const id of rootIds) {
          const node = nodes.find((n) => n.id === id);
          if (!node) continue;

          const descendantIds = new Set(collectIds(id));
          let minDist = Infinity;

          // Sample every actual mesh vertex in world space — exact for any workplane angle
          three.scene.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;
            if (!descendantIds.has(obj.userData.nodeId as string)) return;
            const positions = obj.geometry.attributes.position;
            if (!positions) return;
            for (let i = 0; i < positions.count; i++) {
              tempVertex.fromBufferAttribute(positions, i).applyMatrix4(obj.matrixWorld);
              const d = plane.distanceToPoint(tempVertex);
              if (d < minDist) minDist = d;
            }
          });

          if (minDist === Infinity) continue;

          const [px, py, pz] = node.transform.position;
          ids.push(id);
          befores.push(node.transform);
          afters.push({
            ...node.transform,
            position: [px - normal.x * minDist, py - normal.y * minDist, pz - normal.z * minDist],
          });
        }

        if (ids.length > 0) {
          undoStack.push(new TransformCommand(ids, befores, afters));
        }
      },

      focusSelection: () => {
        const three = threeRef.current;
        const controls = orbitControlsRef.current;
        if (!three || !controls) return;

        const { selectedIds } = useSceneStore.getState();
        const sphere =
          selectedIds.length > 0
            ? selectionBoundingSphere(three, new Set(selectedIds)) ?? sceneBoundingSphere(three)
            : sceneBoundingSphere(three);

        // Keep current camera direction, just zoom to fit the target
        const dir = three.camera.position.clone().sub(controls.target).normalize();
        animateTo(three, controls, sphere, dir, three.camera.up.clone());
      },
    };

    return () => {
      actionsRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
