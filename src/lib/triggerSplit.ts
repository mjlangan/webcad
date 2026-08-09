import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { useSceneStore } from '../store/useSceneStore';
import { undoStack } from '../store/undoStack';
import { SplitCommand } from '../store/commands';
import { geometryToStl } from './geometryToStl';
import { meshGeometryMap } from './meshGeometryMap';
import { buildWorldGeometry } from './worldMatrix';
import { runSplit } from './splitWorker';
import type { SceneNode, Workplane, ImportedMeshParams, MaterialProps } from '../types/scene';

const stlLoader = new STLLoader();

// ── helpers ─────────────────────────────────────────────────────────────────

interface WrapGroupOptions {
  name: string;
  material: MaterialProps;
  /** Skip wrapping when there's exactly one non-group top-level child —
   *  just rename/un-parent it instead. */
  skipWrapSingleChild?: boolean;
}

/** Wraps the top-level nodes of `children` (nodes whose parentId doesn't
 *  point to another node in the same list) under a new group node. */
function wrapTopLevelInGroup(children: SceneNode[], opts: WrapGroupOptions): SceneNode[] {
  const topLevel = children.filter((n) => !children.some((m) => m.id === n.parentId));
  if (topLevel.length === 0) return [];
  if (opts.skipWrapSingleChild && topLevel.length === 1 && topLevel[0].geometry.type !== 'group') {
    return children.map((n) =>
      n.id === topLevel[0].id ? { ...n, name: opts.name, parentId: null } : n,
    );
  }
  const groupId = crypto.randomUUID();
  const groupNode: SceneNode = {
    id: groupId,
    name: opts.name,
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    geometry: { type: 'group' },
    material: opts.material,
    parentId: null,
    childIds: topLevel.map((n) => n.id),
    csgOperation: null,
    csgError: null,
  };
  const updatedChildren = children.map((n) =>
    topLevel.some((t) => t.id === n.id) ? { ...n, parentId: groupId } : n,
  );
  return [groupNode, ...updatedChildren];
}

/** Returns +1 if above plane, -1 if below, 0 if straddles. */
function classifyGeometry(geo: THREE.BufferGeometry, workplane: Workplane): 1 | -1 | 0 {
  const normal = new THREE.Vector3(...workplane.normal);
  const origin = new THREE.Vector3(...workplane.origin);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);

  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  let hasAbove = false;
  let hasBelow = false;
  const EPSILON = 1e-4;

  const v = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);
    const dist = plane.distanceToPoint(v);
    if (dist > EPSILON) hasAbove = true;
    else if (dist < -EPSILON) hasBelow = true;
    if (hasAbove && hasBelow) return 0;
  }
  return hasBelow ? -1 : 1;
}

function countTriangles(buf: ArrayBuffer): number {
  if (buf.byteLength < 84) return 0;
  return new DataView(buf).getUint32(80, true);
}

/** Deep-clone a node subtree (CSG hierarchy or group), assigning new IDs.
 *  Returns an ordered list of all cloned nodes (parents before children). */
function deepCloneSubtree(
  rootId: string,
  allNodes: SceneNode[],
  nameSuffix: string,
): SceneNode[] {
  const idMap = new Map<string, string>();

  function collect(id: string): SceneNode[] {
    const node = allNodes.find((n) => n.id === id);
    if (!node) return [];
    idMap.set(id, crypto.randomUUID());
    return [node, ...node.childIds.flatMap((c) => collect(c))];
  }

  const subtree = collect(rootId);

  return subtree.map((node) => {
    const newId = idMap.get(node.id)!;
    const isRoot = node.id === rootId;

    // For imported CSG results that straddle, clone the mesh geometry so each
    // half gets an independent copy (important if user later re-does CSG on it)
    let geometry = node.geometry;
    if (geometry.type === 'imported') {
      const srcGeo = meshGeometryMap.get((geometry as ImportedMeshParams).meshId);
      if (srcGeo) {
        const newMeshId = crypto.randomUUID();
        meshGeometryMap.set(newMeshId, srcGeo.clone());
        geometry = { ...geometry, meshId: newMeshId };
      }
    }

    return {
      ...node,
      id: newId,
      name: isRoot ? `${node.name} ${nameSuffix}` : node.name,
      geometry,
      parentId: node.parentId ? (idMap.get(node.parentId) ?? null) : null,
      childIds: node.childIds.map((c) => idMap.get(c) ?? c),
    };
  });
}

// ── recursive split ──────────────────────────────────────────────────────────

interface NodeSplitResult {
  nodes1: SceneNode[];  // nodes for the "above" side (parents first)
  nodes2: SceneNode[];  // nodes for the "below" side (parents first)
  intersects: boolean;  // true if this node actually straddles the plane
}

