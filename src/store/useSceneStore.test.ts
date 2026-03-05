import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from './useSceneStore';

// Reset store data before each test to an empty, deterministic state.
// We only reset data fields; action functions stay in state automatically.
beforeEach(() => {
  useSceneStore.setState({ nodes: [], selectedIds: [], transformMode: 'translate', workplane: { origin: [0, 0, 0], normal: [0, 1, 0], tangentX: [1, 0, 0] }, workplanePlacementMode: false });
});

// Convenience: add a box and return its id.
function addBox(overrides?: Partial<{ width: number; height: number; depth: number }>) {
  return useSceneStore
    .getState()
    .addNode({ type: 'box', width: 20, height: 20, depth: 20, ...overrides });
}

// ── Selection ──────────────────────────────────────────────────────────────────

describe('selectNode', () => {
  it('sets selectedIds to [id]', () => {
    const id = addBox();
    useSceneStore.getState().clearSelection();
    useSceneStore.getState().selectNode(id);
    expect(useSceneStore.getState().selectedIds).toEqual([id]);
  });

  it('replaces an existing selection', () => {
    const a = addBox();
    const b = addBox();
    useSceneStore.getState().selectNode(a);
    useSceneStore.getState().selectNode(b);
    expect(useSceneStore.getState().selectedIds).toEqual([b]);
  });

  it('selectNode(null) clears selectedIds', () => {
    addBox();
    useSceneStore.getState().selectNode(null);
    expect(useSceneStore.getState().selectedIds).toEqual([]);
  });
});

describe('toggleNodeSelection', () => {
  it('adds id when not currently selected', () => {
    const id = addBox();
    useSceneStore.getState().clearSelection();
    useSceneStore.getState().toggleNodeSelection(id);
    expect(useSceneStore.getState().selectedIds).toContain(id);
  });

  it('removes id when already selected', () => {
    const id = addBox(); // addNode auto-selects
    expect(useSceneStore.getState().selectedIds).toContain(id);
    useSceneStore.getState().toggleNodeSelection(id);
    expect(useSceneStore.getState().selectedIds).not.toContain(id);
  });

  it('preserves other selected ids when adding', () => {
    const a = addBox();
    const b = addBox();
    useSceneStore.getState().selectNode(a);
    useSceneStore.getState().toggleNodeSelection(b);
    expect(useSceneStore.getState().selectedIds).toEqual([a, b]);
  });

  it('preserves other selected ids when removing', () => {
    const a = addBox();
    const b = addBox();
    useSceneStore.getState().selectNodes([a, b]);
    useSceneStore.getState().toggleNodeSelection(a);
    expect(useSceneStore.getState().selectedIds).toEqual([b]);
  });
});

describe('selectNodes', () => {
  it('replaces selectedIds with arbitrary set', () => {
    const a = addBox();
    const b = addBox();
    useSceneStore.getState().selectNodes([a, b]);
    expect(useSceneStore.getState().selectedIds).toEqual([a, b]);
  });

  it('can select empty array', () => {
    addBox();
    useSceneStore.getState().selectNodes([]);
    expect(useSceneStore.getState().selectedIds).toEqual([]);
  });
});

describe('clearSelection', () => {
  it('empties selectedIds', () => {
    const id = addBox();
    useSceneStore.getState().selectNode(id);
    useSceneStore.getState().clearSelection();
    expect(useSceneStore.getState().selectedIds).toEqual([]);
  });
});

// ── addNode ────────────────────────────────────────────────────────────────────

