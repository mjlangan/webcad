import * as THREE from 'three';

/**
 * Serializes a THREE.BufferGeometry to a binary STL ArrayBuffer.
 *
 * The geometry must be non-indexed (or will be converted) and have a
 * 'position' attribute. The transform should already be baked in.
 *
 * Binary STL format:
 *   80 bytes  – header (unused, zeroed)
 *    4 bytes  – uint32 triangle count
 *   Per triangle (50 bytes):
 *     12 bytes – face normal (3 x float32)
 *     12 bytes – vertex 0   (3 x float32)
 *     12 bytes – vertex 1   (3 x float32)
 *     12 bytes – vertex 2   (3 x float32)
 *      2 bytes – attribute byte count (0)
 */
export function geometryToStl(geometry: THREE.BufferGeometry): ArrayBuffer {
  // Work on a non-indexed copy so we have flat triangles
  const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();

  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  const triangleCount = posAttr.count / 3;

  const buffer = new ArrayBuffer(80 + 4 + triangleCount * 50);
  const view = new DataView(buffer);

  // Triangle count at offset 80
  view.setUint32(80, triangleCount, true);

  const _v0 = new THREE.Vector3();
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _normal = new THREE.Vector3();
  const _edge1 = new THREE.Vector3();
  const _edge2 = new THREE.Vector3();

  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    const base = i * 3;
    _v0.fromBufferAttribute(posAttr, base);
    _v1.fromBufferAttribute(posAttr, base + 1);
    _v2.fromBufferAttribute(posAttr, base + 2);

    // Compute face normal
    _edge1.subVectors(_v1, _v0);
    _edge2.subVectors(_v2, _v0);
    _normal.crossVectors(_edge1, _edge2).normalize();

    view.setFloat32(offset,      _normal.x, true); offset += 4;
    view.setFloat32(offset,      _normal.y, true); offset += 4;
    view.setFloat32(offset,      _normal.z, true); offset += 4;

    view.setFloat32(offset, _v0.x, true); offset += 4;
    view.setFloat32(offset, _v0.y, true); offset += 4;
    view.setFloat32(offset, _v0.z, true); offset += 4;

    view.setFloat32(offset, _v1.x, true); offset += 4;
    view.setFloat32(offset, _v1.y, true); offset += 4;
    view.setFloat32(offset, _v1.z, true); offset += 4;

    view.setFloat32(offset, _v2.x, true); offset += 4;
    view.setFloat32(offset, _v2.y, true); offset += 4;
    view.setFloat32(offset, _v2.z, true); offset += 4;

    // Attribute byte count (unused)
    view.setUint16(offset, 0, true); offset += 2;
  }

  geo.dispose();
  return buffer;
}
