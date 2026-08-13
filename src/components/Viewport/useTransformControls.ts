import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ThreeSetup } from './useThreeSetup';
import { useSceneStore } from '../../store/useSceneStore';
import { undoStack } from '../../store/undoStack';
import { TransformCommand } from '../../store/commands';
import type { Transform } from '../../types/scene';
import type { TransformMode } from '../../store/useSceneStore';
import { computeWorldMatrix } from '../../lib/worldMatrix';
import { worldToPagePx } from '../../lib/screenProjection';

// Screen-space pixel radius within which vertex snap activates
const VERTEX_SNAP_PX = 20;

// Uniform damping applied to the scale gizmo's raw drag-distance ratio, so the
// same drag produces a smaller scale change than TransformControls' default
// 1:1 mapping. 1 = raw/undamped; lower = less sensitive. Applied symmetrically
// around the drag-start scale, so growing and shrinking stay linear and equally
// sensitive. Could be exposed as a user preference later.
const SCALE_SENSITIVITY = 0.5;

// TransformControls' default size (1) makes the translate gizmo's planar-handle
// pickers small enough that they're easy to miss in favor of the adjacent axis
// arrow's picker, which overlaps it. Sizing up doesn't remove that overlap, but
// it does make the whole gizmo — and the absolute on-screen gap between handles —
// bigger, which makes precise pointer placement noticeably easier in practice.
const GIZMO_SIZE = 1.4;

// Rotation snap markers: radial tick marks (like sun-rays) placed just
// outside the active rotation ring every this many degrees. Rotation is
// otherwise free; snapping only kicks in when the mouse is hovering near a
// marker. The hover radius is a fraction of the on-screen spacing between
// adjacent markers (computed per-drag), clamped to this range so it neither
// vanishes nor swallows the gaps between markers.
const ROTATE_SNAP_INCREMENT_DEG = 15;
const ROTATE_MARK_COUNT = 360 / ROTATE_SNAP_INCREMENT_DEG;
const ROTATE_MARK_SNAP_PX_MIN = 5;
const ROTATE_MARK_SNAP_PX_MAX = 14;
const ROTATE_MARK_SNAP_SPACING_FRACTION = 0.35;

// Tick geometry, expressed as fractions of the ring's own radius so ticks
// keep the same proportions as the gizmo regardless of zoom.
const ROTATE_MARK_GAP_FRACTION = 0.15;
const ROTATE_MARK_LENGTH_FRACTION = 0.3;
const ROTATE_MARK_THICKNESS_FRACTION = 0.055;

// Subset of TransformControls' internal (dynamically-defined) properties that
// aren't part of its public TypeScript surface but are needed to reproduce
// the rotation gizmo's own ring geometry for marker placement.
interface TransformControlsInternal {
  axis: 'X' | 'Y' | 'Z' | 'E' | 'XY' | 'YZ' | 'XZ' | 'XYZ' | 'XYZE' | null;
  eye: THREE.Vector3;
  pointStart: THREE.Vector3;
  size: number;
}

// Mirrors TransformControlsGizmo's own handle-scale computation so our
// markers sit at the same radius as the rendered rotation ring.
function computeGizmoScaleFactor(camera: THREE.Camera, worldPos: THREE.Vector3): number {
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const ortho = camera as THREE.OrthographicCamera;
    return (ortho.top - ortho.bottom) / ortho.zoom;
  }
  const persp = camera as THREE.PerspectiveCamera;
  const dist = worldPos.distanceTo(camera.position);
  return dist * Math.min((1.9 * Math.tan((Math.PI * persp.fov) / 360)) / persp.zoom, 7);
}

function rotateAxisVectorFor(axis: TransformControlsInternal['axis'], eye: THREE.Vector3): THREE.Vector3 | null {
  if (axis === 'X') return new THREE.Vector3(1, 0, 0);
  if (axis === 'Y') return new THREE.Vector3(0, 1, 0);
  if (axis === 'Z') return new THREE.Vector3(0, 0, 1);
  if (axis === 'E') return eye.clone().normalize();
  return null;
}

