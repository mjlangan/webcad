import { describe, it, expect } from 'vitest';
import { parseObjText } from './objImport';

// ── OBJ fixture strings ────────────────────────────────────────────────────

// A single triangle with no object declaration
const SINGLE_TRIANGLE_OBJ = `
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.0 1.0 0.0
f 1 2 3
`.trim();

// A named single object
const NAMED_OBJECT_OBJ = `
o CoolMesh
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.0 1.0 0.0
f 1 2 3
`.trim();

// Two named objects (with global vertex indices)
const TWO_OBJECTS_OBJ = `
o PartA
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.0 1.0 0.0
f 1 2 3
o PartB
v 2.0 0.0 0.0
v 3.0 0.0 0.0
v 2.0 1.0 0.0
f 4 5 6
`.trim();

// OBJ with normals to verify the loader handles them
const OBJ_WITH_NORMALS = `
o WithNormals
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.0 1.0 0.0
vn 0.0 0.0 1.0
f 1//1 2//1 3//1
`.trim();

// OBJ that produces no meshes (only a comment)
const EMPTY_OBJ = `
# empty file
`.trim();

// ── parseObjText ───────────────────────────────────────────────────────────

describe('parseObjText — mesh count', () => {
  it('returns one mesh for a simple triangle', () => {
    const result = parseObjText(SINGLE_TRIANGLE_OBJ, 'base');
    expect(result).toHaveLength(1);
  });

  it('returns one mesh for a named object', () => {
    const result = parseObjText(NAMED_OBJECT_OBJ, 'base');
    expect(result).toHaveLength(1);
  });

  it('returns two meshes for two named objects', () => {
    const result = parseObjText(TWO_OBJECTS_OBJ, 'base');
    expect(result).toHaveLength(2);
  });

  it('returns empty array for OBJ with no geometry', () => {
    const result = parseObjText(EMPTY_OBJ, 'base');
    expect(result).toHaveLength(0);
  });
});

describe('parseObjText — mesh names', () => {
  it('uses the o group name when present', () => {
    const [mesh] = parseObjText(NAMED_OBJECT_OBJ, 'MyFile');
    expect(mesh.originalName).toBe('CoolMesh');
  });

  it('uses baseName when there is no o group declaration', () => {
    const [mesh] = parseObjText(SINGLE_TRIANGLE_OBJ, 'MyFile');
    expect(mesh.originalName).toBe('MyFile');
  });

  it('gives each of two named objects its own name', () => {
    const [a, b] = parseObjText(TWO_OBJECTS_OBJ, 'base');
    expect(a.originalName).toBe('PartA');
    expect(b.originalName).toBe('PartB');
  });
});

describe('parseObjText — geometry processing', () => {
  it('returns a BufferGeometry with a position attribute', () => {
    const [mesh] = parseObjText(SINGLE_TRIANGLE_OBJ, 'base');
    expect(mesh.geometry.getAttribute('position')).not.toBeNull();
    mesh.geometry.dispose();
  });

  it('centered geometry has bounding box centered near origin', () => {
    const [mesh] = parseObjText(SINGLE_TRIANGLE_OBJ, 'base');
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const cx = (geo.boundingBox!.min.x + geo.boundingBox!.max.x) / 2;
    const cz = (geo.boundingBox!.min.z + geo.boundingBox!.max.z) / 2;
    expect(Math.abs(cx)).toBeCloseTo(0, 3);
    expect(Math.abs(cz)).toBeCloseTo(0, 3);
    geo.dispose();
  });

  it('yOffset equals the max.y of the centered bounding box', () => {
    const [mesh] = parseObjText(SINGLE_TRIANGLE_OBJ, 'base');
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    expect(mesh.yOffset).toBeCloseTo(geo.boundingBox!.max.y, 5);
    geo.dispose();
  });

  it('yOffset is non-negative', () => {
    const [mesh] = parseObjText(SINGLE_TRIANGLE_OBJ, 'base');
    expect(mesh.yOffset).toBeGreaterThanOrEqual(0);
    mesh.geometry.dispose();
  });

  it('handles OBJ with vertex normals without error', () => {
    expect(() => parseObjText(OBJ_WITH_NORMALS, 'nrm')).not.toThrow();
    const result = parseObjText(OBJ_WITH_NORMALS, 'nrm');
    expect(result).toHaveLength(1);
    result[0].geometry.dispose();
  });

  it('geometry has a normal attribute after import', () => {
    const [mesh] = parseObjText(SINGLE_TRIANGLE_OBJ, 'base');
    expect(mesh.geometry.getAttribute('normal')).not.toBeNull();
    mesh.geometry.dispose();
  });
});
