import { useRef, type ChangeEvent, type RefObject } from 'react';
import { Button, Divider, Space, Tooltip, Typography } from 'antd';
import { useSceneStore } from '../../store/useSceneStore';
import type { TransformMode } from '../../store/useSceneStore';
import type { PrimitiveParams } from '../../types/scene';
import { DEFAULT_WORKPLANE } from '../../types/scene';
import type { CameraPreset, ViewportActions } from '../../types/viewport';
import { importStlFile } from '../../lib/stlImport';
import { importObjFile } from '../../lib/objImport';
import { import3mfFile } from '../../lib/threemfImport';
import { saveProject, openProject, newProject } from '../../lib/sceneFile';
import { exportStl, exportObj, exportGltf, export3mf } from '../../lib/exportScene';
import { undoStack } from '../../store/undoStack';
import { SetWorkplaneCommand } from '../../store/commands';
import { triggerCsg } from '../../lib/triggerCsg';
import { groupSelected, ungroupSelected } from '../../lib/groupActions';
import type { CsgOperation } from '../../lib/csgWorker';

const { Text } = Typography;

const CAMERA_PRESETS: CameraPreset[] = [
  'home', 'front', 'back', 'left', 'right', 'top', 'bottom',
];

interface ToolbarProps {
  actionsRef: RefObject<ViewportActions | null>;
}

const TRANSFORM_MODES: { mode: TransformMode; label: string; key: string }[] = [
  { mode: 'translate', label: 'Move',   key: 'G' },
  { mode: 'rotate',    label: 'Rotate', key: 'R' },
  { mode: 'scale',     label: 'Scale',  key: 'S' },
];

const BOOLEAN_OPS: { op: CsgOperation; label: string; title: string }[] = [
  { op: 'union',     label: 'Union',     title: 'Combine two selected objects (A ∪ B)' },
  { op: 'subtract',  label: 'Subtract',  title: 'Subtract second object from first (A − B)' },
  { op: 'intersect', label: 'Intersect', title: 'Keep only the overlapping volume (A ∩ B)' },
];

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#666',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  userSelect: 'none',
};

