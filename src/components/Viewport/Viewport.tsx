import { useRef } from 'react';
import './Viewport.css';
import { useThreeSetup } from './useThreeSetup';
import { useSceneSync } from './useSceneSync';
import { useOrbitControls } from './useOrbitControls';
import { useTransformControls } from './useTransformControls';
import { useRaycasting } from './useRaycasting';

export default function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onBeforeRender = useRef<(() => void) | null>(null);

  // Each hook runs its useEffect in call order within the same commit.
  // useThreeSetup populates threeRef.current first, so subsequent hooks
  // can safely read it inside their own effects.
  const threeRef = useThreeSetup(canvasRef, onBeforeRender);
  const meshMapRef = useSceneSync(threeRef);
  const orbitControlsRef = useOrbitControls(threeRef, onBeforeRender);
  const isDraggingRef = useTransformControls(threeRef, meshMapRef, orbitControlsRef);
  useRaycasting(threeRef, meshMapRef, isDraggingRef);

  return <canvas ref={canvasRef} className="viewport-canvas" />;
}
