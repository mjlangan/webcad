import { useEffect, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { ThreeSetup } from './useThreeSetup';
import type { DragOverlayState } from './useTransformControls';
import { usePreferencesStore, toDisplayUnit } from '../../store/usePreferencesStore';

interface LabelInfo {
  x: number;
  y: number;
  text: string;
  axis: 'X' | 'Y' | 'Z';
  active: boolean;  // whether this axis is the one being dragged
}

/** Project a world-space point to canvas pixel coordinates. */
function worldToCanvas(
  worldPos: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const ndc = worldPos.clone().project(camera);
  return {
    x: (ndc.x + 1) / 2 * canvas.clientWidth,
    y: (-ndc.y + 1) / 2 * canvas.clientHeight,
  };
}

/** Estimate the world-space length of a gizmo arm (tip of the TC arrow). */
function gizmoArmLength(
  objectPos: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
): number {
  const dist = camera.position.distanceTo(objectPos);
  // Matches Three.js TransformControls internal scale: dist * min(1, fov/36) * 0.15
  // We multiply by a bit more so the label lands just beyond the arrow tip
  const fovFactor = Math.min(1, camera.fov / 36);
  return dist * fovFactor * 0.18;
}

const AXIS_DIRS: Record<'X' | 'Y' | 'Z', THREE.Vector3> = {
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
};

// Axis colors matching Three.js gizmo defaults
const AXIS_COLOR: Record<'X' | 'Y' | 'Z', string> = {
  X: '#ff4444',
  Y: '#44ee44',
  Z: '#4488ff',
};

function fmt(v: number, digits = 2): string {
  const s = Math.abs(v).toFixed(digits);
  return (v < -0.0005 ? '−' : '+') + s;
}

function formatValue(overlay: DragOverlayState, axis: 'X' | 'Y' | 'Z', unitSystem: 'mm' | 'in'): string {
  const { mode, deltaPos, deltaEuler, scaleRatio } = overlay;
  if (mode === 'translate') {
    const mm = axis === 'X' ? deltaPos.x : axis === 'Y' ? deltaPos.y : deltaPos.z;
    const v = toDisplayUnit(mm, unitSystem);
    const suffix = unitSystem === 'in' ? ' in' : ' mm';
    return fmt(v, unitSystem === 'in' ? 4 : 2) + suffix;
  }
  if (mode === 'rotate') {
    const rad = axis === 'X' ? deltaEuler.x : axis === 'Y' ? deltaEuler.y : deltaEuler.z;
    const deg = rad * (180 / Math.PI);
    return fmt(deg, 1) + '°';
  }
  // scale — dimensionless ratio
  const v = axis === 'X' ? scaleRatio.x : axis === 'Y' ? scaleRatio.y : scaleRatio.z;
  return '×' + v.toFixed(3);
}

/** True if this axis has a non-trivial value worth highlighting. */
function isActive(overlay: DragOverlayState, axis: 'X' | 'Y' | 'Z'): boolean {
  const { mode, deltaPos, deltaEuler, scaleRatio } = overlay;
  if (mode === 'translate') {
    const v = axis === 'X' ? deltaPos.x : axis === 'Y' ? deltaPos.y : deltaPos.z;
    return Math.abs(v) > 0.001;
  }
  if (mode === 'rotate') {
    const v = axis === 'X' ? deltaEuler.x : axis === 'Y' ? deltaEuler.y : deltaEuler.z;
    return Math.abs(v) > 0.0001;
  }
  const v = axis === 'X' ? scaleRatio.x : axis === 'Y' ? scaleRatio.y : scaleRatio.z;
  return Math.abs(v - 1) > 0.0005;
}

interface Props {
  threeRef: RefObject<ThreeSetup | null>;
  dragOverlayRef: RefObject<DragOverlayState | null>;
}

export default function TransformDeltaOverlay({ threeRef, dragOverlayRef }: Props) {
  const [labels, setLabels] = useState<LabelInfo[]>([]);
  const unitSystem = usePreferencesStore((s) => s.unitSystem);

  useEffect(() => {
    let rafId: number;

    function update() {
      const overlay = dragOverlayRef.current;
      const three = threeRef.current;

      if (!overlay || !three) {
        setLabels([]);
        rafId = requestAnimationFrame(update);
        return;
      }

      const { camera, renderer } = three;
      const canvas = renderer.domElement;
      const armLength = gizmoArmLength(overlay.objectPos, camera as THREE.PerspectiveCamera);

      const next: LabelInfo[] = (['X', 'Y', 'Z'] as const).map((axis) => {
        const tipWorld = overlay.objectPos.clone().addScaledVector(AXIS_DIRS[axis], armLength);
        const screen = worldToCanvas(tipWorld, camera as THREE.PerspectiveCamera, canvas);
        // Offset the label a few pixels outward from the axis tip in screen space
        const screenOrigin = worldToCanvas(overlay.objectPos, camera as THREE.PerspectiveCamera, canvas);
        const dx = screen.x - screenOrigin.x;
        const dy = screen.y - screenOrigin.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        return {
          x: screen.x + (dx / len) * 10,
          y: screen.y + (dy / len) * 10,
          text: formatValue(overlay, axis, unitSystem),
          axis,
          active: isActive(overlay, axis),
        };
      });

      setLabels(next);
      rafId = requestAnimationFrame(update);
    }

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [threeRef, dragOverlayRef, unitSystem]);

  if (labels.length === 0) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {labels.map(({ x, y, text, axis, active }) => (
        <div
          key={axis}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            transform: 'translate(-50%, -50%)',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: active ? 700 : 400,
            color: active ? AXIS_COLOR[axis] : 'rgba(255,255,255,0.35)',
            background: 'rgba(0,0,0,0.55)',
            padding: '1px 5px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}
        >
          {axis} {text}
        </div>
      ))}
    </div>
  );
}
