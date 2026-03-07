import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { buildGeometry } from './buildGeometry';
import { meshGeometryMap } from './meshGeometryMap';

// ── helpers ────────────────────────────────────────────────────────────────────

function vertexCount(geo: THREE.BufferGeometry): number {
  return geo.attributes.position?.count ?? 0;
}

function boundingSize(geo: THREE.BufferGeometry): THREE.Vector3 {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  return bb.getSize(new THREE.Vector3());
}

function boundingMinY(geo: THREE.BufferGeometry): number {
  geo.computeBoundingBox();
  return geo.boundingBox!.min.y;
}

// ── box ────────────────────────────────────────────────────────────────────────

describe('buildGeometry — box', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'box', width: 10, height: 20, depth: 30 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('bounding box dimensions match width/height/depth', () => {
    const geo = buildGeometry({ type: 'box', width: 10, height: 20, depth: 30 });
    const size = boundingSize(geo);
    expect(size.x).toBeCloseTo(10);
    expect(size.y).toBeCloseTo(20);
    expect(size.z).toBeCloseTo(30);
  });

  it('different dimensions produce different bounding boxes', () => {
    const a = buildGeometry({ type: 'box', width: 5,  height: 5,  depth: 5  });
    const b = buildGeometry({ type: 'box', width: 10, height: 10, depth: 10 });
    expect(boundingSize(a).x).toBeCloseTo(5);
    expect(boundingSize(b).x).toBeCloseTo(10);
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'box', width: 10, height: 20, depth: 30 });
    expect(boundingMinY(geo)).toBeCloseTo(0);
  });
});

// ── sphere ─────────────────────────────────────────────────────────────────────

describe('buildGeometry — sphere', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'sphere', radius: 5, widthSegments: 8, heightSegments: 6 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('bounding box diameter equals 2 × radius', () => {
    const r = 7;
    const geo = buildGeometry({ type: 'sphere', radius: r, widthSegments: 16, heightSegments: 8 });
    const size = boundingSize(geo);
    expect(size.x).toBeCloseTo(2 * r, 1);
    expect(size.y).toBeCloseTo(2 * r, 1);
    expect(size.z).toBeCloseTo(2 * r, 1);
  });

  it('more segments produce more vertices', () => {
    const lo = buildGeometry({ type: 'sphere', radius: 5, widthSegments: 4,  heightSegments: 3  });
    const hi = buildGeometry({ type: 'sphere', radius: 5, widthSegments: 32, heightSegments: 16 });
    expect(vertexCount(hi)).toBeGreaterThan(vertexCount(lo));
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'sphere', radius: 7, widthSegments: 16, heightSegments: 8 });
    expect(boundingMinY(geo)).toBeCloseTo(0, 1);
  });
});

// ── cylinder ───────────────────────────────────────────────────────────────────

describe('buildGeometry — cylinder', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'cylinder', radiusTop: 5, radiusBottom: 5, height: 20, radialSegments: 8 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('bounding box height matches the height param', () => {
    const geo = buildGeometry({ type: 'cylinder', radiusTop: 5, radiusBottom: 5, height: 30, radialSegments: 8 });
    expect(boundingSize(geo).y).toBeCloseTo(30);
  });

  it('tapered cylinder (different radii) has non-uniform XZ extent', () => {
    const geo = buildGeometry({ type: 'cylinder', radiusTop: 2, radiusBottom: 8, height: 10, radialSegments: 16 });
    const size = boundingSize(geo);
    // widest cross-section is at the bottom, so XZ ≈ 2 × radiusBottom
    expect(size.x).toBeCloseTo(16, 0);
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'cylinder', radiusTop: 5, radiusBottom: 5, height: 30, radialSegments: 8 });
    expect(boundingMinY(geo)).toBeCloseTo(0);
  });
});

// ── cone ───────────────────────────────────────────────────────────────────────

