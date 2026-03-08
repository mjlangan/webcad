import * as THREE from 'three';
import { useSceneStore } from '../store/useSceneStore';
import { undoStack } from '../store/undoStack';
import { GroupCommand, UngroupCommand, decomposeMatrix } from '../store/commands';
import { computeWorldMatrix } from './worldMatrix';
import type { Transform } from '../types/scene';

/**
 * Groups all currently selected root-level objects under a new group node.
 * The group is placed at the centroid of the selected objects. Each child's
 * world transform is converted to a local transform relative to the group.
 *
 * Only root-level nodes (parentId === null) are eligible for grouping.
 * Requires at least 2 eligible nodes to be selected.
 */
export function groupSelected(): void {
  const { nodes, selectedIds } = useSceneStore.getState();

  // Only root-level nodes can be grouped
  const groupableIds = selectedIds.filter((id) => {
    const node = nodes.find((n) => n.id === id);
    return node?.parentId === null;
  });

  if (groupableIds.length < 2) return;

  const groupableNodes = groupableIds.map((id) => nodes.find((n) => n.id === id)!);

  // Compute centroid from world positions
  const centroidVec = new THREE.Vector3();
  groupableNodes.forEach((node) => {
    const worldMat = computeWorldMatrix(node.id, nodes);
    const pos = new THREE.Vector3();
    worldMat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    centroidVec.add(pos);
  });
  centroidVec.divideScalar(groupableNodes.length);
  const groupPosition: [number, number, number] = [centroidVec.x, centroidVec.y, centroidVec.z];

  // Save current world transforms for undo
  const worldTransforms: Transform[] = groupableNodes.map((node) =>
    decomposeMatrix(computeWorldMatrix(node.id, nodes)),
  );

  // Compute local transforms relative to the new group
  // group has identity rotation and scale → groupInverse = translate(-centroid)
  const groupMatrix = new THREE.Matrix4().makeTranslation(centroidVec.x, centroidVec.y, centroidVec.z);
  const groupMatrixInverse = groupMatrix.clone().invert();
  const localTransforms: Transform[] = groupableNodes.map((node) => {
    const worldMat = computeWorldMatrix(node.id, nodes);
    const localMat = groupMatrixInverse.clone().multiply(worldMat);
    return decomposeMatrix(localMat);
  });

  const groupId = crypto.randomUUID();
  const groupCount = nodes.filter((n) => n.name.startsWith('Group')).length + 1;
  const groupName = `Group ${groupCount}`;

  undoStack.push(
    new GroupCommand(groupableIds, groupId, groupName, groupPosition, localTransforms, worldTransforms),
  );
}

/**
 * Ungroups all currently selected group nodes. Each group's children are
 * released to the scene root with their world-space transforms restored.
 *
 * Each group generates a separate UngroupCommand on the undo stack.
 */
export function ungroupSelected(): void {
  const { nodes, selectedIds } = useSceneStore.getState();

  for (const id of selectedIds) {
    const groupNode = nodes.find((n) => n.id === id);
    if (!groupNode || groupNode.geometry.type !== 'group') continue;

    const childIds = [...groupNode.childIds];

    if (childIds.length === 0) {
      // Empty group — nothing to ungroup, skip it
      continue;
    }

    const childNodes = childIds
      .map((cid) => nodes.find((n) => n.id === cid))
      .filter((n): n is NonNullable<typeof n> => n !== undefined);

    const localTransforms: Transform[] = childNodes.map((n) => ({ ...n.transform }));

    const worldTransforms: Transform[] = childNodes.map((node) =>
      decomposeMatrix(computeWorldMatrix(node.id, nodes)),
    );

    undoStack.push(
      new UngroupCommand(
        id,
        groupNode.name,
        groupNode.transform.position,
        childIds,
        localTransforms,
        worldTransforms,
      ),
    );
  }
}
