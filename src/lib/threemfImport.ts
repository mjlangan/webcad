import * as THREE from 'three';
import { unzipSync } from 'fflate';
import { meshGeometryMap } from './meshGeometryMap';
import { useSceneStore } from '../store/useSceneStore';

export interface ParsedMeshDef {
  name: string;
  geometry: THREE.BufferGeometry;
}

/** Parses a 3MF model XML string and returns geometry definitions. Requires DOMParser. */
export function parseModelXml(xmlText: string): ParsedMeshDef[] {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const results: ParsedMeshDef[] = [];

  const objects = doc.querySelectorAll('resources > object');
  for (const obj of objects) {
    if (obj.getAttribute('type') === 'support') continue;

    const name = obj.getAttribute('name') ?? 'Imported';

    const vertexEls = obj.querySelectorAll('vertices > vertex');
    const triangleEls = obj.querySelectorAll('triangles > triangle');

    if (vertexEls.length === 0 || triangleEls.length === 0) continue;

    const positions = new Float32Array(vertexEls.length * 3);
    vertexEls.forEach((v, i) => {
      positions[i * 3]     = parseFloat(v.getAttribute('x') ?? '0');
      positions[i * 3 + 1] = parseFloat(v.getAttribute('y') ?? '0');
      positions[i * 3 + 2] = parseFloat(v.getAttribute('z') ?? '0');
    });

    const indices = new Uint32Array(triangleEls.length * 3);
    triangleEls.forEach((t, i) => {
      indices[i * 3]     = parseInt(t.getAttribute('v1') ?? '0', 10);
      indices[i * 3 + 1] = parseInt(t.getAttribute('v2') ?? '0', 10);
      indices[i * 3 + 2] = parseInt(t.getAttribute('v3') ?? '0', 10);
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    results.push({ name, geometry: geo });
  }

  return results;
}

/** Unzips a 3MF Uint8Array and parses its model XML. Requires DOMParser. */
export function parseMeshDefsFromZip(zipBytes: Uint8Array): ParsedMeshDef[] {
  const files = unzipSync(zipBytes);
  const modelData = files['3D/3dmodel.model'];
  if (!modelData) throw new Error('No 3D model found in 3MF file.');
  const xmlText = new TextDecoder().decode(modelData);
  return parseModelXml(xmlText);
}

export function import3mfFile(file: File): void {
  const reader = new FileReader();

  reader.onload = (e) => {
    const buffer = e.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    let meshDefs: ParsedMeshDef[];
    try {
      meshDefs = parseMeshDefsFromZip(new Uint8Array(buffer));
    } catch {
      window.alert('Failed to read or parse 3MF file.');
      return;
    }

    if (meshDefs.length === 0) {
      window.alert('No mesh objects found in 3MF file.');
      return;
    }

    const { addNode } = useSceneStore.getState();

    for (const { name, geometry } of meshDefs) {
      geometry.center();
      geometry.computeBoundingBox();
      const yOffset = geometry.boundingBox?.max.y ?? 0;

      const meshId = crypto.randomUUID();
      meshGeometryMap.set(meshId, geometry);
      addNode({ type: 'imported', meshId, originalName: name }, yOffset);
    }
  };

  reader.readAsArrayBuffer(file);
}