// Any unit vector perpendicular to v — used as a fallback reference direction
// when the drag's grab point can't be projected onto the rotation plane.
function arbitraryPerpendicular(v: THREE.Vector3): THREE.Vector3 {
  const helper = Math.abs(v.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3().crossVectors(helper, v).normalize();
}

/**
 * Live state exposed to the TransformDeltaOverlay during a drag.
 * Null when no drag is in progress.
 */
export interface DragOverlayState {
  mode: TransformMode;
  objectPos: THREE.Vector3;    // current world position of the dragged mesh
  deltaPos: THREE.Vector3;     // translate: (current - start) in world space
  deltaEuler: THREE.Euler;     // rotate: delta euler (current - start)
  scaleRatio: THREE.Vector3;   // scale: current / start per axis
}

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
): { isDraggingRef: RefObject<boolean>; dragOverlayRef: RefObject<DragOverlayState | null> } {
  const isDraggingRef = useRef(false);
  const dragOverlayRef = useRef<DragOverlayState | null>(null);

  useEffect(() => {
    if (!threeRef.current) return;
    const { scene, camera, renderer } = threeRef.current;

    const tc = new TransformControls(camera, renderer.domElement);
    tc.setMode('translate');
    tc.size = GIZMO_SIZE;
    // In Three.js r162+, TransformControls extends Controls (not Object3D).
    // Add the visual helper to the scene; the controls object itself is not an Object3D.
    const tcHelper = tc.getHelper();
    tcHelper.userData.isHelper = true;
    scene.add(tcHelper);

    // Vertex snap indicator — small yellow sphere shown at the snap target
    const snapIndicatorGeo = new THREE.SphereGeometry(1, 8, 6);
    const snapIndicatorMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, depthTest: false });
    const snapIndicator = new THREE.Mesh(snapIndicatorGeo, snapIndicatorMat);
    snapIndicator.visible = false;
    snapIndicator.renderOrder = 999;
    snapIndicator.userData.isHelper = true;
    scene.add(snapIndicator);

    // Rotation snap markers — radial tick marks spaced every 15° just outside
    // the active rotation ring, like the rays around a child's drawing of a
    // sun. Normally dim; the one under the mouse lights up and pulls the
    // rotation to its exact angle.
    const rotateMarkGeo = new THREE.BoxGeometry(1, 1, 1);
    const rotateMarkMatNormal = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.45, transparent: true, depthTest: false });
    const rotateMarkMatActive = new THREE.MeshBasicMaterial({ color: 0xffdd00, depthTest: false });
    const rotateMarkGroup = new THREE.Group();
    rotateMarkGroup.userData.isHelper = true;
    const rotateMarkMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < ROTATE_MARK_COUNT; i++) {
      const mark = new THREE.Mesh(rotateMarkGeo, rotateMarkMatNormal);
      mark.renderOrder = 999;
      mark.visible = false;
      rotateMarkGroup.add(mark);
      rotateMarkMeshes.push(mark);
    }
    scene.add(rotateMarkGroup);

    // Live mouse position (CSS px relative to the canvas), kept up to date by
    // a permanent pointermove listener so rotate-snap can hit-test it even
    // while TransformControls holds pointer capture during a drag.
    const lastPointerPx = { x: 0, y: 0 };
    const onDomPointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      lastPointerPx.x = event.clientX - rect.left;
      lastPointerPx.y = event.clientY - rect.top;
    };
    renderer.domElement.addEventListener('pointermove', onDomPointerMove);

    // Rotation snap state — populated when a rotate drag starts on a valid axis
    let rotateAxisVec: THREE.Vector3 | null = null;
    let rotateMarkAngles: number[] = [];
    let rotateMarkPositions: THREE.Vector3[] = [];
    let rotateMarkSnapPx = ROTATE_MARK_SNAP_PX_MAX;

    // Drag state — populated on drag start, consumed on drag end
    let dragIds: string[] = [];
    let snapCandidates: THREE.Vector3[] = [];
    let dragBeforeTransforms: Transform[] = [];
    let startPrimary = new THREE.Vector3();
    const startSecondariesPos = new Map<string, THREE.Vector3>();

    // Overlay tracking — start values captured at drag begin
    let startPos = new THREE.Vector3();
    let startEuler = new THREE.Euler();
    let startScale = new THREE.Vector3(1, 1, 1);
    let startQuaternion = new THREE.Quaternion();

    const onDraggingChanged = (event: { value: unknown }) => {
      const dragging = event.value as boolean;
      isDraggingRef.current = dragging;
      if (orbitControlsRef.current) {
        orbitControlsRef.current.enabled = !dragging;
      }

      if (dragging && tc.object) {
        // Capture before-state from store for all selected nodes
        const { selectedIds, nodes, transformMode } = useSceneStore.getState();
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

        // Collect vertex snap candidates from all visible non-dragged meshes
        if (useSceneStore.getState().vertexSnapEnabled) {
          const draggedSet = new Set(dragIds);
          snapCandidates = [];
          const tempV = new THREE.Vector3();
          scene.updateMatrixWorld();
          scene.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh) || !obj.visible) return;
            if (draggedSet.has(obj.userData.nodeId as string)) return;
            const positions = obj.geometry.attributes.position;
            if (!positions) return;
            for (let i = 0; i < positions.count; i++) {
              snapCandidates.push(tempV.fromBufferAttribute(positions, i).applyMatrix4(obj.matrixWorld).clone());
            }
          });
        }

        // Capture start transform for the drag overlay
        startPos = tc.object.position.clone();
        startEuler = tc.object.rotation.clone();
        startScale = tc.object.scale.clone();
        startQuaternion = tc.object.quaternion.clone();

        // Set up rotation snap markers for the axis being dragged
        const tcInternal = tc as unknown as TransformControlsInternal;
        rotateAxisVec = transformMode === 'rotate' ? rotateAxisVectorFor(tcInternal.axis, tcInternal.eye) : null;
        rotateMarkAngles = [];
        rotateMarkPositions = [];
        if (rotateAxisVec) {
          const center = tc.object.position.clone();
          const axisScale = tcInternal.axis === 'E' ? 0.75 : 0.5;
          const factor = computeGizmoScaleFactor(camera, center);
          const radius = axisScale * factor * (tcInternal.size / 4);

          const proj = tcInternal.pointStart.clone().projectOnPlane(rotateAxisVec);
          const refDir = proj.lengthSq() > 1e-8 ? proj.normalize() : arbitraryPerpendicular(rotateAxisVec);
          const basisB = new THREE.Vector3().crossVectors(rotateAxisVec, refDir).normalize();
          const increment = (Math.PI * 2) / ROTATE_MARK_COUNT;

          const gap = radius * ROTATE_MARK_GAP_FRACTION;
          const length = radius * ROTATE_MARK_LENGTH_FRACTION;
          const thickness = radius * ROTATE_MARK_THICKNESS_FRACTION;
          const basisMatrix = new THREE.Matrix4();

          for (let i = 0; i < ROTATE_MARK_COUNT; i++) {
            const angle = i * increment;
            // Radial (outward) direction for this tick, and its in-plane tangent.
            const dir = refDir.clone().multiplyScalar(Math.cos(angle))
              .add(basisB.clone().multiplyScalar(Math.sin(angle)))
              .normalize();
            const tangent = new THREE.Vector3().crossVectors(rotateAxisVec, dir).normalize();

            const innerDist = radius + gap;
            const midPos = center.clone().addScaledVector(dir, innerDist + length / 2);
            rotateMarkAngles.push(angle);
            rotateMarkPositions.push(midPos);

            const mark = rotateMarkMeshes[i];
            mark.position.copy(midPos);
            // Orient the tick so its long axis points radially outward (dir),
            // its width runs along the ring's tangent, and it stays flat
            // within the ring's own plane (thin along the axis/normal).
            basisMatrix.makeBasis(dir, tangent, rotateAxisVec);
            mark.quaternion.setFromRotationMatrix(basisMatrix);
            mark.scale.set(length, thickness, thickness);
            mark.material = rotateMarkMatNormal;
            mark.visible = true;
          }

          // Size the hover-snap radius off the actual on-screen gap between
          // adjacent markers so it captures a marker without also covering
          // its neighbors (which would make rotation snap everywhere).
          const rect = renderer.domElement.getBoundingClientRect();
          const ndcA = rotateMarkPositions[0].clone().project(camera);
          const ndcB = rotateMarkPositions[1].clone().project(camera);
          const dxPx = ((ndcA.x - ndcB.x) / 2) * rect.width;
          const dyPx = ((ndcA.y - ndcB.y) / 2) * rect.height;
          const spacingPx = Math.hypot(dxPx, dyPx);
          rotateMarkSnapPx = THREE.MathUtils.clamp(
            spacingPx * ROTATE_MARK_SNAP_SPACING_FRACTION,
            ROTATE_MARK_SNAP_PX_MIN,
            ROTATE_MARK_SNAP_PX_MAX,
          );

          if (import.meta.env.VITE_E2E && window.__E2E__) {
            window.__E2E__.rotateMarkers = rotateMarkPositions.map((pos, i) => ({
              angleDeg: THREE.MathUtils.radToDeg(rotateMarkAngles[i]),
              ...worldToPagePx(pos, camera, renderer.domElement),
            }));
          }
        } else {
          rotateMarkMeshes.forEach((mark) => { mark.visible = false; });
          if (import.meta.env.VITE_E2E && window.__E2E__) {
            window.__E2E__.rotateMarkers = null;
          }
        }
      }

      if (!dragging && tc.object && dragIds.length > 0) {
        dragOverlayRef.current = null;

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
        snapCandidates = [];
        snapIndicator.visible = false;
      }

      if (!dragging) {
        dragOverlayRef.current = null;
        rotateAxisVec = null;
        rotateMarkAngles = [];
        rotateMarkPositions = [];
        rotateMarkMeshes.forEach((mark) => { mark.visible = false; mark.material = rotateMarkMatNormal; });
        if (import.meta.env.VITE_E2E && window.__E2E__) {
          window.__E2E__.rotateMarkers = null;
        }
      }
    };

    // Move secondary meshes in real-time to match the primary's translation delta.
    const onChange = () => {
      if (!isDraggingRef.current || !tc.object) return;

      const { transformMode, nodes } = useSceneStore.getState();

      // Scale sensitivity: TransformControls maps drag distance straight to
      // scale (a 1:1 ratio), which reads as too twitchy. Damp the change from
      // the drag-start scale by a constant factor, applied the same way
      // whether growing or shrinking, so the mapping stays linear and
      // symmetric — just less sensitive overall.
      if (transformMode === 'scale') {
        const dampen = (start: number, current: number): number =>
          start + (current - start) * SCALE_SENSITIVITY;
        tc.object.scale.set(
          dampen(startScale.x, tc.object.scale.x),
          dampen(startScale.y, tc.object.scale.y),
          dampen(startScale.z, tc.object.scale.z),
        );
      }

      // Rotation snap: rotation is free by default. Markers are placed every
      // 15° around the active rotation ring at drag start; only when the
      // mouse is hovering within rotateMarkSnapPx of one do we override the
      // free rotation TransformControls just computed with that marker's
      // exact angle.
      if (transformMode === 'rotate' && rotateAxisVec && rotateMarkPositions.length > 0) {
        const rect = renderer.domElement.getBoundingClientRect();
        let bestIdx = -1;
        let bestDistSq = rotateMarkSnapPx * rotateMarkSnapPx;
        const ndc = new THREE.Vector3();
        for (let i = 0; i < rotateMarkPositions.length; i++) {
          ndc.copy(rotateMarkPositions[i]).project(camera);
          if (ndc.z > 1) continue; // behind camera
          const px = (ndc.x + 1) / 2 * rect.width;
          const py = (1 - ndc.y) / 2 * rect.height;
          const dx = px - lastPointerPx.x;
          const dy = py - lastPointerPx.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) { bestDistSq = dSq; bestIdx = i; }
        }

        rotateMarkMeshes.forEach((mark, i) => {
          mark.material = i === bestIdx ? rotateMarkMatActive : rotateMarkMatNormal;
        });

        if (bestIdx >= 0) {
          const snappedDelta = new THREE.Quaternion().setFromAxisAngle(rotateAxisVec, rotateMarkAngles[bestIdx]);
          tc.object.quaternion.copy(startQuaternion).multiply(snappedDelta);
        }
      }

      // Vertex snap: find the nearest candidate vertex within VERTEX_SNAP_PX screen pixels
      // and override the object position to snap to it.
      if (transformMode === 'translate' && useSceneStore.getState().vertexSnapEnabled && snapCandidates.length > 0) {
        const size = renderer.getSize(new THREE.Vector2());
        const objNDC = tc.object.position.clone().project(camera);
        const objPxX = (objNDC.x + 1) / 2 * size.x;
        const objPxY = (1 - objNDC.y) / 2 * size.y;

        let bestDistSq = VERTEX_SNAP_PX * VERTEX_SNAP_PX;
        let bestVertex: THREE.Vector3 | null = null;
        const vNDC = new THREE.Vector3();
        for (const v of snapCandidates) {
          vNDC.copy(v).project(camera);
          if (vNDC.z > 1) continue; // behind camera
          const dx = objPxX - (vNDC.x + 1) / 2 * size.x;
          const dy = objPxY - (1 - vNDC.y) / 2 * size.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) { bestDistSq = dSq; bestVertex = v; }
        }

        if (bestVertex) {
          tc.object.position.copy(bestVertex);
          snapIndicator.position.copy(bestVertex);
          // Scale indicator so it appears roughly constant size on screen
          const dist = camera.position.distanceTo(bestVertex);
          snapIndicator.scale.setScalar(dist * 0.018);
          snapIndicator.visible = true;
        } else {
          snapIndicator.visible = false;
        }
      } else {
        snapIndicator.visible = false;
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

      // Update drag overlay state
      const cur = tc.object;
      dragOverlayRef.current = {
        mode: transformMode,
        objectPos: cur.position.clone(),
        deltaPos: cur.position.clone().sub(startPos),
        deltaEuler: new THREE.Euler(
          cur.rotation.x - startEuler.x,
          cur.rotation.y - startEuler.y,
          cur.rotation.z - startEuler.z,
        ),
        scaleRatio: new THREE.Vector3(
          startScale.x !== 0 ? cur.scale.x / startScale.x : 1,
          startScale.y !== 0 ? cur.scale.y / startScale.y : 1,
          startScale.z !== 0 ? cur.scale.z / startScale.z : 1,
        ),
      };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tc.addEventListener('dragging-changed', onDraggingChanged as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tc.addEventListener('change', onChange as any);

    // Reattach TC and update mode/axis-constraint whenever selection or transformMode changes
    const unsubscribe = useSceneStore.subscribe((state) => {
      const { selectedIds, transformMode, transformAxisConstraint, gridSnap } = state;

      // Grid snap (translate/scale only — rotation uses its own proximity snap below)
      const snapValue = gridSnap > 0 ? gridSnap : null;
      tc.setTranslationSnap(snapValue);
      tc.setScaleSnap(snapValue);

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

      // Axis constraint: hide the axes that are not constrained
      if (transformAxisConstraint === null) {
        tc.showX = true;
        tc.showY = true;
        tc.showZ = true;
      } else {
        tc.showX = transformAxisConstraint === 'X';
        tc.showY = transformAxisConstraint === 'Y';
        tc.showZ = transformAxisConstraint === 'Z';
      }
    });

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tc.removeEventListener('dragging-changed', onDraggingChanged as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tc.removeEventListener('change', onChange as any);
      unsubscribe();
      renderer.domElement.removeEventListener('pointermove', onDomPointerMove);
      tc.detach();
      scene.remove(tcHelper);
      scene.remove(snapIndicator);
      scene.remove(rotateMarkGroup);
      snapIndicatorGeo.dispose();
      snapIndicatorMat.dispose();
      rotateMarkGeo.dispose();
      rotateMarkMatNormal.dispose();
      rotateMarkMatActive.dispose();
      tc.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isDraggingRef, dragOverlayRef };
}
