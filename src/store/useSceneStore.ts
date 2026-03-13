import { create } from 'zustand';
import type { SceneNode, Transform, PrimitiveParams, MaterialProps, Workplane, CsgOperation, ImportedMeshParams } from '../types/scene';
import { DEFAULT_WORKPLANE } from '../types/scene';
import { workplaneSpawn } from '../lib/workplaneUtils';

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type AxisConstraint = 'X' | 'Y' | 'Z' | null;

function labelFor(geometry: PrimitiveParams): string {
  switch (geometry.type) {
    case 'box':        return 'Box';
    case 'sphere':     return 'Sphere';
    case 'cylinder':   return 'Cylinder';
    case 'cone':       return 'Cone';
    case 'torus':      return 'Torus';
    case 'beerglass':  return 'Beer Glass';
    case 'imported':   return geometry.originalName;
    case 'group':      return 'Group';
  }
}

export type CsgStatus = 'idle' | 'in_flight' | 'preview';

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

  // Axis constraint (X/Y/Z keyboard lock)
  transformAxisConstraint: AxisConstraint;
  setTransformAxisConstraint: (axis: AxisConstraint) => void;

  // Grid snap
  gridSnap: number; // 0 = off; positive = snap increment in scene units
  setGridSnap: (value: number) => void;

  // Workplane
  setWorkplane: (workplane: Workplane) => void;
  setWorkplanePlacementMode: (active: boolean) => void;

  // CSG
  csgStatus: CsgStatus;
  csgSourceIds: string[];
  csgResultId: string | null;
  csgPendingOperation: CsgOperation | null;
  setNodeVisible:  (id: string, visible: boolean) => void;
  beginCsg:        (sourceIds: string[], operation: CsgOperation) => void;
  setCsgPreview:   (resultId: string) => void;
  clearCsg:        (restoreSources?: boolean) => void;

  // Mutations
  updateTransform:       (id: string, transform: Transform) => void;
  updateMaterial:        (id: string, material: MaterialProps) => void;
  addNode:               (geometry: PrimitiveParams, spawnHalfHeight?: number) => string;
  addGroupNode:          (position: [number, number, number], name?: string, id?: string) => string;
  reparentNodes:         (ids: string[], newParentId: string | null, newTransforms: Transform[]) => void;
  removeNode:            (id: string) => void;
  restoreNode:           (node: SceneNode, atIndex: number) => void;
  renameNode:            (id: string, name: string) => void;
  toggleVisible:         (id: string) => void;
  updatePrimitiveParams: (id: string, geometry: PrimitiveParams) => void;
  adoptChildren:         (parentId: string, childIds: string[], op: CsgOperation) => void;
  releaseChildren:       (parentId: string) => void;
  updateCsgResult:       (parentId: string, newMeshId: string, error: string | null) => void;
  loadScene:             (nodes: SceneNode[], workplane: Workplane) => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  nodes: [],
  selectedIds: [],
  transformMode: 'translate',
  transformAxisConstraint: null,
  gridSnap: 1,
  workplane: DEFAULT_WORKPLANE,
  workplanePlacementMode: false,
  csgStatus: 'idle',
  csgSourceIds: [],
  csgResultId: null,
  csgPendingOperation: null,

  selectNode: (id) => set({ selectedIds: id ? [id] : [], transformAxisConstraint: null }),

  toggleNodeSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((s) => s !== id)
        : [...state.selectedIds, id],
    })),

  selectNodes: (ids) => set({ selectedIds: ids }),

  clearSelection: () => set({ selectedIds: [], transformAxisConstraint: null }),

  setTransformMode: (mode) => set({ transformMode: mode, transformAxisConstraint: null }),

  setTransformAxisConstraint: (axis) => set({ transformAxisConstraint: axis }),

  setGridSnap: (value) => set({ gridSnap: value }),

  setWorkplane: (workplane) => set({ workplane }),

  setWorkplanePlacementMode: (active) => set({ workplanePlacementMode: active }),

  setNodeVisible: (id, visible) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, visible } : n)),
    })),

  beginCsg: (sourceIds, operation) =>
    set((state) => ({
      csgStatus: 'in_flight',
      csgSourceIds: sourceIds,
      csgResultId: null,
      csgPendingOperation: operation,
      nodes: state.nodes.map((n) =>
        sourceIds.includes(n.id) ? { ...n, visible: false } : n,
      ),
    })),

  setCsgPreview: (resultId) => set({ csgStatus: 'preview', csgResultId: resultId }),

  clearCsg: (restoreSources = false) =>
    set((state) => ({
      csgStatus: 'idle',
      csgResultId: null,
      csgSourceIds: [],
      csgPendingOperation: null,
      nodes: restoreSources
        ? state.nodes.map((n) =>
            state.csgSourceIds.includes(n.id) ? { ...n, visible: true } : n,
          )
        : state.nodes,
    })),

  updateTransform: (id, transform) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, transform } : n)),
    })),

  updateMaterial: (id, material) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, material } : n)),
    })),

  addNode: (geometry, spawnHalfHeight) => {
    const { nodes, workplane } = get();
    const label = labelFor(geometry);
    // Count existing nodes with the same base label to generate suffix
    const count = nodes.filter((n) => n.name.startsWith(label)).length + 1;
    const name = geometry.type === 'imported' ? label : `${label} ${count}`;
    const halfHeight = spawnHalfHeight ?? 0;
    const { position, rotation } = workplaneSpawn(workplane, halfHeight);
    const id = crypto.randomUUID();
    const node: SceneNode = {
      id,
      name,
      visible: true,
      locked: false,
      transform: { position, rotation, scale: [1, 1, 1] },
      geometry,
      material: { color: '#4488ff', opacity: 1, wireframe: false },
      parentId: null,
      childIds: [],
      csgOperation: null,
      csgError: null,
    };
    set((state) => ({ nodes: [...state.nodes, node], selectedIds: [id] }));
    return id;
  },

  addGroupNode: (position, name, forcedId) => {
    const { nodes } = get();
    const label = 'Group';
    const count = nodes.filter((n) => n.name.startsWith(label)).length + 1;
    const nodeName = name ?? `${label} ${count}`;
    const id = forcedId ?? crypto.randomUUID();
    const groupNode: SceneNode = {
      id,
      name: nodeName,
      visible: true,
      locked: false,
      transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
      geometry: { type: 'group' },
      material: { color: '#4488ff', opacity: 1, wireframe: false },
      parentId: null,
      childIds: [],
      csgOperation: null,
      csgError: null,
    };
    set((state) => ({ nodes: [...state.nodes, groupNode], selectedIds: [id] }));
    return id;
  },

  reparentNodes: (ids, newParentId, newTransforms) =>
    set((state) => {
      const updated = state.nodes.map((n) => {
        const idx = ids.indexOf(n.id);
        if (idx >= 0) {
          // Update the node's parent and local transform
          const updatedNode = { ...n, parentId: newParentId, transform: newTransforms[idx] };
          return updatedNode;
        }
        // Update the new parent's childIds
        if (newParentId !== null && n.id === newParentId) {
          const existingChildren = n.childIds.filter((c) => !ids.includes(c));
          return { ...n, childIds: [...existingChildren, ...ids] };
        }
        // Remove ids from old parent's childIds
        if (n.childIds.some((c) => ids.includes(c))) {
          return { ...n, childIds: n.childIds.filter((c) => !ids.includes(c)) };
        }
        return n;
      });
      return { nodes: updated };
    }),

  removeNode: (id) =>
    set((state) => {
      const node = state.nodes.find((n) => n.id === id);
      if (!node) return {};

      // If this is a CSG parent or general group, release children (make them top-level and visible)
      let updatedNodes = state.nodes;
      if (node.childIds.length > 0) {
        updatedNodes = updatedNodes.map((n) =>
          node.childIds.includes(n.id)
            ? { ...n, parentId: null, visible: true }
            : n,
        );
      }

      // If this node is itself a child (group child), remove it from the parent's childIds
      if (node.parentId !== null) {
        updatedNodes = updatedNodes.map((n) =>
          n.id === node.parentId
            ? { ...n, childIds: n.childIds.filter((c) => c !== id) }
            : n,
        );
      }

      return {
        nodes: updatedNodes.filter((n) => n.id !== id),
        selectedIds: state.selectedIds.filter((s) => s !== id),
      };
    }),

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
    set((state) => {
      const target = state.nodes.find((n) => n.id === id);
      if (!target) return {};
      const newVisible = !target.visible;

      // Collect all recursive group-child descendants to propagate visibility
      const descendantIds = new Set<string>();
      const collectGroupDescendants = (parentId: string) => {
        state.nodes.forEach((n) => {
          if (n.parentId === parentId) {
            const parent = state.nodes.find((p) => p.id === parentId);
            if (parent?.geometry.type === 'group') {
              descendantIds.add(n.id);
              collectGroupDescendants(n.id);
            }
          }
        });
      };
      if (target.geometry.type === 'group') collectGroupDescendants(id);

      return {
        nodes: state.nodes.map((n) => {
          if (n.id === id) return { ...n, visible: newVisible };
          if (descendantIds.has(n.id)) return { ...n, visible: newVisible };
          return n;
        }),
      };
    }),

  updatePrimitiveParams: (id, geometry) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, geometry } : n)),
    })),

  adoptChildren: (parentId, childIds, op) =>
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id === parentId) {
          return { ...n, childIds, csgOperation: op };
        }
        if (childIds.includes(n.id)) {
          return { ...n, parentId, visible: false };
        }
        return n;
      }),
    })),

  releaseChildren: (parentId) =>
    set((state) => {
      const parent = state.nodes.find((n) => n.id === parentId);
      if (!parent) return {};
      const childIds = parent.childIds;
      return {
        nodes: state.nodes.map((n) => {
          if (n.id === parentId) {
            return { ...n, childIds: [], csgOperation: null, csgError: null };
          }
          if (childIds.includes(n.id)) {
            return { ...n, parentId: null, visible: true };
          }
          return n;
        }),
      };
    }),

  updateCsgResult: (parentId, newMeshId, error) =>
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== parentId) return n;
        const geo = n.geometry as ImportedMeshParams;
        return {
          ...n,
          geometry: { ...geo, meshId: newMeshId },
          csgError: error,
          visible: error === null,
        };
      }),
    })),

  loadScene: (nodes, workplane) =>
    set({
      nodes,
      workplane,
      selectedIds: [],
      transformMode: 'translate',
      csgStatus: 'idle',
      csgSourceIds: [],
      csgResultId: null,
      csgPendingOperation: null,
      workplanePlacementMode: false,
    }),
}));
