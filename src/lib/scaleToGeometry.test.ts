import { describe, it, expect } from 'vitest';
import { applyAxisScaleToGeometry, hasDirectDimensionScale, bakeScaleIntoDimensions } from './scaleToGeometry';
import type { PrimitiveParams, SceneNode } from '../types/scene';

const ALL_TYPES: PrimitiveParams['type'][] = [
  'box', 'sphere', 'cylinder', 'cone', 'torus', 'beerglass',
  'wedge', 'roof', 'pyramid', 'tube', 'dome', 'polygon',
  'ellipsoid', 'capsule', 'torusknot', 'imported', 'group',
];

const MAPPED_TYPES: PrimitiveParams['type'][] = [
  'box', 'cylinder', 'cone', 'torus', 'beerglass',
  'wedge', 'roof', 'pyramid', 'tube', 'polygon', 'ellipsoid', 'capsule',
];

/** A minimal, valid geometry object for each type, for generic mapping tests. */
function sampleGeometry(type: PrimitiveParams['type']): PrimitiveParams {
  switch (type) {
    case 'box': return { type, width: 10, height: 20, depth: 30 };
    case 'sphere': return { type, radius: 10, widthSegments: 32, heightSegments: 16 };
    case 'cylinder': return { type, radius: 10, height: 20, radialSegments: 32 };
    case 'cone': return { type, radiusTop: 0, radiusBottom: 10, height: 20, radialSegments: 32 };
    case 'torus': return { type, radius: 10, tube: 4, radialSegments: 16, tubularSegments: 32 };
    case 'beerglass': return { type, radiusUpper: 10, radiusLower: 8, height: 30, radialSegments: 32 };
    case 'wedge': return { type, width: 10, depth: 20, height: 30 };
    case 'roof': return { type, width: 10, depth: 20, height: 30 };
    case 'pyramid': return { type, width: 10, depth: 20, height: 30 };
    case 'tube': return { type, outerRadius: 10, innerRadius: 6, height: 20, radialSegments: 32 };
    case 'dome': return { type, radius: 10, widthSegments: 32, heightSegments: 16 };
    case 'polygon': return { type, sides: 6, radius: 10, height: 20 };
    case 'ellipsoid': return { type, radiusX: 10, radiusY: 12, radiusZ: 14, widthSegments: 32, heightSegments: 16 };
    case 'capsule': return { type, radius: 10, length: 20, capSegments: 8, radialSegments: 16 };
    case 'torusknot': return { type, radius: 10, tube: 3, tubularSegments: 64, radialSegments: 8, p: 2, q: 3 };
    case 'imported': return { type, meshId: 'mesh-1', originalName: 'part.stl' };
    case 'group': return { type };
  }
}

function makeNode(geometry: PrimitiveParams, scale: [number, number, number]): SceneNode {
  return {
    id: 'n1',
    name: 'Test',
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale },
    geometry,
    material: { color: '#4488ff', opacity: 1, wireframe: false },
    parentId: null,
    childIds: [],
    csgOperation: null,
    csgError: null,
  };
}

describe('applyAxisScaleToGeometry / hasDirectDimensionScale — coverage stays in sync', () => {
  for (const type of ALL_TYPES) {
    const expectMapped = MAPPED_TYPES.includes(type);
    it(`${type}: ${expectMapped ? 'is' : 'is not'} directly scalable`, () => {
      expect(hasDirectDimensionScale(type)).toBe(expectMapped);
      const result = applyAxisScaleToGeometry(sampleGeometry(type), [1.5, 1.5, 1.5]);
      expect(result !== null).toBe(expectMapped);
    });
  }
});

describe('applyAxisScaleToGeometry — per-shape mapping', () => {
  it('box: independent X/Y/Z', () => {
    const g = applyAxisScaleToGeometry(sampleGeometry('box'), [2, 3, 4]);
    expect(g).toMatchObject({ width: 20, height: 60, depth: 120 });
  });

  it('cylinder: single-axis X drag scales radius by that factor alone (not averaged with untouched Z)', () => {
    const g = applyAxisScaleToGeometry(sampleGeometry('cylinder'), [2, 1, 1]);
    expect(g).toMatchObject({ radius: 20, height: 20 });
  });

  it('cylinder: Y drag scales only height', () => {
    const g = applyAxisScaleToGeometry(sampleGeometry('cylinder'), [1, 2, 1]);
    expect(g).toMatchObject({ radius: 10, height: 40 });
  });

  it('ellipsoid: fully independent X/Y/Z (already has per-axis radii)', () => {
    const g = applyAxisScaleToGeometry(sampleGeometry('ellipsoid'), [2, 3, 4]);
    expect(g).toMatchObject({ radiusX: 20, radiusY: 36, radiusZ: 56 });
  });

  it('cone: both radii scale together with X/Z, height with Y', () => {
    const g = applyAxisScaleToGeometry(sampleGeometry('cone'), [2, 3, 2]);
    expect(g).toMatchObject({ radiusTop: 0, radiusBottom: 20, height: 60 });
  });

  it('clamps dimensions to a small positive minimum instead of going to zero/negative', () => {
    const g = applyAxisScaleToGeometry(sampleGeometry('box'), [0, 0, 0]) as { width: number; height: number; depth: number };
    expect(g.width).toBeGreaterThan(0);
    expect(g.height).toBeGreaterThan(0);
    expect(g.depth).toBeGreaterThan(0);
  });

  it('sphere, dome, torusknot, group, imported all fall back to null (keep transform.scale)', () => {
    expect(applyAxisScaleToGeometry(sampleGeometry('sphere'), [2, 1, 1])).toBeNull();
    expect(applyAxisScaleToGeometry(sampleGeometry('dome'), [2, 1, 1])).toBeNull();
    expect(applyAxisScaleToGeometry(sampleGeometry('torusknot'), [2, 1, 1])).toBeNull();
    expect(applyAxisScaleToGeometry(sampleGeometry('group'), [2, 1, 1])).toBeNull();
    expect(applyAxisScaleToGeometry(sampleGeometry('imported'), [2, 1, 1])).toBeNull();
  });
});

describe('bakeScaleIntoDimensions', () => {
  it('leaves an already-identity-scale node untouched', () => {
    const node = makeNode(sampleGeometry('box'), [1, 1, 1]);
    expect(bakeScaleIntoDimensions(node)).toBe(node);
  });

  it('bakes a mapped shape\'s scale into its params and resets scale to identity', () => {
    const node = makeNode(sampleGeometry('box'), [1, 2, 1]);
    const baked = bakeScaleIntoDimensions(node);
    expect(baked.transform.scale).toEqual([1, 1, 1]);
    expect((baked.geometry as { height: number }).height).toBe(40);
  });

  it('leaves an unmapped shape\'s scale as-is (sphere has no per-axis params to bake into)', () => {
    const node = makeNode(sampleGeometry('sphere'), [1, 2, 1]);
    const baked = bakeScaleIntoDimensions(node);
    expect(baked.transform.scale).toEqual([1, 2, 1]);
    expect(baked.geometry).toEqual(sampleGeometry('sphere'));
  });
});
