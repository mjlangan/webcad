import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  buildWebcadPayload,
  parseWebcadPayload,
  WEBCAD_VERSION,
} from './sceneFile';
import { geometryToStl } from './geometryToStl';
import type { SceneNode, Workplane } from '../types/scene';

const DEFAULT_WP: Workplane = { origin: [0, 0, 0], normal: [0, 1, 0], tangentX: [1, 0, 0] };

function makeBoxNode(id: string): SceneNode {
  return {
    id,
    name: 'Box',
    visible: true,
    locked: false,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    geometry: { type: 'box', width: 10, height: 10, depth: 10 },
    material: { color: '#4488ff', opacity: 1, wireframe: false },
    parentId: null,
    childIds: [],
    csgOperation: null,
    csgError: null,
  };
}

function makeImportedNode(id: string, meshId: string): SceneNode {
  return {
    id,
    name: 'Mesh',
    visible: true,
    locked: false,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    geometry: { type: 'imported', meshId, originalName: 'Mesh' },
    material: { color: '#4488ff', opacity: 1, wireframe: false },
    parentId: null,
    childIds: [],
    csgOperation: null,
    csgError: null,
  };
}

// ── arrayBufferToBase64 / base64ToArrayBuffer ──────────────────────────────

describe('arrayBufferToBase64 / base64ToArrayBuffer', () => {
  it('encodes and decodes an ArrayBuffer identity', () => {
    const original = new Uint8Array([0, 1, 2, 3, 127, 128, 255]).buffer;
    const encoded = arrayBufferToBase64(original);
    const decoded = base64ToArrayBuffer(encoded);
    expect(new Uint8Array(decoded)).toEqual(new Uint8Array(original));
  });

  it('returns a non-empty string for non-empty buffer', () => {
    const encoded = arrayBufferToBase64(new Uint8Array([1, 2, 3]).buffer);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('encodes zero-length buffer to empty string', () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe('');
  });

  it('round-trips a binary STL buffer', () => {
    const geo = new THREE.BoxGeometry(10, 10, 10);
    const stl = geometryToStl(geo);
    const encoded = arrayBufferToBase64(stl);
    const decoded = base64ToArrayBuffer(encoded);
    expect(new Uint8Array(decoded)).toEqual(new Uint8Array(stl));
    geo.dispose();
  });

  it('different buffers produce different encodings', () => {
    const a = arrayBufferToBase64(new Uint8Array([1, 2, 3]).buffer);
    const b = arrayBufferToBase64(new Uint8Array([4, 5, 6]).buffer);
    expect(a).not.toBe(b);
  });
});

// ── buildWebcadPayload ─────────────────────────────────────────────────────

describe('buildWebcadPayload', () => {
  it('sets version to WEBCAD_VERSION', () => {
    const p = buildWebcadPayload([], DEFAULT_WP, new Map());
    expect(p.version).toBe(WEBCAD_VERSION);
  });

  it('includes a savedAt ISO timestamp', () => {
    const p = buildWebcadPayload([], DEFAULT_WP, new Map());
    expect(new Date(p.savedAt).getFullYear()).toBeGreaterThan(2020);
  });

  it('embeds the workplane in data', () => {
    const wp: Workplane = { origin: [1, 2, 3], normal: [0, 0, 1], tangentX: [1, 0, 0] };
    const p = buildWebcadPayload([], wp, new Map());
    expect(p.data.workplane).toEqual(wp);
  });

  it('embeds nodes in data', () => {
    const node = makeBoxNode('n1');
    const p = buildWebcadPayload([node], DEFAULT_WP, new Map());
    expect(p.data.nodes).toHaveLength(1);
    expect(p.data.nodes[0].id).toBe('n1');
  });

  it('base64-encodes imported mesh geometry to a non-empty string', () => {
    const meshId = 'mesh-1';
    const geo = new THREE.BoxGeometry(10, 10, 10);
    const p = buildWebcadPayload(
      [makeImportedNode('n1', meshId)],
      DEFAULT_WP,
      new Map([[meshId, geo]]),
    );
    expect(typeof p.data.meshes[meshId]).toBe('string');
    expect(p.data.meshes[meshId].length).toBeGreaterThan(0);
    geo.dispose();
  });

  it('de-duplicates meshes referenced by multiple nodes', () => {
    const meshId = 'shared';
    const geo = new THREE.BoxGeometry(5, 5, 5);
    const nodes = [makeImportedNode('n1', meshId), makeImportedNode('n2', meshId)];
    const p = buildWebcadPayload(nodes, DEFAULT_WP, new Map([[meshId, geo]]));
    expect(Object.keys(p.data.meshes)).toHaveLength(1);
    geo.dispose();
  });

  it('omits meshes not in the map (missing geometry)', () => {
    const p = buildWebcadPayload(
      [makeImportedNode('n1', 'missing')],
      DEFAULT_WP,
      new Map(),
    );
    expect(Object.keys(p.data.meshes)).toHaveLength(0);
  });

  it('primitive nodes produce no entries in meshes', () => {
    const p = buildWebcadPayload([makeBoxNode('n1')], DEFAULT_WP, new Map());
    expect(Object.keys(p.data.meshes)).toHaveLength(0);
  });
});

// ── parseWebcadPayload ─────────────────────────────────────────────────────

describe('parseWebcadPayload', () => {
  it('throws on unrecognized version', () => {
    const bad = {
      version: 99,
      savedAt: '',
      data: { nodes: [], workplane: DEFAULT_WP, meshes: {} },
    };
    expect(() => parseWebcadPayload(bad)).toThrow('99');
  });

  it('returns nodes unchanged', () => {
    const node = makeBoxNode('n1');
    const payload = buildWebcadPayload([node], DEFAULT_WP, new Map());
    const { nodes } = parseWebcadPayload(payload);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('n1');
    expect(nodes[0].geometry).toEqual(node.geometry);
  });

  it('returns workplane unchanged', () => {
    const wp: Workplane = { origin: [0, 5, 0], normal: [0, 1, 0], tangentX: [1, 0, 0] };
    const payload = buildWebcadPayload([], wp, new Map());
    expect(parseWebcadPayload(payload).workplane).toEqual(wp);
  });

  it('decodes imported mesh into a BufferGeometry', () => {
    const meshId = 'mx';
    const geo = new THREE.BoxGeometry(10, 10, 10);
    const payload = buildWebcadPayload(
      [makeImportedNode('n1', meshId)],
      DEFAULT_WP,
      new Map([[meshId, geo]]),
    );
    const { meshMap } = parseWebcadPayload(payload);
    expect(meshMap.has(meshId)).toBe(true);
    expect(meshMap.get(meshId)!.getAttribute('position')).not.toBeNull();
    geo.dispose();
  });

  it('returns empty meshMap when there are no imported meshes', () => {
    const payload = buildWebcadPayload([makeBoxNode('n1')], DEFAULT_WP, new Map());
    expect(parseWebcadPayload(payload).meshMap.size).toBe(0);
  });
});

// ── Round-trip ─────────────────────────────────────────────────────────────

describe('buildWebcadPayload → parseWebcadPayload round-trip', () => {
  it('preserves primitive node geometry and material', () => {
    const node = makeBoxNode('rt-1');
    const payload = buildWebcadPayload([node], DEFAULT_WP, new Map());
    const { nodes } = parseWebcadPayload(payload);
    expect(nodes[0].geometry).toEqual(node.geometry);
    expect(nodes[0].material).toEqual(node.material);
  });

  it('preserves non-default workplane after round-trip', () => {
    const wp: Workplane = { origin: [5, 5, 5], normal: [0, 0, 1], tangentX: [1, 0, 0] };
    const payload = buildWebcadPayload([], wp, new Map());
    expect(parseWebcadPayload(payload).workplane).toEqual(wp);
  });

  it('round-tripped imported mesh has correct bounding box dimensions', () => {
    const meshId = 'rt-mesh';
    // 10×10×10 centered box: AABB should be -5→5 on each axis
    const original = new THREE.BoxGeometry(10, 10, 10);
    original.computeBoundingBox();
    const meshMap = new Map([[meshId, original]]);
    const payload = buildWebcadPayload([makeImportedNode('rt-2', meshId)], DEFAULT_WP, meshMap);
    const { meshMap: decoded } = parseWebcadPayload(payload);
    const geo = decoded.get(meshId)!;
    geo.computeBoundingBox();
    expect(geo.boundingBox!.min.x).toBeCloseTo(original.boundingBox!.min.x, 2);
    expect(geo.boundingBox!.max.x).toBeCloseTo(original.boundingBox!.max.x, 2);
    original.dispose();
  });

  it('multiple nodes survive the round-trip', () => {
    const nodes = [makeBoxNode('a'), makeBoxNode('b'), makeBoxNode('c')];
    const payload = buildWebcadPayload(nodes, DEFAULT_WP, new Map());
    const { nodes: out } = parseWebcadPayload(payload);
    expect(out.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });
});
