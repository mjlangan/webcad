import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { useSceneStore } from '../store/useSceneStore';
import { undoStack } from '../store/undoStack';
import { CsgCommitCommand } from '../store/commands';
import { buildGeometry } from './buildGeometry';
import { geometryToStl } from './geometryToStl';
import { meshGeometryMap } from './meshGeometryMap';
import { runCSG, cancelCSG } from './csgWorker';
import type { CsgOperation } from './csgWorker';
import type { SceneNode } from '../types/scene';

const stlLoader = new STLLoader();

function buildWorldGeometry(node: SceneNode): THREE.BufferGeometry {
  const geo = buildGeometry(node.geometry).clone();
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...node.transform.position),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...node.transform.rotation),
    ),
    new THREE.Vector3(...node.transform.scale),
  );
  geo.applyMatrix4(matrix);
  return geo;
}

function operationLabel(op: CsgOperation): string {
  switch (op) {
    case 'union':     return 'Union';
    case 'subtract':  return 'Subtract';
    case 'intersect': return 'Intersect';
  }
}

export async function triggerCsg(operation: CsgOperation): Promise<void> {
  const { nodes, selectedIds, csgStatus, beginCsg, clearCsg, setCsgPreview, addNode } =
    useSceneStore.getState();

  if (csgStatus !== 'idle') return;
  if (selectedIds.length !== 2) return;

  const [idA, idB] = selectedIds;
  const nodeA = nodes.find((n) => n.id === idA);
  const nodeB = nodes.find((n) => n.id === idB);
  if (!nodeA || !nodeB) return;

  // Build world-space geometries and serialize
  const geoA = buildWorldGeometry(nodeA);
  const geoB = buildWorldGeometry(nodeB);
  const bufA = geometryToStl(geoA);
  const bufB = geometryToStl(geoB);
  geoA.dispose();
  geoB.dispose();

  // Enter in-flight state (hides source nodes)
  beginCsg([idA, idB]);

  let resultBuffer: ArrayBuffer;
  try {
    resultBuffer = await runCSG(operation, bufA, bufB);
  } catch (err) {
    // Cancelled or errored — restore sources
    clearCsg(true);
    if (err instanceof Error && err.message !== 'CSG operation cancelled') {
      console.error('CSG operation failed:', err);
    }
    return;
  }

  // Parse result geometry
  const resultGeo = stlLoader.parse(resultBuffer);
  resultGeo.computeVertexNormals();

  const meshId = crypto.randomUUID();
  meshGeometryMap.set(meshId, resultGeo);

  const label = `${operationLabel(operation)} of "${nodeA.name}", "${nodeB.name}"`;
  const resultId = addNode({ type: 'imported', meshId, originalName: label });
  setCsgPreview(resultId);
}

export function commitCsg(): void {
  const { nodes, csgStatus, csgSourceIds, csgResultId, clearCsg } =
    useSceneStore.getState();

  if (csgStatus !== 'preview' || !csgResultId) return;

  const savedSourceNodes: SceneNode[] = [];
  const savedSourceIndices: number[] = [];

  for (const id of csgSourceIds) {
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx >= 0) {
      savedSourceNodes.push(nodes[idx]);
      savedSourceIndices.push(idx);
    }
  }

  // Clear CSG state first (sources remain hidden, result remains)
  // then the command will remove the sources
  clearCsg(false);

  undoStack.push(new CsgCommitCommand(savedSourceNodes, savedSourceIndices, csgResultId));
}

export function discardCsg(): void {
  const { csgStatus, csgResultId, clearCsg, removeNode } = useSceneStore.getState();

  if (csgStatus !== 'preview' || !csgResultId) return;

  removeNode(csgResultId);
  clearCsg(true);
}

export function cancelCsg(): void {
  cancelCSG();
  // The runCSG promise rejection will trigger clearCsg(true) in triggerCsg's catch block
}