describe('addNode', () => {
  it('returns a non-empty string id', () => {
    const id = addBox();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('appends to nodes array', () => {
    expect(useSceneStore.getState().nodes).toHaveLength(0);
    addBox();
    expect(useSceneStore.getState().nodes).toHaveLength(1);
    addBox();
    expect(useSceneStore.getState().nodes).toHaveLength(2);
  });

  it('auto-selects the new node', () => {
    const id = addBox();
    expect(useSceneStore.getState().selectedIds).toEqual([id]);
  });

  it('stores node with correct geometry', () => {
    const id = useSceneStore.getState().addNode({ type: 'sphere', radius: 5, widthSegments: 32, heightSegments: 16 });
    const node = useSceneStore.getState().nodes.find((n) => n.id === id)!;
    expect(node.geometry).toEqual({ type: 'sphere', radius: 5, widthSegments: 32, heightSegments: 16 });
  });

  it('node starts visible and unlocked', () => {
    const id = addBox();
    const node = useSceneStore.getState().nodes.find((n) => n.id === id)!;
    expect(node.visible).toBe(true);
    expect(node.locked).toBe(false);
  });

  it('node starts with identity rotation and scale', () => {
    const id = addBox();
    const { transform } = useSceneStore.getState().nodes.find((n) => n.id === id)!;
    expect(transform.rotation).toEqual([0, 0, 0]);
    expect(transform.scale).toEqual([1, 1, 1]);
  });

  // Y-offset placement tests
  it('Box: y = height / 2', () => {
    const id = useSceneStore.getState().addNode({ type: 'box', width: 10, height: 40, depth: 10 });
    const { position } = useSceneStore.getState().nodes.find((n) => n.id === id)!.transform;
    expect(position[1]).toBe(20);
  });

  it('Sphere: y = radius', () => {
    const id = useSceneStore.getState().addNode({ type: 'sphere', radius: 15, widthSegments: 32, heightSegments: 16 });
    const { position } = useSceneStore.getState().nodes.find((n) => n.id === id)!.transform;
    expect(position[1]).toBe(15);
  });

  it('Cylinder: y = height / 2', () => {
    const id = useSceneStore.getState().addNode({ type: 'cylinder', radiusTop: 5, radiusBottom: 5, height: 30, radialSegments: 32 });
    const { position } = useSceneStore.getState().nodes.find((n) => n.id === id)!.transform;
    expect(position[1]).toBe(15);
  });

  it('Cone: y = height / 2', () => {
    const id = useSceneStore.getState().addNode({ type: 'cone', radius: 5, height: 24, radialSegments: 32 });
    const { position } = useSceneStore.getState().nodes.find((n) => n.id === id)!.transform;
    expect(position[1]).toBe(12);
  });

  it('Torus: y = tube', () => {
    const id = useSceneStore.getState().addNode({ type: 'torus', radius: 10, tube: 3, radialSegments: 16, tubularSegments: 64 });
    const { position } = useSceneStore.getState().nodes.find((n) => n.id === id)!.transform;
    expect(position[1]).toBe(3);
  });

  it('Imported: y = 0', () => {
    const id = useSceneStore.getState().addNode({ type: 'imported', meshId: 'mesh-1', originalName: 'part.stl' });
    const { position } = useSceneStore.getState().nodes.find((n) => n.id === id)!.transform;
    expect(position[1]).toBe(0);
  });

  it('spawnHalfHeight overrides the computed y offset on the default workplane', () => {
    const id = useSceneStore.getState().addNode({ type: 'box', width: 20, height: 20, depth: 20 }, 99);
    const { position } = useSceneStore.getState().nodes.find((n) => n.id === id)!.transform;
    // Default workplane: normal = +Y, origin = world zero → y equals spawnHalfHeight
    expect(position).toEqual([0, 99, 0]);
  });

  // Workplane placement tests
  it('vertical workplane (normal=[1,0,0]): new box position is along X axis', () => {
    useSceneStore.setState({
      workplane: { origin: [10, 0, 0], normal: [1, 0, 0], tangentX: [0, 0, -1] },
    });
    // 20×20×20 box → halfHeight = 10, spawn at origin + normal*10 = [20, 0, 0]
    const id = addBox();
    const { position } = useSceneStore.getState().nodes.find((n) => n.id === id)!.transform;
    expect(position[0]).toBeCloseTo(20, 5);
    expect(position[1]).toBeCloseTo(0, 5);
    expect(position[2]).toBeCloseTo(0, 5);
  });

  it('vertical workplane (normal=[1,0,0]): new box rotation aligns local-Y with X', () => {
    useSceneStore.setState({
      workplane: { origin: [0, 0, 0], normal: [1, 0, 0], tangentX: [0, 0, -1] },
    });
    const id = addBox();
    const { rotation } = useSceneStore.getState().nodes.find((n) => n.id === id)!.transform;
    // Rotating local-Y to world-X: -90° around world Z
    expect(rotation[0]).toBeCloseTo(0, 5);
    expect(rotation[1]).toBeCloseTo(0, 5);
    expect(rotation[2]).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('workplane with non-zero origin: spawn position is offset from the workplane origin', () => {
    useSceneStore.setState({
      workplane: { origin: [5, 8, 3], normal: [0, 1, 0], tangentX: [1, 0, 0] },
    });
    // halfHeight for 20×20×20 box = 10, normal=[0,1,0] → position = [5, 18, 3]
    const id = addBox();
    const { position } = useSceneStore.getState().nodes.find((n) => n.id === id)!.transform;
    expect(position[0]).toBeCloseTo(5, 5);
    expect(position[1]).toBeCloseTo(18, 5);
    expect(position[2]).toBeCloseTo(3, 5);
  });

  it('after resetting workplane to default, new nodes use world-Y placement', () => {
    // Set a vertical workplane, then reset
    useSceneStore.setState({
      workplane: { origin: [100, 0, 0], normal: [1, 0, 0], tangentX: [0, 0, -1] },
    });
    useSceneStore.setState({
      workplane: { origin: [0, 0, 0], normal: [0, 1, 0], tangentX: [1, 0, 0] },
    });
    const id = addBox(); // 20×20×20 → halfHeight = 10
    const { position } = useSceneStore.getState().nodes.find((n) => n.id === id)!.transform;
    expect(position).toEqual([0, 10, 0]);
  });

  // Auto-naming tests
  it('first Box is named "Box 1"', () => {
    const id = addBox();
    expect(useSceneStore.getState().nodes.find((n) => n.id === id)!.name).toBe('Box 1');
  });

  it('second Box is named "Box 2"', () => {
    addBox();
    const id2 = addBox();
    expect(useSceneStore.getState().nodes.find((n) => n.id === id2)!.name).toBe('Box 2');
  });

  it('Sphere is named "Sphere 1"', () => {
    const id = useSceneStore.getState().addNode({ type: 'sphere', radius: 5, widthSegments: 32, heightSegments: 16 });
    expect(useSceneStore.getState().nodes.find((n) => n.id === id)!.name).toBe('Sphere 1');
  });

  it('Imported mesh uses originalName directly (no counter suffix)', () => {
    const id = useSceneStore.getState().addNode({ type: 'imported', meshId: 'm1', originalName: 'gear.stl' });
    expect(useSceneStore.getState().nodes.find((n) => n.id === id)!.name).toBe('gear.stl');
  });

  it('Box and Sphere counters are independent', () => {
    addBox();
    addBox();
    const sid = useSceneStore.getState().addNode({ type: 'sphere', radius: 5, widthSegments: 32, heightSegments: 16 });
    expect(useSceneStore.getState().nodes.find((n) => n.id === sid)!.name).toBe('Sphere 1');
  });

  it('each call returns a unique id', () => {
    const ids = Array.from({ length: 10 }, () => addBox());
    const unique = new Set(ids);
    expect(unique.size).toBe(10);
  });
});

// ── removeNode ─────────────────────────────────────────────────────────────────

describe('removeNode', () => {
  it('removes the node from the nodes array', () => {
    const id = addBox();
    useSceneStore.getState().removeNode(id);
    expect(useSceneStore.getState().nodes.find((n) => n.id === id)).toBeUndefined();
  });

  it('removes the id from selectedIds', () => {
    const id = addBox(); // auto-selected
    useSceneStore.getState().removeNode(id);
    expect(useSceneStore.getState().selectedIds).not.toContain(id);
  });

  it('leaves other nodes intact', () => {
    const a = addBox();
    const b = addBox();
    useSceneStore.getState().removeNode(a);
    expect(useSceneStore.getState().nodes.find((n) => n.id === b)).toBeDefined();
  });

  it('leaves other selected ids intact', () => {
    const a = addBox();
    const b = addBox();
    useSceneStore.getState().selectNodes([a, b]);
    useSceneStore.getState().removeNode(a);
    expect(useSceneStore.getState().selectedIds).toEqual([b]);
  });

  it('is a no-op for an unknown id', () => {
    addBox();
    const before = useSceneStore.getState().nodes.length;
    useSceneStore.getState().removeNode('nonexistent-id');
    expect(useSceneStore.getState().nodes.length).toBe(before);
  });
});

// ── restoreNode ────────────────────────────────────────────────────────────────

describe('restoreNode', () => {
  it('inserts at the specified index', () => {
    const a = addBox();
    const b = addBox();
    const savedNode = useSceneStore.getState().nodes.find((n) => n.id === a)!;
    useSceneStore.getState().removeNode(a);
    // nodes is now [b]; restore at index 0
    useSceneStore.getState().restoreNode(savedNode, 0);
    expect(useSceneStore.getState().nodes[0].id).toBe(a);
    expect(useSceneStore.getState().nodes[1].id).toBe(b);
  });

  it('appends at end when index equals nodes.length', () => {
    addBox();
    const b = addBox();
    const savedNode = useSceneStore.getState().nodes.find((n) => n.id === b)!;
    useSceneStore.getState().removeNode(b);
    const len = useSceneStore.getState().nodes.length;
    useSceneStore.getState().restoreNode(savedNode, len);
    const nodes = useSceneStore.getState().nodes;
    expect(nodes[nodes.length - 1].id).toBe(b);
  });

  it('clamps out-of-bounds index to nodes.length', () => {
    const id = addBox();
    const savedNode = useSceneStore.getState().nodes.find((n) => n.id === id)!;
    useSceneStore.getState().removeNode(id);
    // index 999 should be clamped to 0 (empty array)
    useSceneStore.getState().restoreNode(savedNode, 999);
    expect(useSceneStore.getState().nodes[0].id).toBe(id);
  });

  it('selects the restored node', () => {
    const id = addBox();
    const savedNode = useSceneStore.getState().nodes.find((n) => n.id === id)!;
    useSceneStore.getState().removeNode(id);
    useSceneStore.getState().restoreNode(savedNode, 0);
    expect(useSceneStore.getState().selectedIds).toEqual([id]);
  });
});

// ── renameNode ─────────────────────────────────────────────────────────────────

describe('renameNode', () => {
  it('updates the node name', () => {
    const id = addBox();
    useSceneStore.getState().renameNode(id, 'MyBox');
    expect(useSceneStore.getState().nodes.find((n) => n.id === id)!.name).toBe('MyBox');
  });

  it('leaves other nodes unchanged', () => {
    const a = addBox();
    const b = addBox();
    const nameBefore = useSceneStore.getState().nodes.find((n) => n.id === b)!.name;
    useSceneStore.getState().renameNode(a, 'renamed');
    expect(useSceneStore.getState().nodes.find((n) => n.id === b)!.name).toBe(nameBefore);
  });
});

// ── toggleVisible ──────────────────────────────────────────────────────────────

describe('toggleVisible', () => {
  it('flips visible from true to false', () => {
    const id = addBox();
    // newly added nodes are visible
    useSceneStore.getState().toggleVisible(id);
    expect(useSceneStore.getState().nodes.find((n) => n.id === id)!.visible).toBe(false);
  });

  it('flips visible from false to true', () => {
    const id = addBox();
    useSceneStore.getState().toggleVisible(id); // → false
    useSceneStore.getState().toggleVisible(id); // → true
    expect(useSceneStore.getState().nodes.find((n) => n.id === id)!.visible).toBe(true);
  });

  it('does not affect other nodes', () => {
    const a = addBox();
    const b = addBox();
    useSceneStore.getState().toggleVisible(a);
    expect(useSceneStore.getState().nodes.find((n) => n.id === b)!.visible).toBe(true);
  });
});

// ── updateTransform ────────────────────────────────────────────────────────────

describe('updateTransform', () => {
  it('updates position, rotation, and scale', () => {
    const id = addBox();
    const newTransform = {
      position: [10, 20, 30] as [number, number, number],
      rotation: [0.1, 0.2, 0.3] as [number, number, number],
      scale:    [2, 3, 4]    as [number, number, number],
    };
    useSceneStore.getState().updateTransform(id, newTransform);
    expect(useSceneStore.getState().nodes.find((n) => n.id === id)!.transform).toEqual(newTransform);
  });

  it('does not affect other nodes', () => {
    const a = addBox();
    const b = addBox();
    const originalB = { ...useSceneStore.getState().nodes.find((n) => n.id === b)!.transform };
    useSceneStore.getState().updateTransform(a, { position: [99, 99, 99], rotation: [0, 0, 0], scale: [1, 1, 1] });
    expect(useSceneStore.getState().nodes.find((n) => n.id === b)!.transform).toEqual(originalB);
  });
});

// ── updatePrimitiveParams ──────────────────────────────────────────────────────

describe('updatePrimitiveParams', () => {
  it('replaces geometry on the target node', () => {
    const id = addBox();
    const newGeo = { type: 'sphere' as const, radius: 7, widthSegments: 32, heightSegments: 16 };
    useSceneStore.getState().updatePrimitiveParams(id, newGeo);
    expect(useSceneStore.getState().nodes.find((n) => n.id === id)!.geometry).toEqual(newGeo);
  });

  it('does not affect other nodes', () => {
    const a = addBox();
    const b = addBox();
    const geoBefore = useSceneStore.getState().nodes.find((n) => n.id === b)!.geometry;
    useSceneStore.getState().updatePrimitiveParams(a, { type: 'cone', radius: 5, height: 10, radialSegments: 32 });
    expect(useSceneStore.getState().nodes.find((n) => n.id === b)!.geometry).toEqual(geoBefore);
  });
});

// ── setTransformMode ───────────────────────────────────────────────────────────

describe('setTransformMode', () => {
  it('defaults to translate', () => {
    expect(useSceneStore.getState().transformMode).toBe('translate');
  });

  it('switches to rotate', () => {
    useSceneStore.getState().setTransformMode('rotate');
    expect(useSceneStore.getState().transformMode).toBe('rotate');
  });

  it('switches to scale', () => {
    useSceneStore.getState().setTransformMode('scale');
    expect(useSceneStore.getState().transformMode).toBe('scale');
  });

  it('switches back to translate', () => {
    useSceneStore.getState().setTransformMode('scale');
    useSceneStore.getState().setTransformMode('translate');
    expect(useSceneStore.getState().transformMode).toBe('translate');
  });
});

// ── setWorkplane ───────────────────────────────────────────────────────────────

describe('setWorkplane', () => {
  it('stores the new workplane', () => {
    const newWp = { origin: [5, 0, 0] as [number,number,number], normal: [1, 0, 0] as [number,number,number], tangentX: [0, 0, -1] as [number,number,number] };
    useSceneStore.getState().setWorkplane(newWp);
    expect(useSceneStore.getState().workplane).toEqual(newWp);
  });

  it('replaces a previously set workplane', () => {
    const first  = { origin: [0, 0, 0] as [number,number,number], normal: [0, 0, 1] as [number,number,number], tangentX: [1, 0, 0] as [number,number,number] };
    const second = { origin: [3, 2, 1] as [number,number,number], normal: [0, 1, 0] as [number,number,number], tangentX: [1, 0, 0] as [number,number,number] };
    useSceneStore.getState().setWorkplane(first);
    useSceneStore.getState().setWorkplane(second);
    expect(useSceneStore.getState().workplane).toEqual(second);
  });
});

// ── setWorkplanePlacementMode ──────────────────────────────────────────────────

describe('setWorkplanePlacementMode', () => {
  it('defaults to false', () => {
    expect(useSceneStore.getState().workplanePlacementMode).toBe(false);
  });

  it('setWorkplanePlacementMode(true) enables placement mode', () => {
    useSceneStore.getState().setWorkplanePlacementMode(true);
    expect(useSceneStore.getState().workplanePlacementMode).toBe(true);
  });

  it('setWorkplanePlacementMode(false) disables placement mode', () => {
    useSceneStore.getState().setWorkplanePlacementMode(true);
    useSceneStore.getState().setWorkplanePlacementMode(false);
    expect(useSceneStore.getState().workplanePlacementMode).toBe(false);
  });
});
