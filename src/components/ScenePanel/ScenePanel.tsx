import { useState, useRef, useEffect, Fragment } from 'react';
import { useSceneStore } from '../../store/useSceneStore';
import { undoStack } from '../../store/undoStack';
import { RenameNodeCommand, RemoveNodeCommand } from '../../store/commands';
import type { SceneNode } from '../../types/scene';
import './ScenePanel.css';

export default function ScenePanel() {
  const nodes = useSceneStore((s) => s.nodes);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const selectNode = useSceneStore((s) => s.selectNode);
  const toggleNodeSelection = useSceneStore((s) => s.toggleNodeSelection);
  const toggleVisible = useSceneStore((s) => s.toggleVisible);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  // Set of parent IDs that are collapsed (children hidden); default is expanded
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      const node = nodes.find((n) => n.id === editingId);
      if (node && node.name !== editValue.trim()) {
        undoStack.push(new RenameNodeCommand(editingId, node.name, editValue.trim()));
      }
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') setEditingId(null);
  };

  const handleRowClick = (e: React.MouseEvent, nodeId: string) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      toggleNodeSelection(nodeId);
    } else {
      selectNode(nodeId);
    }
  };

  const toggleCollapsed = (parentId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  const renderRow = (node: SceneNode, depth: number) => {
    const isSelected = selectedIds.includes(node.id);
    const hasChildren = node.childIds.length > 0;
    const isExpanded = !collapsedIds.has(node.id);
    const hasError = node.csgError !== null;
    const isChild = depth > 0;

    let rowClass = 'scene-row';
    if (isSelected) rowClass += ' scene-row--selected';
    if (!node.visible && !isChild) rowClass += ' scene-row--hidden';
    if (isChild) rowClass += ' scene-row--child';

    return (
      <li key={node.id} className={rowClass} onClick={(e) => handleRowClick(e, node.id)}>

        {/* Tree indent / connector for children — indent scales with depth */}
        {isChild && (
          <span
            className="scene-tree-connector"
            style={{ paddingLeft: `${depth * 14}px`, paddingRight: '4px' }}
            aria-hidden="true"
          >└</span>
        )}

        {/* Expand/collapse for any CSG node that has children */}
        {hasChildren && (
          <button
            className="scene-row-btn scene-row-expand-btn"
            title={isExpanded ? 'Collapse' : 'Expand'}
            onClick={(e) => { e.stopPropagation(); toggleCollapsed(node.id); }}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        )}

        {/* Visibility eye — root nodes only (system manages child visibility) */}
        {!isChild && (
          <button
            className="scene-row-btn"
            title={node.visible ? 'Hide' : 'Show'}
            onClick={(e) => { e.stopPropagation(); toggleVisible(node.id); }}
          >
            {node.visible ? '👁' : '🙈'}
          </button>
        )}

        {/* Error badge for failed CSG recomputes */}
        {hasError && (
          <span className="scene-row-error-badge" title={node.csgError ?? undefined}>⚠</span>
        )}

        {/* Name — double-click to rename */}
        {editingId === node.id ? (
          <input
            ref={inputRef}
            className="scene-rename-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="scene-row-name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingId(node.id);
              setEditValue(node.name);
            }}
          >
            {node.name}
          </span>
        )}

        {/* Delete for root nodes; lock indicator for children */}
        {!isChild ? (
          <button
            className="scene-row-btn scene-row-btn--delete"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              undoStack.push(new RemoveNodeCommand(node.id));
            }}
          >
            ✕
          </button>
        ) : (
          <span
            className="scene-row-child-locked"
            title="Cannot delete: used by a boolean operation — delete the parent first"
          >
            🔒
          </span>
        )}
      </li>
    );
  };

  const renderSubtree = (node: SceneNode, depth: number) => {
    const isExpanded = !collapsedIds.has(node.id);
    const children = node.childIds
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is SceneNode => n !== undefined);

    return (
      <Fragment key={node.id}>
        {renderRow(node, depth)}
        {children.length > 0 && isExpanded && children.map((child) =>
          renderSubtree(child, depth + 1),
        )}
      </Fragment>
    );
  };

  // Only render root nodes at the top level; their full subtrees are rendered recursively
  const rootNodes = nodes.filter((n) => n.parentId === null);

  return (
    <div className="scene-panel">
      <div className="panel-header">Scene</div>
      <ul className="scene-list">
        {rootNodes.map((node) => renderSubtree(node, 0))}
        {rootNodes.length === 0 && (
          <li className="scene-empty">No objects in scene</li>
        )}
      </ul>
    </div>
  );
}