describe('buildGeometry — cone', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'cone', radius: 5, height: 15, radialSegments: 8 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('bounding box height matches the height param', () => {
    const geo = buildGeometry({ type: 'cone', radius: 5, height: 15, radialSegments: 8 });
    expect(boundingSize(geo).y).toBeCloseTo(15);
  });

  it('bounding box XZ width equals 2 × radius', () => {
    const geo = buildGeometry({ type: 'cone', radius: 6, height: 10, radialSegments: 16 });
    expect(boundingSize(geo).x).toBeCloseTo(12, 0);
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'cone', radius: 5, height: 15, radialSegments: 8 });
    expect(boundingMinY(geo)).toBeCloseTo(0);
  });
});

// ── torus ──────────────────────────────────────────────────────────────────────

describe('buildGeometry — torus', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'torus', radius: 10, tube: 3, radialSegments: 8, tubularSegments: 16 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('overall diameter is approximately 2 × (radius + tube)', () => {
    const r = 10, t = 3;
    const geo = buildGeometry({ type: 'torus', radius: r, tube: t, radialSegments: 16, tubularSegments: 32 });
    const size = boundingSize(geo);
    expect(size.x).toBeCloseTo(2 * (r + t), 0);
  });

  it('more segments produce more vertices', () => {
    const lo = buildGeometry({ type: 'torus', radius: 10, tube: 3, radialSegments: 4,  tubularSegments: 8  });
    const hi = buildGeometry({ type: 'torus', radius: 10, tube: 3, radialSegments: 16, tubularSegments: 64 });
    expect(vertexCount(hi)).toBeGreaterThan(vertexCount(lo));
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'torus', radius: 10, tube: 3, radialSegments: 16, tubularSegments: 32 });
    expect(boundingMinY(geo)).toBeCloseTo(0, 1);
  });
});

// ── beerglass ──────────────────────────────────────────────────────────────────

describe('buildGeometry — beerglass', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'beerglass', radiusLower: 22, radiusUpper: 28.5, height: 130, radialSegments: 16 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('bounding box height equals the glass height', () => {
    const h = 130;
    const geo = buildGeometry({ type: 'beerglass', radiusLower: 22, radiusUpper: 28.5, height: h, radialSegments: 16 });
    expect(boundingSize(geo).y).toBeCloseTo(h, 0);
  });

  it('wider rim produces wider bounding box', () => {
    const narrow = buildGeometry({ type: 'beerglass', radiusLower: 20, radiusUpper: 20, height: 100, radialSegments: 16 });
    const wide   = buildGeometry({ type: 'beerglass', radiusLower: 20, radiusUpper: 40, height: 100, radialSegments: 16 });
    expect(boundingSize(wide).x).toBeGreaterThan(boundingSize(narrow).x);
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'beerglass', radiusLower: 22, radiusUpper: 28.5, height: 130, radialSegments: 16 });
    expect(boundingMinY(geo)).toBeCloseTo(0, 0);
  });
});

// ── imported ───────────────────────────────────────────────────────────────────

describe('buildGeometry — imported', () => {
  afterEach(() => {
    meshGeometryMap.clear();
  });

  it('returns an empty BufferGeometry for an unknown meshId', () => {
    const geo = buildGeometry({ type: 'imported', meshId: 'no-such-id', originalName: 'missing.stl' });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBe(0);
  });

  it('returns the exact geometry registered in meshGeometryMap', () => {
    const registered = new THREE.BoxGeometry(1, 1, 1);
    meshGeometryMap.set('cube-mesh', registered);
    const result = buildGeometry({ type: 'imported', meshId: 'cube-mesh', originalName: 'cube.stl' });
    expect(result).toBe(registered);
  });

  it('returns empty geometry after the entry is cleared from the map', () => {
    const registered = new THREE.BoxGeometry(1, 1, 1);
    meshGeometryMap.set('temp-mesh', registered);
    meshGeometryMap.delete('temp-mesh');
    const geo = buildGeometry({ type: 'imported', meshId: 'temp-mesh', originalName: 'temp.stl' });
    expect(vertexCount(geo)).toBe(0);
  });
});
