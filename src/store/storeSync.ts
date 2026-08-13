import type { StoreApi } from 'zustand';

/**
 * Applies a zustand store's current state, then keeps applying it on every
 * subsequent change. Returns the unsubscribe function. Used by hooks that
 * imperatively mirror store state onto Three.js objects outside React's own
 * render cycle (see e.g. useShadowSync, useWorkplaneVisualization).
 */
export function primeAndSubscribe<T>(store: StoreApi<T>, apply: (state: T) => void): () => void {
  apply(store.getState());
  return store.subscribe(apply);
}
