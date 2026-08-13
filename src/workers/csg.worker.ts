import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { Evaluator, Brush, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { geometryToStl } from '../lib/geometryToStl';
import type { CsgOperation } from '../types/scene';

interface CsgOperationMessage {
  type: 'CSG_OPERATION';
  payload: {
    operation: CsgOperation;
    meshes: ArrayBuffer[];
  };
}

const loader = new STLLoader();
const evaluator = new Evaluator();
evaluator.useGroups = false;
// Restrict to attributes present in binary STL geometry (no uv)
evaluator.attributes = ['position', 'normal'];

function parseBuffer(buffer: ArrayBuffer): THREE.BufferGeometry {
  const geo = loader.parse(buffer);
  geo.computeVertexNormals();
  return geo;
}

self.onmessage = (event: MessageEvent<CsgOperationMessage>) => {
  const { type, payload } = event.data;
  if (type !== 'CSG_OPERATION') return;

  try {
    const { operation, meshes } = payload;

    let csgOp;
    switch (operation) {
      case 'union':     csgOp = ADDITION; break;
      case 'subtract':  csgOp = SUBTRACTION; break;
      case 'intersect': csgOp = INTERSECTION; break;
    }

    // Fold left-to-right: (((mesh0 op mesh1) op mesh2) op mesh3) ...
    const geometries = meshes.map(parseBuffer);
    let acc = new Brush(geometries[0]);
    acc.updateMatrixWorld();

    for (let i = 1; i < geometries.length; i++) {
      const next = new Brush(geometries[i]);
      next.updateMatrixWorld();
      const evaluated = evaluator.evaluate(acc, next, csgOp);
      // Dispose the previous fold's intermediate output geometry (not one of the
      // original input geometries, which are disposed together below).
      if (i > 1) acc.geometry.dispose();
      acc = evaluated;
    }

    const resultBuffer = geometryToStl(acc.geometry);

    // Transfer the buffer back to avoid cloning
    (self as unknown as Worker).postMessage(
      { type: 'CSG_RESULT', payload: { result: resultBuffer } },
      [resultBuffer],
    );

    // Clean up
    geometries.forEach((g) => g.dispose());
    acc.geometry.dispose();
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'CSG_ERROR',
      payload: { message: err instanceof Error ? err.message : String(err) },
    });
  }
};
