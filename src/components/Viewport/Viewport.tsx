import { useRef, type RefObject } from 'react';
import './Viewport.css';
import { useThreeSetup } from './useThreeSetup';
import { useSceneSync } from './useSceneSync';
import { useOrbitControls } from './useOrbitControls';
import { useTransformControls } from './useTransformControls';
import { useRaycasting } from './useRaycasting';
import { useCameraPresets } from './useCameraPresets';
import { useBoxSelect } from './useBoxSelect';
import type { ViewportActions } from '../../types/viewport';

interface ViewportProps {
  actionsRef: RefObject<ViewportActions | null>;
}

export default function Viewport({ actionsRef }: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onBeforeRenderRef = useRef<(() => void) | null>(null);

  // Each hook runs its useEffect in call order within the same commit.
  // useThreeSetup populates threeRef.current first, so subsequent hooks
  // can safely read it inside their own effects.
  const threeRef = useThreeSetup(canvasRef, onBeforeRenderRef);
  const meshMapRef = useSceneSync(threeRef);
  const orbitControlsRef = useOrbitControls(threeRef, onBeforeRenderRef);
  const isDraggingRef = useTransformControls(threeRef, meshMapRef, orbitControlsRef);
  useRaycasting(threeRef, meshMapRef, isDraggingRef);
  // Called last so orbitControlsRef is already populated
  useCameraPresets(threeRef, orbitControlsRef, actionsRef);
  const boxRect = useBoxSelect(threeRef, meshMapRef, isDraggingRef);

  return (
    <div className="viewport-wrapper">
      <canvas ref={canvasRef} className="viewport-canvas" />
      {boxRect && (
        <div
          className="box-select-rect"
          style={{ left: boxRect.x, top: boxRect.y, width: boxRect.w, height: boxRect.h }}
        />
      )}
    </div>
  );
}
