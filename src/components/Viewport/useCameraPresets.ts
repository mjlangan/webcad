import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ThreeSetup } from './useThreeSetup';
import type { CameraPreset, ViewportActions } from '../../types/viewport';
import { useSceneStore } from '../../store/useSceneStore';
import { undoStack } from '../../store/undoStack';
import { TransformCommand } from '../../store/commands';
import { collectDescendantIds } from '../../lib/worldMatrix';
import { minSignedDistanceToPlane } from './sceneSampling';
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

// Like Object3D.traverseVisible, but skips an entire subtree once it hits an
// object tagged userData.isHelper (gizmos, snap indicators, etc.) — those are
// screen-space-scaled and must never factor into scene/selection framing.
function traverseVisibleSkippingHelpers(obj: THREE.Object3D, callback: (obj: THREE.Object3D) => void) {
  if (!obj.visible || obj.userData.isHelper) return;
  callback(obj);
  for (const child of obj.children) traverseVisibleSkippingHelpers(child, callback);
}

function sceneBoundingSphere(three: ThreeSetup): THREE.Sphere {
  const box = new THREE.Box3();
  traverseVisibleSkippingHelpers(three.scene, (obj) => {
    if (obj instanceof THREE.Mesh) box.expandByObject(obj);
  });
  if (box.isEmpty()) return new THREE.Sphere(new THREE.Vector3(0, 0, 0), 50);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  return sphere;
}

function selectionBoundingSphere(three: ThreeSetup, nodeIds: Set<string>): THREE.Sphere | null {
  const box = new THREE.Box3();
  traverseVisibleSkippingHelpers(three.scene, (obj) => {
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
      const camera = three.camera;
      const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera;

      // Distance doesn't affect an orthographic camera's apparent framing —
      // only zoom does — so `dist` here just needs to clear the sphere and
      // land within the clip range; the fit itself comes from targetZoom below.
      let dist: number;
      let targetZoom: number | null = null;
      const startZoom = camera.zoom;

      if (isOrtho) {
        const ortho = camera as THREE.OrthographicCamera;
        dist = radius * 3;
        // Binding half-extent — whichever of width/height is tighter, mirroring
        // the Math.min(1, aspect) term in the perspective branch below.
        const bindingHalfExtent = Math.min(ortho.top, ortho.right);
        targetZoom = bindingHalfExtent / (radius * 1.2);
      } else {
        const persp = camera as THREE.PerspectiveCamera;
        const fovRad = persp.fov * (Math.PI / 180);
        dist = (radius / (Math.tan(fovRad / 2) * Math.min(1, persp.aspect))) * 1.2;
      }

      const endPos    = center.clone().addScaledVector(direction, dist);
      const endTarget = center.clone();
      const startPos    = camera.position.clone();
      const startTarget = controls.target.clone();
      const startUp     = camera.up.clone();
      const startTime   = performance.now();

      onBeforeRenderRef.current = () => {
        const t = Math.min((performance.now() - startTime) / TRANSITION_MS, 1);
        const e = easeOut(t);

        camera.position.lerpVectors(startPos, endPos, e);
        camera.up.lerpVectors(startUp, up, e).normalize();
        controls.target.lerpVectors(startTarget, endTarget, e);
        camera.lookAt(controls.target);
        if (targetZoom !== null) {
          camera.zoom = startZoom + (targetZoom - startZoom) * e;
          camera.updateProjectionMatrix();
        }

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

        const ids: string[] = [];
        const befores: Transform[] = [];
        const afters: Transform[] = [];

        // Ensure world matrices are up to date before sampling vertices
        three.scene.updateMatrixWorld();

        for (const id of rootIds) {
          const node = nodes.find((n) => n.id === id);
          if (!node) continue;

          // Sample every actual mesh vertex in world space — exact for any workplane angle
          const descendantIds = new Set(collectDescendantIds(id, nodes));
          const minDist = minSignedDistanceToPlane(three.scene, descendantIds, plane);

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