export default function Toolbar({ actionsRef }: ToolbarProps) {
  const addNode = useSceneStore((s) => s.addNode);
  const nodes = useSceneStore((s) => s.nodes);
  const transformMode = useSceneStore((s) => s.transformMode);
  const setTransformMode = useSceneStore((s) => s.setTransformMode);
  const workplanePlacementMode = useSceneStore((s) => s.workplanePlacementMode);
  const setWorkplanePlacementMode = useSceneStore((s) => s.setWorkplanePlacementMode);
  const workplane = useSceneStore((s) => s.workplane);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const csgStatus = useSceneStore((s) => s.csgStatus);

  const stlInputRef = useRef<HTMLInputElement>(null);
  const objInputRef = useRef<HTMLInputElement>(null);
  const mfInputRef  = useRef<HTMLInputElement>(null);
  const openInputRef = useRef<HTMLInputElement>(null);

  const booleanEnabled = selectedIds.length === 2 && csgStatus === 'idle';
  const groupEnabled =
    selectedIds.length >= 2 &&
    selectedIds.every((id) => nodes.find((n) => n.id === id)?.parentId === null);
  const ungroupEnabled = selectedIds.some(
    (id) => nodes.find((n) => n.id === id)?.geometry.type === 'group',
  );
  const exportScope = selectedIds.length > 0 ? 'Selection' : 'All';
  const exportTitle = (fmt: string) =>
    selectedIds.length > 0
      ? `Export selected objects as ${fmt}`
      : `Export all visible objects as ${fmt}`;

  const handleAddPrimitive = (type: string) => {
    let geometry: PrimitiveParams;
    switch (type) {
      case 'box':
        geometry = { type: 'box', width: 20, height: 20, depth: 20 };
        break;
      case 'sphere':
        geometry = { type: 'sphere', radius: 10, widthSegments: 32, heightSegments: 16 };
        break;
      case 'cylinder':
        geometry = { type: 'cylinder', radiusTop: 10, radiusBottom: 10, height: 20, radialSegments: 32 };
        break;
      case 'cone':
        geometry = { type: 'cone', radius: 10, height: 20, radialSegments: 32 };
        break;
      case 'torus':
        geometry = { type: 'torus', radius: 10, tube: 4, radialSegments: 16, tubularSegments: 64 };
        break;
      case 'beerglass':
        geometry = { type: 'beerglass', radiusUpper: 37.5, radiusLower: 34.2, height: 165, radialSegments: 32 };
        break;
      default:
        return;
    }
    addNode(geometry);
  };

  const handleResetWorkplane = () => {
    undoStack.push(new SetWorkplaneCommand(workplane, DEFAULT_WORKPLANE));
  };

  const makeFileHandler =
    <T extends File>(fn: (f: T) => void) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] as T | undefined;
      if (file) fn(file);
      e.target.value = '';
    };

  return (
    <div style={{
      gridArea: 'toolbar',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 2,
      padding: '4px 8px',
      background: '#1f1f1f',
      borderBottom: '1px solid #303030',
      minHeight: 36,
    }}>

      {/* File */}
      <Space size={3} align="center">
        <Text style={labelStyle}>File</Text>
        <Tooltip title="New scene (clears current scene)">
          <Button size="small" onClick={() => { void newProject(); }}>New</Button>
        </Tooltip>
        <Tooltip title="Save scene as .webcad file">
          <Button size="small" onClick={() => { void saveProject(); }}>Save</Button>
        </Tooltip>
        <Tooltip title="Open a .webcad file (replaces current scene)">
          <Button size="small" onClick={() => openInputRef.current?.click()}>Open</Button>
        </Tooltip>
        <input ref={openInputRef} type="file" accept=".webcad" style={{ display: 'none' }} onChange={makeFileHandler(openProject)} />
      </Space>

      <Divider type="vertical" style={{ borderColor: '#404040', height: 18, margin: '0 4px' }} />

      {/* Add */}
      <Space size={3} align="center">
        <Text style={labelStyle}>Add</Text>
        {(['box', 'sphere', 'cylinder', 'cone', 'torus'] as const).map((type) => (
          <Tooltip key={type} title={`Add ${type}`}>
            <Button size="small" onClick={() => handleAddPrimitive(type)}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Button>
          </Tooltip>
        ))}
        <Tooltip title="Add beer glass (Superfest)">
          <Button size="small" onClick={() => handleAddPrimitive('beerglass')}>Beer Glass</Button>
        </Tooltip>
      </Space>

      <Divider type="vertical" style={{ borderColor: '#404040', height: 18, margin: '0 4px' }} />

      {/* Import */}
      <Space size={3} align="center">
        <Text style={labelStyle}>Import</Text>
        <Tooltip title="Import STL file">
          <Button size="small" onClick={() => stlInputRef.current?.click()}>STL</Button>
        </Tooltip>
        <Tooltip title="Import OBJ file">
          <Button size="small" onClick={() => objInputRef.current?.click()}>OBJ</Button>
        </Tooltip>
        <Tooltip title="Import 3MF file">
          <Button size="small" onClick={() => mfInputRef.current?.click()}>3MF</Button>
        </Tooltip>
        <input ref={stlInputRef} type="file" accept=".stl" style={{ display: 'none' }} onChange={makeFileHandler(importStlFile)} />
        <input ref={objInputRef} type="file" accept=".obj" style={{ display: 'none' }} onChange={makeFileHandler(importObjFile)} />
        <input ref={mfInputRef}  type="file" accept=".3mf" style={{ display: 'none' }} onChange={makeFileHandler(import3mfFile)} />
      </Space>

      <Divider type="vertical" style={{ borderColor: '#404040', height: 18, margin: '0 4px' }} />

      {/* Transform */}
      <Space size={3} align="center">
        <Text style={labelStyle}>Transform</Text>
        {TRANSFORM_MODES.map(({ mode, label, key }) => (
          <Tooltip key={mode} title={`${label} (${key})`}>
            <Button
              size="small"
              type={transformMode === mode ? 'primary' : 'default'}
              onClick={() => setTransformMode(mode)}
            >
              {label}
            </Button>
          </Tooltip>
        ))}
      </Space>

      <Divider type="vertical" style={{ borderColor: '#404040', height: 18, margin: '0 4px' }} />

      {/* Boolean */}
      <Space size={3} align="center">
        <Text style={labelStyle}>Boolean</Text>
        {BOOLEAN_OPS.map(({ op, label, title }) => (
          <Tooltip key={op} title={booleanEnabled ? title : 'Select exactly 2 objects to use boolean operations'}>
            <Button
              size="small"
              disabled={!booleanEnabled}
              onClick={() => { void triggerCsg(op); }}
            >
              {label}
            </Button>
          </Tooltip>
        ))}
      </Space>

      <Divider type="vertical" style={{ borderColor: '#404040', height: 18, margin: '0 4px' }} />

      {/* Group */}
      <Space size={3} align="center">
        <Text style={labelStyle}>Group</Text>
        <Tooltip title={groupEnabled ? 'Group selected objects (Ctrl+G)' : 'Select 2+ root objects to group'}>
          <Button size="small" disabled={!groupEnabled} onClick={groupSelected}>Group</Button>
        </Tooltip>
        <Tooltip title={ungroupEnabled ? 'Ungroup selected group' : 'Select a group node to ungroup'}>
          <Button size="small" disabled={!ungroupEnabled} onClick={ungroupSelected}>Ungroup</Button>
        </Tooltip>
      </Space>

      <Divider type="vertical" style={{ borderColor: '#404040', height: 18, margin: '0 4px' }} />

      {/* Workplane */}
      <Space size={3} align="center">
        <Text style={labelStyle}>Workplane</Text>
        <Tooltip title="Set workplane on face (click to activate, Esc to cancel)">
          <Button
            size="small"
            type={workplanePlacementMode ? 'primary' : 'default'}
            onClick={() => setWorkplanePlacementMode(!workplanePlacementMode)}
          >
            Set Plane
          </Button>
        </Tooltip>
        <Tooltip title="Reset workplane to world XZ plane">
          <Button size="small" onClick={handleResetWorkplane}>Reset Plane</Button>
        </Tooltip>
      </Space>

      <Divider type="vertical" style={{ borderColor: '#404040', height: 18, margin: '0 4px' }} />

      {/* Export */}
      <Space size={3} align="center">
        <Text style={labelStyle}>Export ({exportScope})</Text>
        <Tooltip title={exportTitle('STL')}>
          <Button size="small" onClick={exportStl}>STL</Button>
        </Tooltip>
        <Tooltip title={exportTitle('OBJ')}>
          <Button size="small" onClick={exportObj}>OBJ</Button>
        </Tooltip>
        <Tooltip title={exportTitle('glTF/GLB')}>
          <Button size="small" onClick={() => { void exportGltf(); }}>glTF</Button>
        </Tooltip>
        <Tooltip title={exportTitle('3MF')}>
          <Button size="small" onClick={export3mf}>3MF</Button>
        </Tooltip>
      </Space>

      {/* View — pushed to the right */}
      <Space size={3} align="center" style={{ marginLeft: 'auto' }}>
        <Text style={labelStyle}>View</Text>
        {CAMERA_PRESETS.map((preset) => (
          <Tooltip key={preset} title={`${preset} view`}>
            <Button size="small" onClick={() => actionsRef.current?.setPreset(preset)}>
              {preset.charAt(0).toUpperCase() + preset.slice(1)}
            </Button>
          </Tooltip>
        ))}
      </Space>
    </div>
  );
}
