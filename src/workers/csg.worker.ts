import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { Evaluator, Brush, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { geometryToStl } from '../lib/geometryToStl';

type CsgOperation = 'union' | 'subtract' | 'intersect';

interface CsgOperationMessage {
  type: 'CSG_OPERATION';
  payload: {
    operation: CsgOperation;
    meshA: ArrayBuffer;
    meshB: ArrayBuffer;
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
    const { operation, meshA: bufA, meshB: bufB } = payload;

    const geoA = parseBuffer(bufA);
    const geoB = parseBuffer(bufB);

    const brushA = new Brush(geoA);
    const brushB = new Brush(geoB);

    // Ensure BVH is built
    brushA.updateMatrixWorld();
    brushB.updateMatrixWorld();

    let csgOp;
    switch (operation) {
      case 'union':     csgOp = ADDITION; break;
      case 'subtract':  csgOp = SUBTRACTION; break;
      case 'intersect': csgOp = INTERSECTION; break;
    }

    const result = evaluator.evaluate(brushA, brushB, csgOp);

    const resultBuffer = geometryToStl(result.geometry);

    // Transfer the buffer back to avoid cloning
    (self as unknown as Worker).postMessage(
      { type: 'CSG_RESULT', payload: { result: resultBuffer } },
      [resultBuffer],
    );

    // Clean up
    geoA.dispose();
    geoB.dispose();
    result.geometry.dispose();
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'CSG_ERROR',
      payload: { message: err instanceof Error ? err.message : String(err) },
    });
  }
};
