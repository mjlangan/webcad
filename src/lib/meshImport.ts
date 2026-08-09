import type * as THREE from 'three';
import { undoStack } from '../store/undoStack';
import { AddNodeCommand } from '../store/commands';
import { meshGeometryMap } from './meshGeometryMap';

/** Centers geometry at its own origin, ensures vertex normals, and returns
 *  the yOffset (bounding-box max.y) needed to lift it onto the grid.
 *  Mutates `geometry` in place. */
export function normalizeImportedGeometry(geometry: THREE.BufferGeometry): number {
  geometry.center();
  geometry.computeBoundingBox();
  const yOffset = geometry.boundingBox?.max.y ?? 0;
  geometry.computeVertexNormals();
  return yOffset;
}

/** Registers geometry in meshGeometryMap and adds an imported-mesh node
 *  to the scene through undo/redo. */
export function addImportedMeshNode(
  geometry: THREE.BufferGeometry,
  originalName: string,
  yOffset: number,
): void {
  const meshId = crypto.randomUUID();
  meshGeometryMap.set(meshId, geometry);
  undoStack.push(new AddNodeCommand({ type: 'imported', meshId, originalName }, yOffset));
}
