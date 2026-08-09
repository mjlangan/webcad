import * as THREE from 'three';
import { buildGeometry } from './buildGeometry';
import type { SceneNode } from '../types/scene';

/**
 * Computes the world-space transformation matrix for a node by walking
 * the parentId chain.  Only general-purpose group parents contribute to
 * the chain; CSG parent nodes store world-space transforms on children,
 * so the chain stops there.
 */
export function computeWorldMatrix(nodeId: string, nodes: SceneNode[]): THREE.Matrix4 {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return new THREE.Matrix4();

  const local = new THREE.Matrix4().compose(
    new THREE.Vector3(...node.transform.position),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...node.transform.rotation),
    ),
    new THREE.Vector3(...node.transform.scale),
  );

  if (node.parentId) {
    const parent = nodes.find((n) => n.id === node.parentId);
    if (parent?.geometry.type === 'group') {
      // Pre-multiply: parent world * child local
      return computeWorldMatrix(parent.id, nodes).multiply(local);
    }
  }

  return local;
}

/** Returns a world-space geometry with the node's full ancestor-chain
 *  transform baked in. */
export function buildWorldGeometry(node: SceneNode, nodes: SceneNode[]): THREE.BufferGeometry {
  const geo = buildGeometry(node.geometry).clone();
  geo.applyMatrix4(computeWorldMatrix(node.id, nodes));
  return geo;
}

/** Collects nodeId plus every descendant nodeId (depth-first). */
export function collectDescendantIds(nodeId: string, nodes: SceneNode[]): string[] {
  const result: string[] = [nodeId];
  const node = nodes.find((n) => n.id === nodeId);
  if (node) for (const childId of node.childIds) result.push(...collectDescendantIds(childId, nodes));
  return result;
}
