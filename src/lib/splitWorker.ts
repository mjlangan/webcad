import SplitWorkerClass from '../workers/split.worker.ts?worker';

interface SplitResultMessage {
  type: 'SPLIT_RESULT';
  payload: { above: ArrayBuffer; below: ArrayBuffer };
}

interface SplitErrorMessage {
  type: 'SPLIT_ERROR';
  payload: { message: string };
}

type WorkerMessage = SplitResultMessage | SplitErrorMessage;

let worker: Worker | null = null;
let pending: {
  resolve: (r: { above: ArrayBuffer; below: ArrayBuffer }) => void;
  reject: (err: Error) => void;
} | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new SplitWorkerClass();
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (!pending) return;
      const { resolve, reject } = pending;
      pending = null;
      if (event.data.type === 'SPLIT_RESULT') {
        resolve(event.data.payload);
      } else {
        reject(new Error(event.data.payload.message));
      }
    };
    worker.onerror = () => {
      if (pending) {
        const { reject } = pending;
        pending = null;
        reject(new Error('Split worker crashed'));
      }
      worker = null;
    };
  }
  return worker;
}

export function runSplit(
  mesh: ArrayBuffer,
  planeOrigin: [number, number, number],
  planeNormal: [number, number, number],
  planeTangentX: [number, number, number],
): Promise<{ above: ArrayBuffer; below: ArrayBuffer }> {
  if (pending) return Promise.reject(new Error('A split operation is already in flight'));
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    getWorker().postMessage(
      { type: 'SPLIT_OPERATION', payload: { mesh, planeOrigin, planeNormal, planeTangentX } },
      [mesh],
    );
  });
}

export function cancelSplit(): void {
  if (pending) {
    const { reject } = pending;
    pending = null;
    reject(new Error('Split operation cancelled'));
  }
  if (worker) {
    worker.terminate();
    worker = null;
  }
}
