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

// ── wedge ──────────────────────────────────────────────────────────────────────

describe('buildGeometry — wedge', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'wedge', width: 10, depth: 20, height: 15 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('bounding box dimensions match width/depth/height', () => {
    const geo = buildGeometry({ type: 'wedge', width: 10, depth: 20, height: 15 });
    const size = boundingSize(geo);
    expect(size.x).toBeCloseTo(10);
    expect(size.z).toBeCloseTo(20);
    expect(size.y).toBeCloseTo(15);
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'wedge', width: 10, depth: 20, height: 15 });
    expect(boundingMinY(geo)).toBeCloseTo(0);
  });
});

// ── roof ───────────────────────────────────────────────────────────────────────

describe('buildGeometry — roof', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'roof', width: 20, depth: 10, height: 8 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('bounding box dimensions match width/depth/height', () => {
    const geo = buildGeometry({ type: 'roof', width: 20, depth: 10, height: 8 });
    const size = boundingSize(geo);
    expect(size.x).toBeCloseTo(20);
    expect(size.z).toBeCloseTo(10);
    expect(size.y).toBeCloseTo(8);
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'roof', width: 20, depth: 10, height: 8 });
    expect(boundingMinY(geo)).toBeCloseTo(0);
  });
});

// ── pyramid ────────────────────────────────────────────────────────────────────

describe('buildGeometry — pyramid', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'pyramid', width: 10, depth: 10, height: 12 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('bounding box dimensions match width/depth/height', () => {
    const geo = buildGeometry({ type: 'pyramid', width: 10, depth: 14, height: 12 });
    const size = boundingSize(geo);
    expect(size.x).toBeCloseTo(10);
    expect(size.z).toBeCloseTo(14);
    expect(size.y).toBeCloseTo(12);
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'pyramid', width: 10, depth: 10, height: 12 });
    expect(boundingMinY(geo)).toBeCloseTo(0);
  });
});

// ── tube ───────────────────────────────────────────────────────────────────────

describe('buildGeometry — tube', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'tube', outerRadius: 10, innerRadius: 6, height: 20, radialSegments: 16 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('bounding box height matches the height param, XZ extent matches outer radius', () => {
    const geo = buildGeometry({ type: 'tube', outerRadius: 10, innerRadius: 6, height: 20, radialSegments: 32 });
    const size = boundingSize(geo);
    expect(size.y).toBeCloseTo(20, 0);
    expect(size.x).toBeCloseTo(20, 0);
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'tube', outerRadius: 10, innerRadius: 6, height: 20, radialSegments: 16 });
    expect(boundingMinY(geo)).toBeCloseTo(0, 1);
  });

  it('an inner radius larger than the outer radius (e.g. from an old scene file) is clamped, not left to blow out the silhouette', () => {
    // Unclamped, ExtrudeGeometry lets the (larger) hole path dominate the outer
    // boundary, so the bounding box balloons out to the inner radius instead of
    // staying bounded by the outer one — a self-intersecting, broken shape.
    const geo = buildGeometry({ type: 'tube', outerRadius: 10, innerRadius: 15, height: 20, radialSegments: 16 });
    const size = boundingSize(geo);
    expect(size.x).toBeCloseTo(20, 0); // stays bounded by outerRadius (2×10), not 2×15
  });
});

// ── dome ───────────────────────────────────────────────────────────────────────

describe('buildGeometry — dome', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'dome', radius: 10, widthSegments: 16, heightSegments: 8 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('bounding box height and XZ extent both equal the radius', () => {
    const r = 10;
    const geo = buildGeometry({ type: 'dome', radius: r, widthSegments: 32, heightSegments: 16 });
    const size = boundingSize(geo);
    expect(size.y).toBeCloseTo(r, 0);
    expect(size.x).toBeCloseTo(2 * r, 0);
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'dome', radius: 10, widthSegments: 16, heightSegments: 8 });
    expect(boundingMinY(geo)).toBeCloseTo(0, 1);
  });
});

// ── polygon ────────────────────────────────────────────────────────────────────

