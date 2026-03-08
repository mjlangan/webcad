import * as THREE from 'three';
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