async function splitNodeRecursive(
  node: SceneNode,
  allNodes: SceneNode[],
  workplane: Workplane,
): Promise<NodeSplitResult> {

  // ── GROUP ────────────────────────────────────────────────────────────────
  if (node.geometry.type === 'group') {
    const childResults: NodeSplitResult[] = [];
    for (const childId of node.childIds) {
      const child = allNodes.find((n) => n.id === childId);
      if (!child) continue;
      childResults.push(await splitNodeRecursive(child, allNodes, workplane));
    }

    const side1Children = childResults.flatMap((r) => r.nodes1);
    const side2Children = childResults.flatMap((r) => r.nodes2);
    const intersects = childResults.some((r) => r.intersects);

    return {
      nodes1: side1Children.length > 0
        ? wrapTopLevelInGroup(side1Children, { name: `${node.name} 1`, material: node.material, skipWrapSingleChild: true })
        : [],
      nodes2: side2Children.length > 0
        ? wrapTopLevelInGroup(side2Children, { name: `${node.name} 2`, material: node.material, skipWrapSingleChild: true })
        : [],
      intersects,
    };
  }

  // ── CSG NODE or IMPORTED (non-group) ────────────────────────────────────
  const worldGeo = buildWorldGeometry(node, allNodes);
  const classification = classifyGeometry(worldGeo, workplane);
  worldGeo.dispose();

  if (classification === 1) {
    // Entirely above: clone subtree into side 1
    return { nodes1: deepCloneSubtree(node.id, allNodes, '1'), nodes2: [], intersects: false };
  }
  if (classification === -1) {
    // Entirely below: clone subtree into side 2
    return { nodes1: [], nodes2: deepCloneSubtree(node.id, allNodes, '2'), intersects: false };
  }

  // Straddles the plane
  if (node.csgOperation !== null) {
    // CSG node: preserve editability — clone to both sides
    return {
      nodes1: deepCloneSubtree(node.id, allNodes, '1'),
      nodes2: deepCloneSubtree(node.id, allNodes, '2'),
      intersects: true,
    };
  }

  // Plain imported or primitive leaf: split geometrically
  const worldGeo2 = buildWorldGeometry(node, allNodes);
  const stlBuf = geometryToStl(worldGeo2);
  worldGeo2.dispose();

  const { above, below } = await runSplit(
    stlBuf,
    workplane.origin,
    workplane.normal,
    workplane.tangentX,
  );

  const baseName = node.name;

  function makeImportedNode(buf: ArrayBuffer, suffix: string): SceneNode | null {
    if (countTriangles(buf) === 0) return null;
    const geo = stlLoader.parse(buf);
    geo.computeVertexNormals();
    const meshId = crypto.randomUUID();
    meshGeometryMap.set(meshId, geo);
    return {
      ...node,
      id: crypto.randomUUID(),
      name: `${baseName} ${suffix}`,
      geometry: { type: 'imported', meshId, originalName: `${baseName} ${suffix}` },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      parentId: null,
      childIds: [],
      csgOperation: null,
      csgError: null,
    };
  }

  const node1 = makeImportedNode(above, '1');
  const node2 = makeImportedNode(below, '2');

  return {
    nodes1: node1 ? [node1] : [],
    nodes2: node2 ? [node2] : [],
    intersects: true,
  };
}

// ── public entry point ───────────────────────────────────────────────────────

export async function triggerSplit(): Promise<{ error: string } | void> {
  const { nodes, selectedIds, workplane, splitStatus, setSplitStatus } =
    useSceneStore.getState();

  if (splitStatus !== 'idle') return;

  // Work only with root-level selected nodes
  const selectedRoots = selectedIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is SceneNode => n !== undefined && n.parentId === null);

  if (selectedRoots.length === 0) return;

  setSplitStatus('computing');

  try {
    // Collect all original nodes (roots + all descendants)
    function collectSubtree(id: string): SceneNode[] {
      const node = nodes.find((n) => n.id === id);
      if (!node) return [];
      return [node, ...node.childIds.flatMap((c) => collectSubtree(c))];
    }

    const allOriginalNodes = selectedRoots.flatMap((n) => collectSubtree(n.id));
    const allOriginalIndices = allOriginalNodes.map((n) =>
      nodes.findIndex((m) => m.id === n.id),
    );

    // Split each root
    const splitResults: NodeSplitResult[] = [];
    for (const root of selectedRoots) {
      splitResults.push(await splitNodeRecursive(root, nodes, workplane));
    }

    // Check if anything actually intersected the plane
    const anyIntersects = splitResults.some((r) => r.intersects);
    if (!anyIntersects) {
      setSplitStatus('idle');
      return { error: 'The workplane does not intersect any selected object.' };
    }

    // Collect all result nodes
    let all1Nodes = splitResults.flatMap((r) => r.nodes1);
    let all2Nodes = splitResults.flatMap((r) => r.nodes2);

    // If multiple roots: wrap top-level results in groups named after the selection
    if (selectedRoots.length > 1) {
      const splitMaterial: MaterialProps = { color: '#4488ff', opacity: 1, wireframe: false };
      all1Nodes = wrapTopLevelInGroup(all1Nodes, { name: 'Split 1', material: splitMaterial });
      all2Nodes = wrapTopLevelInGroup(all2Nodes, { name: 'Split 2', material: splitMaterial });
    }

    const allResultNodes = [...all1Nodes, ...all2Nodes];

    // SplitCommand.execute() is the sole scene mutator (remove originals,
    // restore results, select top-level results) — mirrors GroupCommand /
    // UngroupCommand / CsgAdoptCommand.
    undoStack.push(new SplitCommand(allOriginalNodes, allOriginalIndices, allResultNodes));
  } catch (err) {
    if (err instanceof Error && err.message !== 'Split operation cancelled') {
      console.error('Split failed:', err);
      return { error: 'Split operation failed.' };
    }
  } finally {
    setSplitStatus('idle');
  }
}
