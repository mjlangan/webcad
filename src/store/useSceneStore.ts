import { create } from 'zustand';
import type { SceneNode, Transform } from '../types/scene';

interface SceneState {
  nodes: SceneNode[];
  selectedId: string | null;
  selectNode: (id: string | null) => void;
  updateTransform: (id: string, transform: Transform) => void;
}

export const useSceneStore = create<SceneState>((set) => ({
  nodes: [
    {
      id: 'box-1',
      name: 'Box',
      visible: true,
      locked: false,
      transform: {
        position: [0, 0.5, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      geometry: { type: 'box', width: 1, height: 1, depth: 1 },
      material: { color: '#4488ff', opacity: 1 },
    },
  ],
  selectedId: null,
  selectNode: (id) => set({ selectedId: id }),
  updateTransform: (id, transform) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, transform } : n
      ),
    })),
}));
