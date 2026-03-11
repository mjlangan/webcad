import { useState } from 'react';
import { Tree, Button, Input, Tooltip, Empty } from 'antd';
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  WarningOutlined,
  CloseOutlined,
  LockOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import { useSceneStore } from '../../store/useSceneStore';
import { undoStack } from '../../store/undoStack';
import { RenameNodeCommand, RemoveNodeCommand, DuplicateNodeCommand } from '../../store/commands';
import type { SceneNode } from '../../types/scene';

interface AugmentedDataNode extends DataNode {
  node: SceneNode;
  depth: number;
}

function buildTreeData(
  nodes: SceneNode[],
  parentId: string | null,
  depth: number,
): AugmentedDataNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .map((n) => ({
      key: n.id,
      title: n.name,
      node: n,
      depth,
      isLeaf: n.childIds.length === 0,
      children: n.childIds.length > 0 ? buildTreeData(nodes, n.id, depth + 1) : undefined,
    }));
}

interface NodeTitleProps {
  nodeData: AugmentedDataNode;
  nodes: SceneNode[];
  editingId: string | null;
  editValue: string;
  setEditingId: (id: string | null) => void;
  setEditValue: (v: string) => void;
  commitRename: () => void;
  toggleVisible: (id: string) => void;
}

function NodeTitle({
  nodeData,
  nodes,
  editingId,
  editValue,
  setEditingId,
  setEditValue,
  commitRename,
  toggleVisible,
}: NodeTitleProps) {
  const { node, depth } = nodeData;
  const isEditing = editingId === node.id;

  const parentNode = node.parentId ? nodes.find((n) => n.id === node.parentId) : null;
  const isGroupChild = parentNode?.geometry.type === 'group';
  const isCsgChild = depth > 0 && !isGroupChild;
  const isDeletable = !isCsgChild;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
      {/* Eye toggle — root nodes and group children only */}
      {!isCsgChild && (
        <Button
          type="text"
          size="small"
          style={{ padding: '0 2px', height: 18, flexShrink: 0, color: '#666' }}
          icon={node.visible ? <EyeOutlined /> : <EyeInvisibleOutlined style={{ opacity: 0.4 }} />}
          onClick={(e) => { e.stopPropagation(); toggleVisible(node.id); }}
        />
      )}

      {/* CSG error badge */}
      {node.csgError && (
        <Tooltip title={node.csgError}>
          <WarningOutlined style={{ color: '#faad14', fontSize: 11, flexShrink: 0 }} />
        </Tooltip>
      )}

      {/* Name or rename input */}
      {isEditing ? (
        <Input
          size="small"
          value={editValue}
          autoFocus
          style={{ flex: 1, minWidth: 0, height: 20, fontSize: 12 }}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setEditingId(null);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          style={{
            flex: 1,
            fontSize: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            opacity: (!node.visible && !isCsgChild) ? 0.4 : 1,
            cursor: 'default',
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditingId(node.id);
            setEditValue(node.name);
          }}
        >
          {node.name}
        </span>
      )}

      {/* Duplicate / Delete or lock */}
      <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {isDeletable ? (
          <>
            <Tooltip title="Duplicate (Ctrl+D)">
              <Button
                type="text"
                size="small"
                style={{ padding: '0 2px', height: 18, color: '#555' }}
                icon={<CopyOutlined style={{ fontSize: 10 }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  undoStack.push(new DuplicateNodeCommand(node.id));
                }}
              />
            </Tooltip>
            <Button
              type="text"
              size="small"
              style={{ padding: '0 2px', height: 18, color: '#555' }}
              icon={<CloseOutlined style={{ fontSize: 10 }} />}
              onClick={(e) => {
                e.stopPropagation();
                undoStack.push(new RemoveNodeCommand(node.id));
              }}
            />
          </>
        ) : (
          <Tooltip title="Cannot delete: used by a boolean operation — delete the parent first">
            <LockOutlined style={{ fontSize: 10, opacity: 0.35, padding: '0 4px' }} />
          </Tooltip>
        )}
      </span>
    </div>
  );
}

export default function ScenePanel() {
  const nodes = useSceneStore((s) => s.nodes);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const selectNode = useSceneStore((s) => s.selectNode);
  const toggleNodeSelection = useSceneStore((s) => s.toggleNodeSelection);
  const toggleVisible = useSceneStore((s) => s.toggleVisible);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<string[]>(() =>
    nodes.filter((n) => n.childIds.length > 0).map((n) => n.id),
  );

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      const node = nodes.find((n) => n.id === editingId);
      if (node && node.name !== editValue.trim()) {
        undoStack.push(new RenameNodeCommand(editingId, node.name, editValue.trim()));
      }
    }
    setEditingId(null);
  };

  const treeData = buildTreeData(nodes, null, 0);

  return (
    <div style={{
      gridArea: 'scene',
      background: '#181818',
      borderRight: '1px solid #2a2a2a',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #2a2a2a', fontSize: 12, fontWeight: 600, color: '#aaa', flexShrink: 0 }}>
        Scene
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {treeData.length === 0 ? (
          <Empty
            description={<span style={{ fontSize: 12, color: '#444' }}>No objects in scene</span>}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 24 }}
          />
        ) : (
          <Tree
            blockNode
            multiple
            selectedKeys={selectedIds}
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys as string[])}
            onSelect={(_, info) => {
              const nodeId = info.node.key as string;
              const e = info.nativeEvent as MouseEvent;
              if (e.ctrlKey || e.metaKey || e.shiftKey) {
                toggleNodeSelection(nodeId);
              } else {
                selectNode(nodeId);
              }
            }}
            treeData={treeData}
            titleRender={(nodeData) => (
              <NodeTitle
                nodeData={nodeData as AugmentedDataNode}
                nodes={nodes}
                editingId={editingId}
                editValue={editValue}
                setEditingId={setEditingId}
                setEditValue={setEditValue}
                commitRename={commitRename}
                toggleVisible={toggleVisible}
              />
            )}
            style={{ background: 'transparent', fontSize: 12 }}
          />
        )}
      </div>
    </div>
  );
}
