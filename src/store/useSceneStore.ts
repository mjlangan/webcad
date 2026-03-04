import { create } from 'zustand';
import type { SceneNode, Transform, PrimitiveParams } from '../types/scene';

function yOffsetFor(geometry: PrimitiveParams): number {
  switch (geometry.type) {
    case 'box':      return geometry.height / 2;
    case 'sphere':   return geometry.radius;
    case 'cylinder': return geometry.height / 2;
    case 'cone':     return geometry.height / 2;
    case 'torus':    return geometry.tube;
    case 'imported': return 0;
  }
}

function labelFor(geometry: PrimitiveParams): string {
  switch (geometry.type) {
    case 'box':      return 'Box';
    case 'sphere':   return 'Sphere';
    case 'cylinder': return 'Cylinder';
    case 'cone':     return 'Cone';
    case 'torus':    return 'Torus';
    case 'imported': return geometry.originalName;
  }
}

interface SceneState {
  nodes: SceneNode[];
  selectedId: string | null;
  selectNode: (id: string | null) => void;
  updateTransform: (id: string, transform: Transform) => void;
  addNode: (geometry: PrimitiveParams, initialPosition?: [number, number, number]) => void;
  removeNode: (id: string) => void;
  renameNode: (id: string, name: string) => void;
  toggleVisible: (id: string) => void;
  updatePrimitiveParams: (id: string, geometry: PrimitiveParams) => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
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
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, transform } : n)),
    })),

  addNode: (geometry, initialPosition) => {
    const { nodes } = get();
    const label = labelFor(geometry);
    // Count existing nodes with the same base label to generate suffix
    const count = nodes.filter((n) => n.name.startsWith(label)).length + 1;
    const name = geometry.type === 'imported' ? label : `${label} ${count}`;
    const y = initialPosition ? initialPosition[1] : yOffsetFor(geometry);
    const position: [number, number, number] = initialPosition ?? [0, y, 0];
    const id = crypto.randomUUID();
    const node: SceneNode = {
      id,
      name,
      visible: true,
      locked: false,
      transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
      geometry,
      material: { color: '#4488ff', opacity: 1 },
    };
    set((state) => ({ nodes: [...state.nodes, node], selectedId: id }));
  },

  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  renameNode: (id, name) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, name } : n)),
    })),

  toggleVisible: (id) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, visible: !n.visible } : n
      ),
    })),

  updatePrimitiveParams: (id, geometry) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, geometry } : n)),
    })),
}));