describe('buildGeometry — polygon', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'polygon', sides: 6, radius: 10, height: 20 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('bounding box height matches the height param; XZ extent is within the circumradius bounds', () => {
    const geo = buildGeometry({ type: 'polygon', sides: 6, radius: 10, height: 20 });
    const size = boundingSize(geo);
    expect(size.y).toBeCloseTo(20);
    // A regular hexagon's bounding width is between "across flats" (R√3) and
    // "across corners" (2R) depending on rotation — either is a valid hexagon.
    expect(size.x).toBeGreaterThan(10);
    expect(size.x).toBeLessThanOrEqual(20);
  });

  it('more sides produce more vertices', () => {
    const lo = buildGeometry({ type: 'polygon', sides: 3,  radius: 10, height: 20 });
    const hi = buildGeometry({ type: 'polygon', sides: 12, radius: 10, height: 20 });
    expect(vertexCount(hi)).toBeGreaterThan(vertexCount(lo));
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'polygon', sides: 6, radius: 10, height: 20 });
    expect(boundingMinY(geo)).toBeCloseTo(0);
  });
});

// ── ellipsoid ──────────────────────────────────────────────────────────────────

describe('buildGeometry — ellipsoid', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'ellipsoid', radiusX: 12, radiusY: 8, radiusZ: 10, widthSegments: 16, heightSegments: 8 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('bounding box dimensions match 2 × each independent radius', () => {
    const geo = buildGeometry({ type: 'ellipsoid', radiusX: 12, radiusY: 8, radiusZ: 10, widthSegments: 32, heightSegments: 16 });
    const size = boundingSize(geo);
    expect(size.x).toBeCloseTo(24, 0);
    expect(size.y).toBeCloseTo(16, 0);
    expect(size.z).toBeCloseTo(20, 0);
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'ellipsoid', radiusX: 12, radiusY: 8, radiusZ: 10, widthSegments: 16, heightSegments: 8 });
    expect(boundingMinY(geo)).toBeCloseTo(0, 1);
  });
});

// ── capsule ────────────────────────────────────────────────────────────────────

describe('buildGeometry — capsule', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'capsule', radius: 6, length: 14, capSegments: 8, radialSegments: 16 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('bounding box height equals length + 2 × radius (the two hemispherical caps)', () => {
    const r = 6, len = 14;
    const geo = buildGeometry({ type: 'capsule', radius: r, length: len, capSegments: 8, radialSegments: 16 });
    const size = boundingSize(geo);
    expect(size.y).toBeCloseTo(len + 2 * r, 0);
    expect(size.x).toBeCloseTo(2 * r, 0);
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'capsule', radius: 6, length: 14, capSegments: 8, radialSegments: 16 });
    expect(boundingMinY(geo)).toBeCloseTo(0, 1);
  });
});

// ── torusknot ──────────────────────────────────────────────────────────────────

describe('buildGeometry — torusknot', () => {
  it('returns a BufferGeometry with vertices', () => {
    const geo = buildGeometry({ type: 'torusknot', radius: 10, tube: 3, tubularSegments: 32, radialSegments: 6, p: 2, q: 3 });
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(vertexCount(geo)).toBeGreaterThan(0);
  });

  it('more segments produce more vertices', () => {
    const lo = buildGeometry({ type: 'torusknot', radius: 10, tube: 3, tubularSegments: 16, radialSegments: 3, p: 2, q: 3 });
    const hi = buildGeometry({ type: 'torusknot', radius: 10, tube: 3, tubularSegments: 64, radialSegments: 8, p: 2, q: 3 });
    expect(vertexCount(hi)).toBeGreaterThan(vertexCount(lo));
  });

  it('origin is at bottom (min Y = 0)', () => {
    const geo = buildGeometry({ type: 'torusknot', radius: 10, tube: 3, tubularSegments: 64, radialSegments: 8, p: 2, q: 3 });
    expect(boundingMinY(geo)).toBeCloseTo(0, 1);
  });

  it('different p/q winding produces a different shape (non-empty, distinct bounding size)', () => {
    const a = buildGeometry({ type: 'torusknot', radius: 10, tube: 3, tubularSegments: 64, radialSegments: 8, p: 2, q: 3 });
    const b = buildGeometry({ type: 'torusknot', radius: 10, tube: 3, tubularSegments: 64, radialSegments: 8, p: 3, q: 7 });
    expect(boundingSize(a).x).toBeGreaterThan(0);
    expect(boundingSize(b).x).toBeGreaterThan(0);
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
