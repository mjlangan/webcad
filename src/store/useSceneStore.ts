import { create } from 'zustand';
import type { SceneNode, Transform, PrimitiveParams, Workplane } from '../types/scene';
import { DEFAULT_WORKPLANE } from '../types/scene';
import { workplaneSpawn } from '../lib/workplaneUtils';

export type TransformMode = 'translate' | 'rotate' | 'scale';

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
  workplane: Workplane;
  workplanePlacementMode: boolean;

  // Selection
  selectedIds: string[];
  selectNode:          (id: string | null) => void;
  toggleNodeSelection: (id: string) => void;
  selectNodes:         (ids: string[]) => void;
  clearSelection:      () => void;

  // Transform gizmo mode
  transformMode: TransformMode;
  setTransformMode: (mode: TransformMode) => void;

  // Workplane
  setWorkplane: (workplane: Workplane) => void;
  setWorkplanePlacementMode: (active: boolean) => void;

  // Mutations
  updateTransform:       (id: string, transform: Transform) => void;
  addNode:               (geometry: PrimitiveParams, spawnHalfHeight?: number) => string;
  removeNode:            (id: string) => void;
  restoreNode:           (node: SceneNode, atIndex: number) => void;
  renameNode:            (id: string, name: string) => void;
  toggleVisible:         (id: string) => void;
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
        position: [0, 10, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      geometry: { type: 'box', width: 20, height: 20, depth: 20 },
      material: { color: '#4488ff', opacity: 1 },
    },
  ],
  selectedIds: [],
  transformMode: 'translate',
  workplane: DEFAULT_WORKPLANE,
  workplanePlacementMode: false,

  selectNode: (id) => set({ selectedIds: id ? [id] : [] }),

  toggleNodeSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((s) => s !== id)
        : [...state.selectedIds, id],
    })),

  selectNodes: (ids) => set({ selectedIds: ids }),

  clearSelection: () => set({ selectedIds: [] }),

  setTransformMode: (mode) => set({ transformMode: mode }),

  setWorkplane: (workplane) => set({ workplane }),

  setWorkplanePlacementMode: (active) => set({ workplanePlacementMode: active }),

  updateTransform: (id, transform) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, transform } : n)),
    })),

  addNode: (geometry, spawnHalfHeight) => {
    const { nodes, workplane } = get();
    const label = labelFor(geometry);
    // Count existing nodes with the same base label to generate suffix
    const count = nodes.filter((n) => n.name.startsWith(label)).length + 1;
    const name = geometry.type === 'imported' ? label : `${label} ${count}`;
    const halfHeight = spawnHalfHeight ?? yOffsetFor(geometry);
    const { position, rotation } = workplaneSpawn(workplane, halfHeight);
    const id = crypto.randomUUID();
    const node: SceneNode = {
      id,
      name,
      visible: true,
      locked: false,
      transform: { position, rotation, scale: [1, 1, 1] },
      geometry,
      material: { color: '#4488ff', opacity: 1 },
    };
    set((state) => ({ nodes: [...state.nodes, node], selectedIds: [id] }));
    return id;
  },

  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      selectedIds: state.selectedIds.filter((s) => s !== id),
    })),

  restoreNode: (node, atIndex) =>
    set((state) => {
      const nodes = [...state.nodes];
      const clampedIndex = Math.min(atIndex, nodes.length);
      nodes.splice(clampedIndex, 0, node);
      return { nodes, selectedIds: [node.id] };
    }),

  renameNode: (id, name) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, name } : n)),
    })),

  toggleVisible: (id) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, visible: !n.visible } : n,
      ),
    })),

  updatePrimitiveParams: (id, geometry) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, geometry } : n)),
    })),
}));
