import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type { SceneNode, Workplane } from '../types/scene';
import { meshGeometryMap } from './meshGeometryMap';
import { geometryToStl } from './geometryToStl';
import { useSceneStore } from '../store/useSceneStore';
import { undoStack } from '../store/undoStack';

declare global {
  interface Window {
    showSaveFilePicker?(options?: {
      suggestedName?: string;
      types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    }): Promise<FileSystemFileHandle>;
  }
}

export const WEBCAD_VERSION = 1;

export interface WebcadFile {
  version: number;
  savedAt: string;
  data: {
    nodes: SceneNode[];
    workplane: Workplane;
    meshes: Record<string, string>; // meshId → base64-encoded binary STL
  };
}

// ---------------------------------------------------------------------------
// Codec utilities (exported for testing)
// ---------------------------------------------------------------------------

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ---------------------------------------------------------------------------
// Pure serialization / deserialization (no browser I/O, exported for testing)
// ---------------------------------------------------------------------------

/** Builds the .webcad payload object from scene data.  No browser APIs. */
export function buildWebcadPayload(
  nodes: SceneNode[],
  workplane: Workplane,
  meshMap: Map<string, THREE.BufferGeometry>,
): WebcadFile {
  const meshes: Record<string, string> = {};
  for (const node of nodes) {
    if (node.geometry.type === 'imported') {
      const { meshId } = node.geometry;
      if (!meshes[meshId]) {
        const geo = meshMap.get(meshId);
        if (geo) {
          meshes[meshId] = arrayBufferToBase64(geometryToStl(geo));
        }
      }
    }
  }
  return {
    version: WEBCAD_VERSION,
    savedAt: new Date().toISOString(),
    data: { nodes, workplane, meshes },
  };
}

/** Parses a .webcad payload and returns nodes, workplane, and decoded geometries. No browser I/O. */
export function parseWebcadPayload(payload: WebcadFile): {
  nodes: SceneNode[];
  workplane: Workplane;
  meshMap: Map<string, THREE.BufferGeometry>;
} {
  if (payload.version !== WEBCAD_VERSION) {
    throw new Error(`Unrecognized file version: ${payload.version}`);
  }

  const loader = new STLLoader();
  const meshMap = new Map<string, THREE.BufferGeometry>();

  for (const [meshId, base64] of Object.entries(payload.data.meshes)) {
    const buffer = base64ToArrayBuffer(base64);
    const geo = loader.parse(buffer);
    geo.computeVertexNormals();
    meshMap.set(meshId, geo);
  }

  return { nodes: payload.data.nodes, workplane: payload.data.workplane, meshMap };
}

// ---------------------------------------------------------------------------
// Browser I/O
// ---------------------------------------------------------------------------

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function saveProject(): Promise<void> {
  const { nodes, workplane } = useSceneStore.getState();
  const payload = buildWebcadPayload(nodes, workplane, meshGeometryMap);
  const json = JSON.stringify(payload, null, 2);

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'scene.webcad',
        types: [{ description: 'WebCAD project', accept: { 'application/json': ['.webcad'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        window.alert('Failed to save file.');
      }
    }
  } else {
    const input = window.prompt('Save as:', 'scene.webcad');
    if (input === null) return;
    const filename = input.endsWith('.webcad') ? input : `${input}.webcad`;
    triggerDownload(new Blob([json], { type: 'application/json' }), filename);
  }
}

export function openProject(file: File): void {
  const confirmed = window.confirm('Opening a file will replace the current scene. Continue?');
  if (!confirmed) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result;
    if (typeof text !== 'string') return;

    let parsed: WebcadFile;
    try {
      parsed = JSON.parse(text) as WebcadFile;
    } catch {
      window.alert('Failed to open file: invalid JSON.');
      return;
    }

    let result: ReturnType<typeof parseWebcadPayload>;
    try {
      result = parseWebcadPayload(parsed);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to load scene data from file.');
      return;
    }

    for (const [meshId, geo] of result.meshMap) {
      meshGeometryMap.set(meshId, geo);
    }

    useSceneStore.getState().loadScene(result.nodes, result.workplane);
    undoStack.clear();
  };

  reader.readAsText(file);
}
