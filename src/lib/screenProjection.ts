import * as THREE from 'three';

/** Project a world-space point to pixel coordinates within the canvas element's own box (0,0 = canvas top-left). */
export function worldToCanvasPx(
  worldPos: THREE.Vector3,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const ndc = worldPos.clone().project(camera);
  return {
    x: (ndc.x + 1) / 2 * canvas.clientWidth,
    y: (1 - ndc.y) / 2 * canvas.clientHeight,
  };
}

/** Project a world-space point to page/viewport pixel coordinates (canvas px + the canvas's own bounding-rect offset). */
export function worldToPagePx(
  worldPos: THREE.Vector3,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const local = worldToCanvasPx(worldPos, camera, canvas);
  return { x: rect.left + local.x, y: rect.top + local.y };
}
