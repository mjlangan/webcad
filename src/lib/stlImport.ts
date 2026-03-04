import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { meshGeometryMap } from './meshGeometryMap';
import { useSceneStore } from '../store/useSceneStore';

const loader = new STLLoader();

export function importStlFile(file: File): void {
  const reader = new FileReader();

  reader.onload = (e) => {
    const buffer = e.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    const geometry = loader.parse(buffer);

    // Centre geometry so origin is at the mesh centroid, then lift to sit on grid
    geometry.center();
    geometry.computeBoundingBox();
    const yOffset = geometry.boundingBox?.max.y ?? 0;

    // Ensure normals exist — ASCII STLs may omit them
    geometry.computeVertexNormals();

    const meshId = crypto.randomUUID();
    const originalName = file.name.replace(/\.stl$/i, '');

    meshGeometryMap.set(meshId, geometry);

    useSceneStore
      .getState()
      .addNode({ type: 'imported', meshId, originalName }, [0, yOffset, 0]);
  };

  reader.readAsArrayBuffer(file);
}
