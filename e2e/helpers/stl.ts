/** Minimal binary-STL reader for e2e assertions — mirrors the format written
 *  by src/lib/geometryToStl.ts (80-byte header, uint32 triangle count, then
 *  50 bytes/triangle: 12-byte normal + 3×12-byte vertices + 2-byte padding). */
export interface ParsedStl {
  triangleCount: number;
  vertices: { x: number; y: number; z: number }[];
  bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
}

export function parseBinaryStl(buffer: Buffer): ParsedStl {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const triangleCount = view.getUint32(80, true);
  const vertices: { x: number; y: number; z: number }[] = [];

  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    offset += 12; // skip face normal
    for (let v = 0; v < 3; v++) {
      const x = view.getFloat32(offset, true); offset += 4;
      const y = view.getFloat32(offset, true); offset += 4;
      const z = view.getFloat32(offset, true); offset += 4;
      vertices.push({ x, y, z });
      min.x = Math.min(min.x, x); max.x = Math.max(max.x, x);
      min.y = Math.min(min.y, y); max.y = Math.max(max.y, y);
      min.z = Math.min(min.z, z); max.z = Math.max(max.z, z);
    }
    offset += 2; // attribute byte count
  }

  return { triangleCount, vertices, bounds: { min, max } };
}
