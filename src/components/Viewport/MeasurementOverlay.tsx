import { useEffect, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { ThreeSetup } from './useThreeSetup';
import type { MeasureOverlayState } from './useMeasurement';
import { usePreferencesStore, formatUnit } from '../../store/usePreferencesStore';

interface Props {
  threeRef: RefObject<ThreeSetup | null>;
  measureOverlayRef: RefObject<MeasureOverlayState | null>;
}

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

export default function MeasurementOverlay({ threeRef, measureOverlayRef }: Props) {
  const [label, setLabel] = useState<{ x: number; y: number; text: string } | null>(null);
  const unitSystem = usePreferencesStore((s) => s.unitSystem);

  useEffect(() => {
    let rafId: number;

    function update() {
      const overlay = measureOverlayRef.current;
      const three = threeRef.current;

      if (!overlay || !three) {
        setLabel(null);
        rafId = requestAnimationFrame(update);
        return;
      }

      const { camera, renderer } = three;
      const canvas = renderer.domElement;
      const screen = worldToCanvas(overlay.midpoint, camera as THREE.PerspectiveCamera, canvas);
      setLabel({ x: screen.x, y: screen.y, text: formatUnit(overlay.distance, unitSystem) });
      rafId = requestAnimationFrame(update);
    }

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [threeRef, measureOverlayRef, unitSystem]);

  if (!label) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: label.x,
          top: label.y,
          transform: 'translate(-50%, -50%)',
          fontSize: 13,
          fontFamily: 'monospace',
          fontWeight: 700,
          color: '#ffcc00',
          background: 'rgba(0,0,0,0.65)',
          padding: '2px 7px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          userSelect: 'none',
          border: '1px solid rgba(255,204,0,0.4)',
        }}
      >
        {label.text}
      </div>
    </div>
  );
}
