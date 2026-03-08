import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { useSceneStore } from '../store/useSceneStore';
import { undoStack } from '../store/undoStack';
import { CsgAdoptCommand } from '../store/commands';
import { buildGeometry } from './buildGeometry';
import { geometryToStl } from './geometryToStl';
import { meshGeometryMap } from './meshGeometryMap';
import { runCSG, cancelCSG } from './csgWorker';
import { computeWorldMatrix } from './worldMatrix';
import type { CsgOperation, SceneNode } from '../types/scene';

const stlLoader = new STLLoader();

// Tracks which CSG parents currently have a silent recompute in flight
const recomputeInFlight = new Set<string>();

function buildWorldGeometry(node: SceneNode, nodes: SceneNode[]): THREE.BufferGeometry {
  const geo = buildGeometry(node.geometry).clone();
  const matrix = computeWorldMatrix(node.id, nodes);
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
  const geoA = buildWorldGeometry(nodeA, nodes);
  const geoB = buildWorldGeometry(nodeB, nodes);
  const bufA = geometryToStl(geoA);
  const bufB = geometryToStl(geoB);
  geoA.dispose();
  geoB.dispose();

  // Enter in-flight state (hides source nodes, records operation type)
  beginCsg([idA, idB], operation);

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
  commitCsg();
}

export function commitCsg(): void {
  const { nodes, csgStatus, csgSourceIds, csgResultId, csgPendingOperation, clearCsg } =
    useSceneStore.getState();

  if (csgStatus !== 'preview' || !csgResultId || !csgPendingOperation) return;

  const savedSourceNodes: SceneNode[] = [];
  const savedSourceIndices: number[] = [];

  for (const id of csgSourceIds) {
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx >= 0) {
      savedSourceNodes.push(nodes[idx]);
      savedSourceIndices.push(idx);
    }
  }

  // Clear CSG overlay state, then record the adopt command
  clearCsg(false);

  undoStack.push(
    new CsgAdoptCommand(savedSourceNodes, savedSourceIndices, csgResultId, csgPendingOperation),
  );
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

/**
 * Silently re-runs the boolean operation for a CSG parent node using its
 * current children's geometry and transforms. Updates the result mesh in-place.
 * On failure, blanks the result and records a csgError on the node.
 */
export async function rerunCsgForParent(parentId: string): Promise<void> {
  if (recomputeInFlight.has(parentId)) return;

  const { nodes, csgStatus, updateCsgResult } = useSceneStore.getState();

  // Don't compete with an interactive CSG operation
  if (csgStatus !== 'idle') return;

  const parent = nodes.find((n) => n.id === parentId);
  if (!parent || !parent.csgOperation || parent.childIds.length !== 2) return;

  const [idA, idB] = parent.childIds;
  const nodeA = nodes.find((n) => n.id === idA);
  const nodeB = nodes.find((n) => n.id === idB);
  if (!nodeA || !nodeB) return;

  recomputeInFlight.add(parentId);

  const geoA = buildWorldGeometry(nodeA, nodes);
  const geoB = buildWorldGeometry(nodeB, nodes);
  const bufA = geometryToStl(geoA);
  const bufB = geometryToStl(geoB);
  geoA.dispose();
  geoB.dispose();

  let resultBuffer: ArrayBuffer;
  try {
    resultBuffer = await runCSG(parent.csgOperation, bufA, bufB);
  } catch (err) {
    recomputeInFlight.delete(parentId);
    if (err instanceof Error && err.message === 'A CSG operation is already in flight') {
      // Another op grabbed the worker — the auto-recompute hook will retry on next relevant change
      return;
    }
    // Real failure: blank the result and mark error
    const emptyMeshId = crypto.randomUUID();
    meshGeometryMap.set(emptyMeshId, new THREE.BufferGeometry());
    const message = err instanceof Error ? err.message : 'Unknown CSG error';
    updateCsgResult(parentId, emptyMeshId, message);
    return;
  }

  recomputeInFlight.delete(parentId);

  const resultGeo = stlLoader.parse(resultBuffer);
  resultGeo.computeVertexNormals();
  const newMeshId = crypto.randomUUID();
  meshGeometryMap.set(newMeshId, resultGeo);
  updateCsgResult(parentId, newMeshId, null);
}
