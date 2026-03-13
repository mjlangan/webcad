import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { ThreeSetup } from './useThreeSetup';
import { useSceneStore } from '../../store/useSceneStore';

export interface MeasureOverlayState {
  pointA: THREE.Vector3;
  pointB: THREE.Vector3;
  midpoint: THREE.Vector3;
  distance: number;
}

function makeMarker(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1.5, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffcc00, depthTest: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 999;
  return mesh;
}

function makeLine(): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const mat = new THREE.LineBasicMaterial({ color: 0xffcc00, depthTest: false, linewidth: 2 });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 999;
  return line;
}

/**
 * Two-click measurement tool.
 * Click once to set point A, click again to set point B and show distance.
 * Subsequent clicks start a new measurement. Escape exits measure mode.
 */
export function useMeasurement(
  threeRef: RefObject<ThreeSetup | null>,
  meshMapRef: RefObject<Map<string, THREE.Mesh>>,
  isDraggingRef: RefObject<boolean>,
): RefObject<MeasureOverlayState | null> {
  const overlayRef = useRef<MeasureOverlayState | null>(null);

  useEffect(() => {
    if (!threeRef.current) return;
    const { scene, camera, renderer } = threeRef.current;
    const canvas = renderer.domElement;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    // Three.js objects for visualization
    const markerA = makeMarker();
    const markerB = makeMarker();
    const line = makeLine();
    markerA.visible = false;
    markerB.visible = false;
    line.visible = false;
    scene.add(markerA, markerB, line);

    // 'idle' = no points picked, 'one' = first point set, 'two' = both points set
    let phase: 'idle' | 'one' | 'two' = 'idle';
    const pointA = new THREE.Vector3();
    const pointB = new THREE.Vector3();

    function updatePointer(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function raycastHit(e: PointerEvent): THREE.Vector3 | null {
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);

      // Try hitting a mesh surface first
      const meshes = Array.from(meshMapRef.current?.values() ?? []).filter((m) => m.visible);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) return hits[0].point.clone();

      // Fall back to workplane intersection
      const { workplane } = useSceneStore.getState();
      const normal = new THREE.Vector3(...workplane.normal).normalize();
      const origin = new THREE.Vector3(...workplane.origin);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
      const target = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(plane, target);
      return hit ? target.clone() : null;
    }

    function updateLine() {
      const positions = line.geometry.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(0, pointA.x, pointA.y, pointA.z);
      positions.setXYZ(1, pointB.x, pointB.y, pointB.z);
      positions.needsUpdate = true;
    }

    function clearAll() {
      markerA.visible = false;
      markerB.visible = false;
      line.visible = false;
      overlayRef.current = null;
      phase = 'idle';
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const { measureMode } = useSceneStore.getState();
      if (!measureMode || isDraggingRef.current) return;

      const hit = raycastHit(e);
      if (!hit) return;

      if (phase === 'idle' || phase === 'two') {
        // Start a new measurement from this point
        pointA.copy(hit);
        markerA.position.copy(pointA);
        markerA.visible = true;
        markerB.visible = false;
        line.visible = false;
        overlayRef.current = null;
        phase = 'one';
      } else {
        // Second click — complete the measurement
        pointB.copy(hit);
        markerB.position.copy(pointB);
        markerB.visible = true;
        updateLine();
        line.visible = true;
        const dist = pointA.distanceTo(pointB);
        const mid = pointA.clone().lerp(pointB, 0.5);
        overlayRef.current = { pointA: pointA.clone(), pointB: pointB.clone(), midpoint: mid, distance: dist };
        phase = 'two';
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const { measureMode } = useSceneStore.getState();
      if (measureMode && e.key === 'Escape') {
        clearAll();
        useSceneStore.getState().setMeasureMode(false);
      }
    };

    // When measureMode is turned off externally (e.g. toolbar button), clean up
    const unsubscribe = useSceneStore.subscribe((state, prev) => {
      if (prev.measureMode && !state.measureMode) {
        clearAll();
      }
    });

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      unsubscribe();
      scene.remove(markerA, markerB, line);
      markerA.geometry.dispose();
      markerB.geometry.dispose();
      line.geometry.dispose();
      (markerA.material as THREE.Material).dispose();
      (line.material as THREE.Material).dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return overlayRef;
}
