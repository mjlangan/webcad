import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';

export interface ThreeSetup {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export function useThreeSetup(
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
  onBeforeRender: MutableRefObject<(() => void) | null>,
): MutableRefObject<ThreeSetup | null> {
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
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(4, 4, 6);
    camera.lookAt(0, 0, 0);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(8, 12, 6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    scene.add(dirLight);

    // Grid
    const grid = new THREE.GridHelper(20, 20, '#444444', '#333333');
    scene.add(grid);

    // Axes helper (Phase 1 orientation reference)
    const axes = new THREE.AxesHelper(1.5);
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
      onBeforeRender.current?.();
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
      renderer.dispose();
      renderer.forceContextLoss(); // essential for React Strict Mode double-mount
      setupRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return setupRef;
}
