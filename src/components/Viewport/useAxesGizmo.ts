import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import type { ThreeSetup } from './useThreeSetup';

const SIZE = 80; // CSS pixels
const LABEL_OFFSET = 0.38;
const ARROW_LENGTH = 1.15;
const HEAD_LEN = 0.28;
const HEAD_WIDTH = 0.16;
const CAM_DIST = 10;
const ORTHO_EXTENT = 1.8;

function makeLabel(text: string, color: string): { sprite: THREE.Sprite; texture: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 44px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 34);
  const texture = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.55, 0.55, 1);
  return { sprite, texture };
}

export function useAxesGizmo(
  gizmoCanvasRef: RefObject<HTMLCanvasElement | null>,
  threeRef: RefObject<ThreeSetup | null>,
): void {
  useEffect(() => {
    const canvas = gizmoCanvasRef.current;
    const three = threeRef.current;
    if (!canvas || !three) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(SIZE, SIZE, false);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      -ORTHO_EXTENT, ORTHO_EXTENT, ORTHO_EXTENT, -ORTHO_EXTENT, 0.1, 100,
    );

    const origin = new THREE.Vector3(0, 0, 0);
    const arrowX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, ARROW_LENGTH, 0xff3333, HEAD_LEN, HEAD_WIDTH);
    const arrowY = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, ARROW_LENGTH, 0x44dd44, HEAD_LEN, HEAD_WIDTH);
    const arrowZ = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, ARROW_LENGTH, 0x4488ff, HEAD_LEN, HEAD_WIDTH);
    scene.add(arrowX, arrowY, arrowZ);

    const labelDist = ARROW_LENGTH + LABEL_OFFSET;
    const { sprite: labelX, texture: texX } = makeLabel('X', '#ff5555');
    const { sprite: labelY, texture: texY } = makeLabel('Y', '#55ee55');
    const { sprite: labelZ, texture: texZ } = makeLabel('Z', '#5599ff');
    labelX.position.set(labelDist, 0, 0);
    labelY.position.set(0, labelDist, 0);
    labelZ.position.set(0, 0, labelDist);
    scene.add(labelX, labelY, labelZ);

    const localZ = new THREE.Vector3();
    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      camera.quaternion.copy(three.camera.quaternion);
      localZ.set(0, 0, 1).applyQuaternion(camera.quaternion);
      camera.position.copy(localZ).multiplyScalar(CAM_DIST);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      texX.dispose();
      texY.dispose();
      texZ.dispose();
      renderer.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
