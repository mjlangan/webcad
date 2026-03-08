import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { strToU8, zipSync } from 'fflate';
import { buildGeometry } from './buildGeometry';
import { geometryToStl } from './geometryToStl';
import { triggerDownload } from './sceneFile';
import { useSceneStore } from '../store/useSceneStore';
import type { SceneNode } from '../types/scene';

/** Returns the set of nodes to export: selection if non-empty, else all visible root nodes. */
function getExportNodes(): SceneNode[] {
  const { nodes, selectedIds } = useSceneStore.getState();
  if (selectedIds.length > 0) {
    return nodes.filter((n) => selectedIds.includes(n.id) && n.visible);
  }
  return nodes.filter((n) => n.parentId === null && n.visible);
}

/** Returns a world-space geometry with the node's transform baked in. */
export function buildWorldGeometry(node: SceneNode): THREE.BufferGeometry {
  const geo = buildGeometry(node.geometry).clone();
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...node.transform.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...node.transform.rotation)),
    new THREE.Vector3(...node.transform.scale),
  );
  geo.applyMatrix4(matrix);
  return geo.index ? geo.toNonIndexed() : geo;
}

/** Returns a THREE.Mesh with world-space geometry and a standard material. */
function buildExportMesh(node: SceneNode): THREE.Mesh {
  const geo = buildWorldGeometry(node);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: node.material.color,
    opacity: node.material.opacity,
    transparent: node.material.opacity < 1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = node.name;
  return mesh;
}

// ---------------------------------------------------------------------------
// STL
// ---------------------------------------------------------------------------

export function exportStl(): void {
  const nodes = getExportNodes();
  if (nodes.length === 0) {
    window.alert('Nothing to export.');
    return;
  }

  const geos = nodes.map(buildWorldGeometry);
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());

  if (!merged) {
    window.alert('Failed to merge geometries for STL export.');
    return;
  }

  const buffer = geometryToStl(merged);
  merged.dispose();
  triggerDownload(new Blob([buffer], { type: 'model/stl' }), 'export.stl');
}

// ---------------------------------------------------------------------------
// OBJ
// ---------------------------------------------------------------------------

export function exportObj(): void {
  const nodes = getExportNodes();
  if (nodes.length === 0) {
    window.alert('Nothing to export.');
    return;
  }

  const group = new THREE.Group();
  for (const node of nodes) {
    group.add(buildExportMesh(node));
  }

  const exporter = new OBJExporter();
  const objString = exporter.parse(group);
  triggerDownload(new Blob([objString], { type: 'text/plain' }), 'export.obj');

  group.children.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
    }
  });
}

// ---------------------------------------------------------------------------
// glTF/GLB
// ---------------------------------------------------------------------------

export async function exportGltf(): Promise<void> {
  const nodes = getExportNodes();
  if (nodes.length === 0) {
    window.alert('Nothing to export.');
    return;
  }

  const group = new THREE.Group();
  for (const node of nodes) {
    group.add(buildExportMesh(node));
  }

  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(group, { binary: true });
  const glb = result as ArrayBuffer;

  triggerDownload(new Blob([glb], { type: 'model/gltf-binary' }), 'export.glb');

  group.children.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
    }
  });
}

// ---------------------------------------------------------------------------
// 3MF
// ---------------------------------------------------------------------------

export function buildObjectXml(node: SceneNode, objectId: number): string {
  const geo = buildWorldGeometry(node);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const triangleCount = pos.count / 3;

  const vertices: string[] = [];
  const triangles: string[] = [];

  for (let i = 0; i < pos.count; i++) {
    vertices.push(
      `        <vertex x="${pos.getX(i).toFixed(6)}" y="${pos.getY(i).toFixed(6)}" z="${pos.getZ(i).toFixed(6)}"/>`,
    );
  }

  for (let i = 0; i < triangleCount; i++) {
    const base = i * 3;
    triangles.push(`        <triangle v1="${base}" v2="${base + 1}" v3="${base + 2}"/>`);
  }

  geo.dispose();
  const escapedName = node.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return (
    `    <object id="${objectId}" name="${escapedName}" type="model">\n` +
    `      <mesh>\n` +
    `        <vertices>\n${vertices.join('\n')}\n        </vertices>\n` +
    `        <triangles>\n${triangles.join('\n')}\n        </triangles>\n` +
    `      </mesh>\n` +
    `    </object>`
  );
}

export function export3mf(): void {
  const nodes = getExportNodes();
  if (nodes.length === 0) {
    window.alert('Nothing to export.');
    return;
  }

  const resourceObjects: string[] = [];
  const buildItems: string[] = [];

  nodes.forEach((node, i) => {
    const id = i + 1;
    resourceObjects.push(buildObjectXml(node, id));
    buildItems.push(`    <item objectid="${id}"/>`);
  });

  const modelXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    '  <resources>',
    resourceObjects.join('\n'),
    '  </resources>',
    '  <build>',
    buildItems.join('\n'),
    '  </build>',
    '</model>',
  ].join('\n');

  const contentTypesXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
    '</Types>',
  ].join('\n');

  const relsXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>',
    '</Relationships>',
  ].join('\n');

  const zipped = zipSync({
    '[Content_Types].xml': strToU8(contentTypesXml),
    '_rels/.rels': strToU8(relsXml),
    '3D/3dmodel.model': strToU8(modelXml),
  });

  triggerDownload(
    new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+zip' }),
    'export.3mf',
  );
}
