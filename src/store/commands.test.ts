import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from './useSceneStore';
import {
  AddNodeCommand,
  RemoveNodeCommand,
  RenameNodeCommand,
  TransformCommand,
  UpdateGeometryCommand,
} from './commands';
import type { Transform } from '../types/scene';

// Reset store to empty state before each test.
beforeEach(() => {
  useSceneStore.setState({ nodes: [], selectedIds: [], transformMode: 'translate' });
});

function getNodes() {
  return useSceneStore.getState().nodes;
}

function addBoxDirect() {
  return useSceneStore.getState().addNode({ type: 'box', width: 20, height: 20, depth: 20 });
}

// ── AddNodeCommand ─────────────────────────────────────────────────────────────

describe('AddNodeCommand', () => {
  it('execute() creates a node in the store', () => {
    const cmd = new AddNodeCommand({ type: 'box', width: 20, height: 20, depth: 20 });
    cmd.execute();
    expect(getNodes()).toHaveLength(1);
    expect(getNodes()[0].geometry).toEqual({ type: 'box', width: 20, height: 20, depth: 20 });
  });

  it('execute() respects an explicit initial position', () => {
    const cmd = new AddNodeCommand({ type: 'box', width: 10, height: 10, depth: 10 }, [5, 7, 9]);
    cmd.execute();
    expect(getNodes()[0].transform.position).toEqual([5, 7, 9]);
  });

  it('undo() removes the node created by execute()', () => {
    const cmd = new AddNodeCommand({ type: 'box', width: 20, height: 20, depth: 20 });
    cmd.execute();
    expect(getNodes()).toHaveLength(1);
    cmd.undo();
    expect(getNodes()).toHaveLength(0);
  });

  it('undo() before execute() is a no-op', () => {
    const cmd = new AddNodeCommand({ type: 'box', width: 20, height: 20, depth: 20 });
    expect(() => cmd.undo()).not.toThrow();
    expect(getNodes()).toHaveLength(0);
  });

  it('execute() → undo() → execute() re-creates the node (as a new node each time)', () => {
    const cmd = new AddNodeCommand({ type: 'sphere', radius: 5, widthSegments: 32, heightSegments: 16 });
    cmd.execute();
    const id1 = getNodes()[0].id;
    cmd.undo();
    cmd.execute();
    const id2 = getNodes()[0].id;
    // The second execute creates a fresh node; ids may differ
    expect(getNodes()).toHaveLength(1);
    expect(id2).not.toBe('');
    // The second execute replaced nodeId internally
    cmd.undo();
    expect(getNodes()).toHaveLength(0);
    // The second undo must also clean up (id2 must not be stale)
    void id1; // suppress unused warning
  });
});

// ── RemoveNodeCommand ──────────────────────────────────────────────────────────

describe('RemoveNodeCommand', () => {
  it('execute() removes the node', () => {
    const id = addBoxDirect();
    const cmd = new RemoveNodeCommand(id);
    cmd.execute();
    expect(getNodes().find((n) => n.id === id)).toBeUndefined();
  });

  it('undo() restores the node at its original index', () => {
    addBoxDirect();         // index 0
    const id = addBoxDirect(); // index 1
    addBoxDirect();         // index 2

    const cmd = new RemoveNodeCommand(id);
    cmd.execute();
    expect(getNodes()).toHaveLength(2);

    cmd.undo();
    expect(getNodes()).toHaveLength(3);
    expect(getNodes()[1].id).toBe(id);
  });

  it('undo() selects the restored node', () => {
    const id = addBoxDirect();
    const cmd = new RemoveNodeCommand(id);
    cmd.execute();
    cmd.undo();
    expect(useSceneStore.getState().selectedIds).toContain(id);
  });

  it('undo() before execute() is a no-op', () => {
    const cmd = new RemoveNodeCommand('nonexistent');
    expect(() => cmd.undo()).not.toThrow();
    expect(getNodes()).toHaveLength(0);
  });

  it('full round-trip: execute → undo → execute', () => {
    const id = addBoxDirect();
    const cmd = new RemoveNodeCommand(id);

    cmd.execute();
    expect(getNodes()).toHaveLength(0);

    cmd.undo();
    expect(getNodes()).toHaveLength(1);

    cmd.execute();
    expect(getNodes()).toHaveLength(0);
  });
});

// ── RenameNodeCommand ──────────────────────────────────────────────────────────

