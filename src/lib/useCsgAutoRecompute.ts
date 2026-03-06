import { useEffect, useRef } from 'react';
import { useSceneStore } from '../store/useSceneStore';
import { rerunCsgForParent } from './triggerCsg';
import type { SceneNode } from '../types/scene';

const DEBOUNCE_MS = 150;

function buildKey(node: SceneNode): string {
  return JSON.stringify({ geometry: node.geometry, transform: node.transform });
}

/**
 * Watches for changes to nodes that are children of a CSG result. When a
 * child's geometry or transform changes, schedules a silent background
 * recompute of the parent boolean result.
 */
export function useCsgAutoRecompute(): void {
  // geoTfSnapshot maps child node id → serialized geometry+transform
  const snapshot = useRef<Map<string, string>>(new Map());
  // debounceTimers maps parentId → setTimeout handle
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const scheduleRecompute = (parentId: string) => {
      const existing = debounceTimers.current.get(parentId);
      if (existing !== undefined) clearTimeout(existing);
      const timer = setTimeout(() => {
        debounceTimers.current.delete(parentId);
        rerunCsgForParent(parentId);
      }, DEBOUNCE_MS);
      debounceTimers.current.set(parentId, timer);
    };

    const unsubscribe = useSceneStore.subscribe((state) => {
      const childNodes = state.nodes.filter((n) => n.parentId !== null);
      const currentIds = new Set(childNodes.map((n) => n.id));
      const pendingParents = new Set<string>();

      for (const child of childNodes) {
        const currKey = buildKey(child);
        const prevKey = snapshot.current.get(child.id);

        if (prevKey === undefined) {
          // Newly parented child — initialize snapshot without triggering recompute
          snapshot.current.set(child.id, currKey);
        } else if (prevKey !== currKey) {
          // Geometry or transform changed
          snapshot.current.set(child.id, currKey);
          if (child.parentId) pendingParents.add(child.parentId);
        }
      }

      // Clean up snapshot entries for nodes no longer parented
      for (const id of snapshot.current.keys()) {
        if (!currentIds.has(id)) snapshot.current.delete(id);
      }

      for (const parentId of pendingParents) {
        scheduleRecompute(parentId);
      }
    });

    return () => {
      unsubscribe();
      // Cancel any pending debounced rerecomputes
      for (const timer of debounceTimers.current.values()) clearTimeout(timer);
      debounceTimers.current.clear();
    };
  }, []);
}
