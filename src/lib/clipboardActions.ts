import { useSceneStore } from '../store/useSceneStore';
import { undoStack } from '../store/undoStack';
import { PasteCommand } from '../store/commands';
import { clipboard } from '../store/clipboard';
import { nextCopyName } from './nodeNaming';
import type { SceneNode } from '../types/scene';

/**
 * Recursively collects a node into `out`. Groups bring their full descendant
 * subtree along (so pasting a group isn't left empty); any other node — including
 * a CSG result — is copied as a flat, childless node, matching how the existing
 * Duplicate action already drops CSG source relationships on copy.
 */
function collectSubtree(node: SceneNode, nodes: SceneNode[], seen: Set<string>, out: SceneNode[]): void {
  if (seen.has(node.id)) return;
  seen.add(node.id);

  if (node.geometry.type === 'group') {
    out.push(node);
    for (const childId of node.childIds) {
      const child = nodes.find((n) => n.id === childId);
      if (child) collectSubtree(child, nodes, seen, out);
    }
  } else {
    out.push({ ...node, childIds: [], csgOperation: null, csgError: null });
  }
}

/** Copies the current selection (and, for groups, their full descendant subtree) to the clipboard. */
export function copySelected(): void {
  const { selectedIds, nodes } = useSceneStore.getState();
  if (selectedIds.length === 0) return;

  const seen = new Set<string>();
  const collected: SceneNode[] = [];
  for (const id of selectedIds) {
    const node = nodes.find((n) => n.id === id);
    if (!node) continue;
    // Skip raw CSG-source children (hidden, locked) — matches the same
    // root-or-group-child eligibility check duplicate/delete already use.
    const parent = node.parentId ? nodes.find((n) => n.id === node.parentId) : null;
    const isCopyable = node.parentId === null || parent?.geometry.type === 'group';
    if (!isCopyable) continue;
    collectSubtree(node, nodes, seen, collected);
  }

  if (collected.length > 0) clipboard.set(collected);
}

/**
 * Pastes the clipboard contents as new nodes with fresh ids, at their original
 * position. Top-level (root) pasted nodes get a trailing number appended/
 * incremented (see nextCopyName); nodes that were part of a copied group's
 * subtree keep their original name.
 */
export function pasteClipboard(): void {
  const clipboardNodes = clipboard.get();
  if (clipboardNodes.length === 0) return;

  const idMap = new Map<string, string>();
  clipboardNodes.forEach((n) => idMap.set(n.id, crypto.randomUUID()));

  // Tracks names already claimed, seeded with the current scene and grown as
  // each pasted node is named, so a multi-item paste never assigns the same
  // name to two of its own new nodes either.
  const existingNames = new Set(useSceneStore.getState().nodes.map((n) => n.name));

  const nodesToInsert: SceneNode[] = clipboardNodes.map((n) => {
    const newParentId = n.parentId && idMap.has(n.parentId) ? idMap.get(n.parentId)! : null;
    const isRoot = newParentId === null;
    const newChildIds = n.childIds
      .map((cid) => idMap.get(cid))
      .filter((cid): cid is string => cid !== undefined);

    let name = n.name;
    if (isRoot) {
      name = nextCopyName(n.name, existingNames);
      existingNames.add(name);
    }

    return {
      ...n,
      id: idMap.get(n.id)!,
      name,
      parentId: newParentId,
      childIds: newChildIds,
    };
  });

  const rootIds = nodesToInsert.filter((n) => n.parentId === null).map((n) => n.id);
  undoStack.push(new PasteCommand(nodesToInsert, rootIds));
}
