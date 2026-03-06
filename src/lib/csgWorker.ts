import CsgWorkerClass from '../workers/csg.worker.ts?worker';

export type CsgOperation = 'union' | 'subtract' | 'intersect';

interface CsgResultMessage {
  type: 'CSG_RESULT';
  payload: { result: ArrayBuffer };
}

interface CsgErrorMessage {
  type: 'CSG_ERROR';
  payload: { message: string };
}

type WorkerMessage = CsgResultMessage | CsgErrorMessage;

let worker: Worker | null = null;

// Pending resolve/reject for the in-flight operation (at most one at a time)
let pending: { resolve: (buf: ArrayBuffer) => void; reject: (err: Error) => void } | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new CsgWorkerClass();

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (!pending) return;
      const { resolve, reject } = pending;
      pending = null;

      if (event.data.type === 'CSG_RESULT') {
        resolve(event.data.payload.result);
      } else {
        reject(new Error(event.data.payload.message));
      }
    };

    worker.onerror = () => {
      if (pending) {
        const { reject } = pending;
        pending = null;
        reject(new Error('CSG worker crashed'));
      }
      worker = null; // Will be recreated on next call
    };
  }
  return worker;
}

/**
 * Run a CSG operation in the background worker.
 * The ArrayBuffers are transferred (not copied) to the worker.
 * Only one operation may be in flight at a time.
 */
export function runCSG(
  operation: CsgOperation,
  meshA: ArrayBuffer,
  meshB: ArrayBuffer,
): Promise<ArrayBuffer> {
  if (pending) {
    return Promise.reject(new Error('A CSG operation is already in flight'));
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    pending = { resolve, reject };
    const w = getWorker();
    w.postMessage(
      { type: 'CSG_OPERATION', payload: { operation, meshA, meshB } },
      [meshA, meshB],
    );
  });
}

/**
 * Terminate the worker immediately, cancelling any in-flight operation.
 * The worker will be recreated on the next `runCSG` call.
 */
export function cancelCSG(): void {
  if (pending) {
    const { reject } = pending;
    pending = null;
    reject(new Error('CSG operation cancelled'));
  }
  if (worker) {
    worker.terminate();
    worker = null;
  }
}
