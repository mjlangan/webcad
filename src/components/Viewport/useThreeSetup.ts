import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';

export interface ThreeSetup {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export function useThreeSetup(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  onBeforeRenderRef: RefObject<(() => void) | null>,
): RefObject<ThreeSetup | null> {
  const setupRef = useRef<ThreeSetup | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Renderer — setSize(w, h, false) prevents Three.js injecting inline styles
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1a1a');

    // Camera
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000);
    camera.position.set(80, 80, 120);
    camera.lookAt(0, 0, 0);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(160, 240, 120);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    scene.add(dirLight);

    // Grid — 200mm × 200mm with 10mm divisions
    const grid = new THREE.GridHelper(200, 20, '#444444', '#333333');
    scene.add(grid);

    // Axes helper — 30mm arms
    const axes = new THREE.AxesHelper(30);
    scene.add(axes);

    // Write setup to ref — downstream hooks' effects run after this one
    setupRef.current = { scene, camera, renderer };

    // Resize — arrow function so TypeScript preserves canvas narrowing in closure
    const updateSize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    };
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(canvas);
    updateSize();

    // RAF render loop
    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      onBeforeRenderRef.current?.();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m: THREE.Material) => m.dispose());
        }
      });
      // dispose() releases GPU resources (buffers, programs, textures).
      // forceContextLoss() is intentionally omitted: it calls WEBGL_lose_context.loseContext(),
      // which marks the canvas's WebGL context as lost. On React Strict Mode remount,
      // canvas.getContext('webgl2') returns the same lost context object (per the WebGL spec),
      // causing Three.js to crash when it calls getShaderPrecisionFormat on the lost context.
      // The raw GL context handle will be garbage collected after dispose().
      renderer.dispose();
      setupRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return setupRef;
}
