import { describe, it, expect, beforeEach } from 'vitest';
import { buildWorldGeometry, buildObjectXml } from './exportScene';
import type { SceneNode } from '../types/scene';

function makeNode(
  overrides: Partial<SceneNode> = {},
  geomOverrides: Partial<SceneNode['geometry']> = {},
): SceneNode {
  return {
    id: 'n1',
    name: 'TestBox',
    visible: true,
    locked: false,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    geometry: { type: 'box', width: 20, height: 20, depth: 20, ...geomOverrides } as SceneNode['geometry'],
    material: { color: '#4488ff', opacity: 1, wireframe: false },
    parentId: null,
    childIds: [],
    csgOperation: null,
    csgError: null,
    ...overrides,
  };
}

// ── buildWorldGeometry ─────────────────────────────────────────────────────

describe('buildWorldGeometry', () => {
  it('returns a non-indexed BufferGeometry', () => {
    const node = makeNode();
    const geo = buildWorldGeometry(node);
    expect(geo.index).toBeNull();
    geo.dispose();
  });

  it('has a position attribute', () => {
    const node = makeNode();
    const geo = buildWorldGeometry(node);
    expect(geo.getAttribute('position')).not.toBeNull();
    geo.dispose();
  });

  it('identity transform: bounding box matches buildGeometry bounding box', () => {
    const node = makeNode();
    const geo = buildWorldGeometry(node);
    geo.computeBoundingBox();
    // 20×20×20 box with origin at bottom → y goes from 0 to 20, x/z from -10 to 10
    expect(geo.boundingBox!.min.x).toBeCloseTo(-10, 2);
    expect(geo.boundingBox!.max.x).toBeCloseTo(10, 2);
    expect(geo.boundingBox!.min.y).toBeCloseTo(0, 2);
    expect(geo.boundingBox!.max.y).toBeCloseTo(20, 2);
    geo.dispose();
  });

  it('position offset shifts the bounding box', () => {
    const node = makeNode({ transform: { position: [5, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } });
    const geo = buildWorldGeometry(node);
    geo.computeBoundingBox();
    expect(geo.boundingBox!.min.x).toBeCloseTo(-10 + 5, 2);
    expect(geo.boundingBox!.max.x).toBeCloseTo(10 + 5, 2);
    geo.dispose();
  });

  it('uniform scale of 2 doubles the bounding box size', () => {
    const node = makeNode({ transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [2, 2, 2] } });
    const geo = buildWorldGeometry(node);
    geo.computeBoundingBox();
    expect(geo.boundingBox!.max.x - geo.boundingBox!.min.x).toBeCloseTo(40, 2);
    expect(geo.boundingBox!.max.y - geo.boundingBox!.min.y).toBeCloseTo(40, 2);
    geo.dispose();
  });

  it('scale [1, 2, 1] doubles height but not width', () => {
    const node = makeNode({ transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 2, 1] } });
    const geo = buildWorldGeometry(node);
    geo.computeBoundingBox();
    const width = geo.boundingBox!.max.x - geo.boundingBox!.min.x;
    const height = geo.boundingBox!.max.y - geo.boundingBox!.min.y;
    expect(width).toBeCloseTo(20, 2);
    expect(height).toBeCloseTo(40, 2);
    geo.dispose();
  });

  it('produces identical geometry for two calls with the same node', () => {
    const node = makeNode();
    const geo1 = buildWorldGeometry(node);
    const geo2 = buildWorldGeometry(node);
    geo1.computeBoundingBox();
    geo2.computeBoundingBox();
    expect(geo1.boundingBox!.min.x).toBeCloseTo(geo2.boundingBox!.min.x, 5);
    expect(geo1.boundingBox!.max.y).toBeCloseTo(geo2.boundingBox!.max.y, 5);
    geo1.dispose();
    geo2.dispose();
  });
});

// ── buildObjectXml ─────────────────────────────────────────────────────────

describe('buildObjectXml', () => {
  let xml: string;

  beforeEach(() => {
    xml = buildObjectXml(makeNode(), 1);
  });

  it('contains the correct objectId in the id attribute', () => {
    expect(xml).toContain('id="1"');
    const xml7 = buildObjectXml(makeNode(), 7);
    expect(xml7).toContain('id="7"');
  });

  it('contains the node name in the name attribute', () => {
    expect(xml).toContain('name="TestBox"');
  });

  it('sets type="model"', () => {
    expect(xml).toContain('type="model"');
  });

  it('contains <mesh>, <vertices>, and <triangles> tags', () => {
    expect(xml).toContain('<mesh>');
    expect(xml).toContain('<vertices>');
    expect(xml).toContain('<triangles>');
  });

  it('has the correct number of <vertex> elements for a 20×20×20 box', () => {
    // BoxGeometry → 24 indexed vertices → 36 non-indexed after toNonIndexed()
    const count = (xml.match(/<vertex /g) ?? []).length;
    expect(count).toBe(36);
  });

  it('has the correct number of <triangle> elements for a 20×20×20 box', () => {
    // 12 triangles (2 per face × 6 faces)
    const count = (xml.match(/<triangle /g) ?? []).length;
    expect(count).toBe(12);
  });

  it('contains x, y, z attributes on vertex elements', () => {
    expect(xml).toMatch(/<vertex x="[\d.-]+" y="[\d.-]+" z="[\d.-]+"\/>/);
  });

  it('contains v1, v2, v3 attributes on triangle elements', () => {
    expect(xml).toMatch(/<triangle v1="\d+" v2="\d+" v3="\d+"\/>/);
  });

  it('escapes & in node name', () => {
    const node = makeNode({ name: 'A & B' });
    const x = buildObjectXml(node, 1);
    expect(x).toContain('name="A &amp; B"');
    expect(x).not.toContain('name="A & B"');
  });

  it('escapes " in node name', () => {
    const node = makeNode({ name: 'Part "A"' });
    const x = buildObjectXml(node, 1);
    expect(x).toContain('&quot;');
  });

  it('vertex coordinates match the expected bounding box for a positioned node', () => {
    const node = makeNode({ transform: { position: [100, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } });
    const x = buildObjectXml(node, 1);
    // All x coordinates should be in the range [90, 110] for a 20-wide box at x=100
    const xVals = [...x.matchAll(/x="([\d.]+)"/g)].map(([, v]) => parseFloat(v));
    expect(xVals.every((v) => v >= 89 && v <= 111)).toBe(true);
  });
});
