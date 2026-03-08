// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseModelXml, parseMeshDefsFromZip } from './threemfImport';

// ── XML fixture helpers ────────────────────────────────────────────────────

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

/** Wraps a model XML string in a minimal 3MF ZIP. */
function makeZip(modelXml: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES_XML),
    '_rels/.rels': strToU8(RELS_XML),
    '3D/3dmodel.model': strToU8(modelXml),
  });
}

/** Minimal valid 3MF model XML with a single named object. */
function makeSingleObjectXml(name = 'TestObj', type = 'model'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
      xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" name="${name}" type="${type}">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="10" y="0" z="0"/>
          <vertex x="0" y="10" z="0"/>
          <vertex x="0" y="0" z="10"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2"/>
          <triangle v1="0" v2="1" v3="3"/>
          <triangle v1="0" v2="2" v3="3"/>
          <triangle v1="1" v2="2" v3="3"/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build><item objectid="1"/></build>
</model>`;
}

/** 3MF model XML with two named model objects. */
const TWO_OBJECTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
      xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" name="Alpha" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="5" y="0" z="0"/>
          <vertex x="0" y="5" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2"/>
        </triangles>
      </mesh>
    </object>
    <object id="2" name="Beta" type="model">
      <mesh>
        <vertices>
          <vertex x="10" y="0" z="0"/>
          <vertex x="15" y="0" z="0"/>
          <vertex x="10" y="5" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2"/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
    <item objectid="2"/>
  </build>
</model>`;

/** 3MF model XML where one object has no vertices (degenerate). */
const DEGENERATE_OBJECT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
      xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" name="Empty" type="model">
      <mesh>
        <vertices/>
        <triangles/>
      </mesh>
    </object>
  </resources>
  <build><item objectid="1"/></build>
</model>`;

// ── parseModelXml ──────────────────────────────────────────────────────────

describe('parseModelXml — object count', () => {
  it('returns one object for a single model object', () => {
    const result = parseModelXml(makeSingleObjectXml());
    expect(result).toHaveLength(1);
  });

  it('returns two objects for two model objects', () => {
    const result = parseModelXml(TWO_OBJECTS_XML);
    expect(result).toHaveLength(2);
  });

  it('skips objects with type="support"', () => {
    const xml = makeSingleObjectXml('SupportPart', 'support');
    const result = parseModelXml(xml);
    expect(result).toHaveLength(0);
  });

  it('skips objects without vertices or triangles', () => {
    const result = parseModelXml(DEGENERATE_OBJECT_XML);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for model with no objects', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources/>
  <build/>
</model>`;
    expect(parseModelXml(xml)).toHaveLength(0);
  });
});

describe('parseModelXml — names', () => {
  it('extracts the object name attribute', () => {
    const [obj] = parseModelXml(makeSingleObjectXml('MyPart'));
    expect(obj.name).toBe('MyPart');
  });

  it('uses "Imported" as fallback when name attribute is absent', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2"/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build><item objectid="1"/></build>
</model>`;
    const [obj] = parseModelXml(xml);
    expect(obj.name).toBe('Imported');
  });

  it('returns names for both objects in a two-object file', () => {
    const [a, b] = parseModelXml(TWO_OBJECTS_XML);
    expect(a.name).toBe('Alpha');
    expect(b.name).toBe('Beta');
  });
});

describe('parseModelXml — geometry', () => {
  it('returns a BufferGeometry with a position attribute', () => {
    const [obj] = parseModelXml(makeSingleObjectXml());
    expect(obj.geometry.getAttribute('position')).not.toBeNull();
    obj.geometry.dispose();
  });

  it('has a normal attribute after computeVertexNormals', () => {
    const [obj] = parseModelXml(makeSingleObjectXml());
    expect(obj.geometry.getAttribute('normal')).not.toBeNull();
    obj.geometry.dispose();
  });

  it('position attribute has the correct vertex count', () => {
    // The single-object fixture has 4 vertices
    const [obj] = parseModelXml(makeSingleObjectXml());
    expect(obj.geometry.getAttribute('position').count).toBe(4);
    obj.geometry.dispose();
  });

  it('index buffer has the correct triangle index count', () => {
    // 4 triangles × 3 indices = 12
    const [obj] = parseModelXml(makeSingleObjectXml());
    expect(obj.geometry.index!.count).toBe(12);
    obj.geometry.dispose();
  });

  it('parses vertex coordinates correctly', () => {
    const [obj] = parseModelXml(makeSingleObjectXml());
    const pos = obj.geometry.getAttribute('position') as THREE.BufferAttribute;
    // Vertex 0 should be at (0, 0, 0)
    expect(pos.getX(0)).toBeCloseTo(0, 5);
    expect(pos.getY(0)).toBeCloseTo(0, 5);
    expect(pos.getZ(0)).toBeCloseTo(0, 5);
    // Vertex 1 should be at (10, 0, 0)
    expect(pos.getX(1)).toBeCloseTo(10, 5);
    obj.geometry.dispose();
  });

  it('parses triangle indices correctly', () => {
    const [obj] = parseModelXml(makeSingleObjectXml());
    const idx = obj.geometry.index!;
    // First triangle: v1=0, v2=1, v3=2
    expect(idx.getX(0)).toBe(0);
    expect(idx.getX(1)).toBe(1);
    expect(idx.getX(2)).toBe(2);
    obj.geometry.dispose();
  });
});

// ── parseMeshDefsFromZip ───────────────────────────────────────────────────

describe('parseMeshDefsFromZip', () => {
  it('parses a valid 3MF ZIP and returns named geometries', () => {
    const zip = makeZip(makeSingleObjectXml('ZipPart'));
    const result = parseMeshDefsFromZip(zip);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('ZipPart');
    result[0].geometry.dispose();
  });

  it('throws if the ZIP contains no 3D/3dmodel.model entry', () => {
    const zip = zipSync({ 'other.txt': strToU8('hello') });
    expect(() => parseMeshDefsFromZip(zip)).toThrow();
  });

  it('returns two objects from a two-object 3MF ZIP', () => {
    const zip = makeZip(TWO_OBJECTS_XML);
    const result = parseMeshDefsFromZip(zip);
    expect(result).toHaveLength(2);
    result.forEach((r) => r.geometry.dispose());
  });

  it('round-trips geometry vertex count through ZIP', () => {
    const zip = makeZip(makeSingleObjectXml());
    const [obj] = parseMeshDefsFromZip(zip);
    expect(obj.geometry.getAttribute('position').count).toBe(4);
    obj.geometry.dispose();
  });
});

// THREE is referenced only as a type in this file
import type * as THREE from 'three';
