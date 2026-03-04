import { useState, useRef, useEffect } from 'react';
import { useSceneStore } from '../../store/useSceneStore';
import { undoStack } from '../../store/undoStack';
import { RenameNodeCommand, RemoveNodeCommand } from '../../store/commands';
import './ScenePanel.css';

export default function ScenePanel() {
  const nodes = useSceneStore((s) => s.nodes);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const selectNode = useSceneStore((s) => s.selectNode);
  const toggleNodeSelection = useSceneStore((s) => s.toggleNodeSelection);
  const toggleVisible = useSceneStore((s) => s.toggleVisible);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
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

  return (
    <div className="scene-panel">
      <div className="panel-header">Scene</div>
      <ul className="scene-list">
        {nodes.map((node) => (
          <li
            key={node.id}
            className={`scene-row${selectedIds.includes(node.id) ? ' scene-row--selected' : ''}${!node.visible ? ' scene-row--hidden' : ''}`}
            onClick={(e) => handleRowClick(e, node.id)}
          >
            <button
              className="scene-row-btn"
              title={node.visible ? 'Hide' : 'Show'}
              onClick={(e) => { e.stopPropagation(); toggleVisible(node.id); }}
            >
              {node.visible ? '👁' : '🙈'}
            </button>

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
          </li>
        ))}
        {nodes.length === 0 && (
          <li className="scene-empty">No objects in scene</li>
        )}
      </ul>
    </div>
  );
}
