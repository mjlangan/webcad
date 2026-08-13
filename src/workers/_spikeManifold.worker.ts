// Spike: prove manifold-3d's WASM module loads and runs a boolean op inside
// a Vite-bundled Web Worker in this project's actual build (dev + e2e preview
// build), which is the one risk that can't be resolved from docs alone.
// Not wired into the app — throwaway, delete once the spike is evaluated.
import Module from 'manifold-3d';

interface SpikeRequest {
  type: 'RUN_SPIKE';
}

interface SpikeResult {
  type: 'SPIKE_RESULT';
  payload:
    | { success: true; triangleCount: number; vertCount: number }
    | { success: false; error: string };
}

self.onmessage = async (event: MessageEvent<SpikeRequest>) => {
  if (event.data.type !== 'RUN_SPIKE') return;

  try {
    const wasm = await Module();
    wasm.setup();
    const { Manifold } = wasm;

    // Two overlapping unit cubes, unioned — the simplest possible boolean op.
    const a = Manifold.cube([2, 2, 2]);
    const b = Manifold.cube([2, 2, 2]).translate([1, 1, 1]);
    const result = Manifold.union(a, b);
    const mesh = result.getMesh();

    const payload: SpikeResult['payload'] = {
      success: true,
      triangleCount: mesh.triVerts.length / 3,
      vertCount: mesh.vertProperties.length / mesh.numProp,
    };

    a.delete();
    b.delete();
    result.delete();

    (self as unknown as Worker).postMessage({ type: 'SPIKE_RESULT', payload } satisfies SpikeResult);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'SPIKE_RESULT',
      payload: { success: false, error: err instanceof Error ? err.message : String(err) },
    } satisfies SpikeResult);
  }
};