describe('RenameNodeCommand', () => {
  it('execute() renames the node', () => {
    const id = addBoxDirect();
    const before = getNodes().find((n) => n.id === id)!.name;
    const cmd = new RenameNodeCommand(id, before, 'NewName');
    cmd.execute();
    expect(getNodes().find((n) => n.id === id)!.name).toBe('NewName');
  });

  it('undo() restores the previous name', () => {
    const id = addBoxDirect();
    const original = getNodes().find((n) => n.id === id)!.name;
    const cmd = new RenameNodeCommand(id, original, 'Temp');
    cmd.execute();
    cmd.undo();
    expect(getNodes().find((n) => n.id === id)!.name).toBe(original);
  });

  it('full round-trip', () => {
    const id = addBoxDirect();
    const original = getNodes().find((n) => n.id === id)!.name;
    const cmd = new RenameNodeCommand(id, original, 'Renamed');
    cmd.execute();
    expect(getNodes().find((n) => n.id === id)!.name).toBe('Renamed');
    cmd.undo();
    expect(getNodes().find((n) => n.id === id)!.name).toBe(original);
    cmd.execute();
    expect(getNodes().find((n) => n.id === id)!.name).toBe('Renamed');
  });
});

// ── TransformCommand ───────────────────────────────────────────────────────────

describe('TransformCommand (single node)', () => {
  it('execute() applies the after transform', () => {
    const id = addBoxDirect();
    const before: Transform = { position: [0, 10, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    const after:  Transform = { position: [5, 20, 3], rotation: [0.1, 0, 0], scale: [2, 2, 2] };
    const cmd = new TransformCommand([id], [before], [after]);
    cmd.execute();
    expect(getNodes().find((n) => n.id === id)!.transform).toEqual(after);
  });

  it('undo() restores the before transform', () => {
    const id = addBoxDirect();
    const before: Transform = { position: [0, 10, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    const after:  Transform = { position: [5, 20, 3], rotation: [0.1, 0, 0], scale: [2, 2, 2] };
    const cmd = new TransformCommand([id], [before], [after]);
    cmd.execute();
    cmd.undo();
    expect(getNodes().find((n) => n.id === id)!.transform).toEqual(before);
  });
});

describe('TransformCommand (multiple nodes)', () => {
  it('execute() applies transforms to all nodes', () => {
    const a = addBoxDirect();
    const b = addBoxDirect();
    const beforeA: Transform = { position: [0, 10, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    const beforeB: Transform = { position: [0, 10, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    const afterA:  Transform = { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] };
    const afterB:  Transform = { position: [4, 5, 6], rotation: [0, 0, 0], scale: [1, 1, 1] };

    const cmd = new TransformCommand([a, b], [beforeA, beforeB], [afterA, afterB]);
    cmd.execute();

    expect(getNodes().find((n) => n.id === a)!.transform.position).toEqual([1, 2, 3]);
    expect(getNodes().find((n) => n.id === b)!.transform.position).toEqual([4, 5, 6]);
  });

  it('undo() restores all nodes to their before transforms', () => {
    const a = addBoxDirect();
    const b = addBoxDirect();
    const beforeA: Transform = { position: [0, 10, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    const beforeB: Transform = { position: [0, 10, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    const afterA:  Transform = { position: [7, 8, 9], rotation: [0, 0, 0], scale: [1, 1, 1] };
    const afterB:  Transform = { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] };

    const cmd = new TransformCommand([a, b], [beforeA, beforeB], [afterA, afterB]);
    cmd.execute();
    cmd.undo();

    expect(getNodes().find((n) => n.id === a)!.transform).toEqual(beforeA);
    expect(getNodes().find((n) => n.id === b)!.transform).toEqual(beforeB);
  });
});

// ── UpdateGeometryCommand ──────────────────────────────────────────────────────

describe('UpdateGeometryCommand', () => {
  it('execute() applies the new geometry', () => {
    const id = addBoxDirect();
    const before = getNodes().find((n) => n.id === id)!.geometry;
    const after = { type: 'sphere' as const, radius: 8, widthSegments: 32, heightSegments: 16 };
    const cmd = new UpdateGeometryCommand(id, before, after);
    cmd.execute();
    expect(getNodes().find((n) => n.id === id)!.geometry).toEqual(after);
  });

  it('undo() restores the original geometry', () => {
    const id = addBoxDirect();
    const before = getNodes().find((n) => n.id === id)!.geometry;
    const after = { type: 'cone' as const, radius: 5, height: 10, radialSegments: 32 };
    const cmd = new UpdateGeometryCommand(id, before, after);
    cmd.execute();
    cmd.undo();
    expect(getNodes().find((n) => n.id === id)!.geometry).toEqual(before);
  });

  it('full round-trip', () => {
    const id = addBoxDirect();
    const original = getNodes().find((n) => n.id === id)!.geometry;
    const modified = { type: 'cylinder' as const, radiusTop: 5, radiusBottom: 5, height: 20, radialSegments: 32 };
    const cmd = new UpdateGeometryCommand(id, original, modified);

    cmd.execute();
    expect(getNodes().find((n) => n.id === id)!.geometry).toEqual(modified);
    cmd.undo();
    expect(getNodes().find((n) => n.id === id)!.geometry).toEqual(original);
    cmd.execute();
    expect(getNodes().find((n) => n.id === id)!.geometry).toEqual(modified);
  });
});
