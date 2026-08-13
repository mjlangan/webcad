import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type { Manifold as ManifoldT, ManifoldToplevel } from 'manifold-3d';
import { geometryToStl } from '../lib/geometryToStl';
import { geometryToManifold, manifoldToGeometry, getManifoldWasm } from '../lib/manifoldGeometry';
import type { CsgOperation } from '../types/scene';

interface CsgOperationMessage {
  type: 'CSG_OPERATION';
  payload: {
    operation: CsgOperation;
    meshes: ArrayBuffer[];
  };
}

const loader = new STLLoader();

function applyOp(wasm: ManifoldToplevel, operation: CsgOperation, a: ManifoldT, b: ManifoldT): ManifoldT {
  switch (operation) {
    case 'union':     return wasm.Manifold.union(a, b);
    case 'subtract':  return wasm.Manifold.difference(a, b);
    case 'intersect': return wasm.Manifold.intersection(a, b);
  }
}

self.onmessage = async (event: MessageEvent<CsgOperationMessage>) => {
  const { type, payload } = event.data;
  if (type !== 'CSG_OPERATION') return;

  try {
    const { operation, meshes } = payload;
    const wasm = await getManifoldWasm();

    const manifolds = meshes.map((buf) => {
      const geo = loader.parse(buf);
      const manifold = geometryToManifold(wasm, geo);
      geo.dispose();
      return manifold;
    });

    // Fold left-to-right: (((mesh0 op mesh1) op mesh2) op mesh3) ...
    // Every input Manifold and every intermediate fold result is WASM-backed and
    // must be explicitly .delete()d — there's no GC for it.
    let acc = manifolds[0];
    for (let i = 1; i < manifolds.length; i++) {
      const next = manifolds[i];
      const result = applyOp(wasm, operation, acc, next);
      acc.delete();
      next.delete();
      acc = result;
    }

    const resultGeo = manifoldToGeometry(acc);
    acc.delete();

    const resultBuffer = geometryToStl(resultGeo);
    resultGeo.dispose();

    // Transfer the buffer back to avoid cloning
    (self as unknown as Worker).postMessage(
      { type: 'CSG_RESULT', payload: { result: resultBuffer } },
      [resultBuffer],
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'CSG_ERROR',
      payload: { message: err instanceof Error ? err.message : String(err) },
    });
  }
};
