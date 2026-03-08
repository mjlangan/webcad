import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { meshGeometryMap } from './meshGeometryMap';
import { useSceneStore } from '../store/useSceneStore';

const loader = new OBJLoader();

export interface ParsedObjMesh {
  originalName: string;
  geometry: THREE.BufferGeometry;
  yOffset: number;
}

/** Parses OBJ text and returns a list of centered, lifted geometries ready for import. */
export function parseObjText(text: string, baseName: string): ParsedObjMesh[] {
  const group = loader.parse(text);

  const meshes: THREE.Mesh[] = [];
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      meshes.push(child);
    }
  });

  return meshes.map((mesh, i) => {
    const geo = (mesh.geometry as THREE.BufferGeometry).clone();
    geo.center();
    geo.computeBoundingBox();
    const yOffset = geo.boundingBox?.max.y ?? 0;
    geo.computeVertexNormals();

    const originalName =
      mesh.name && mesh.name !== '' ? mesh.name : meshes.length > 1 ? `${baseName} ${i + 1}` : baseName;

    return { originalName, geometry: geo, yOffset };
  });
}

export function importObjFile(file: File): void {
  const reader = new FileReader();

  reader.onload = (e) => {
    const text = e.target?.result;
    if (typeof text !== 'string') return;

    const baseName = file.name.replace(/\.obj$/i, '');
    const parsed = parseObjText(text, baseName);

    if (parsed.length === 0) {
      window.alert('No mesh geometry found in OBJ file.');
      return;
    }

    const { addNode } = useSceneStore.getState();

    for (const { originalName, geometry, yOffset } of parsed) {
      const meshId = crypto.randomUUID();
      meshGeometryMap.set(meshId, geometry);
      addNode({ type: 'imported', meshId, originalName }, yOffset);
    }
  };

  reader.readAsText(file);
}
