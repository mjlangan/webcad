import { useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { Button, Divider, InputNumber, Modal, Space, Tooltip, Typography, Upload } from 'antd';
import { useSceneStore } from '../../store/useSceneStore';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import type { TransformMode } from '../../store/useSceneStore';
import type { AxisConstraint } from '../../store/useSceneStore';
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
  const transformAxisConstraint = useSceneStore((s) => s.transformAxisConstraint);
  const setTransformAxisConstraint = useSceneStore((s) => s.setTransformAxisConstraint);
  const gridSnap = useSceneStore((s) => s.gridSnap);
  const setGridSnap = useSceneStore((s) => s.setGridSnap);
  const workplanePlacementMode = useSceneStore((s) => s.workplanePlacementMode);
  const setWorkplanePlacementMode = useSceneStore((s) => s.setWorkplanePlacementMode);
  const workplane = useSceneStore((s) => s.workplane);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const csgStatus = useSceneStore((s) => s.csgStatus);
  const measureMode = useSceneStore((s) => s.measureMode);
  const setMeasureMode = useSceneStore((s) => s.setMeasureMode);
  const faceAlignMode = useSceneStore((s) => s.faceAlignMode);
  const setFaceAlignMode = useSceneStore((s) => s.setFaceAlignMode);
  const vertexSnapEnabled = useSceneStore((s) => s.vertexSnapEnabled);
  const setVertexSnapEnabled = useSceneStore((s) => s.setVertexSnapEnabled);

  // Last non-zero snap value, used when toggling snap back on
  const [snapIncrement, setSnapIncrement] = useState(1);

  const openInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  const unitSystem = usePreferencesStore((s) => s.unitSystem);
  const setUnitSystem = usePreferencesStore((s) => s.setUnitSystem);

  const booleanEnabled = selectedIds.length === 2 && csgStatus === 'idle';
  const groupEnabled =
    selectedIds.length >= 2 &&
    selectedIds.every((id) => nodes.find((n) => n.id === id)?.parentId === null);
  const ungroupEnabled = selectedIds.some(
    (id) => nodes.find((n) => n.id === id)?.geometry.type === 'group',
  );
  const exportScope = selectedIds.length > 0 ? 'Selection' : 'All';

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

  const handleImportFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'stl') importStlFile(file);
    else if (ext === 'obj') importObjFile(file);
    else if (ext === '3mf') import3mfFile(file);
    setImportOpen(false);
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

      {/* Import / Export */}
      <Space size={3} align="center">
        <Button size="small" onClick={() => setImportOpen(true)}>Import</Button>
        <Button size="small" onClick={() => setExportOpen(true)}>Export</Button>
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

      {/* Axis Constraint */}
      <Space size={3} align="center">
        <Text style={labelStyle}>Axis</Text>
        {(['X', 'Y', 'Z'] as const).map((axis) => (
          <Tooltip key={axis} title={`Lock to ${axis} axis (${axis})`}>
            <Button
              size="small"
              type={transformAxisConstraint === axis ? 'primary' : 'default'}
              disabled={selectedIds.length === 0}
              onClick={() =>
                setTransformAxisConstraint(transformAxisConstraint === axis ? null : axis as AxisConstraint)
              }
              style={
                transformAxisConstraint === axis
                  ? undefined
                  : axis === 'X'
                  ? { color: '#ff5555' }
                  : axis === 'Y'
                  ? { color: '#55ff55' }
                  : { color: '#5599ff' }
              }
            >
              {axis}
            </Button>
          </Tooltip>
        ))}
      </Space>

      <Divider type="vertical" style={{ borderColor: '#404040', height: 18, margin: '0 4px' }} />

      {/* Grid Snap */}
      <Space size={3} align="center">
        <Text style={labelStyle}>Snap</Text>
        <Tooltip title={gridSnap > 0 ? `Snap on (${gridSnap} units) — click to disable` : 'Snap off — click to enable'}>
          <Button
            size="small"
            type={gridSnap > 0 ? 'primary' : 'default'}
            onClick={() => {
              if (gridSnap > 0) {
                setGridSnap(0);
              } else {
                setGridSnap(snapIncrement);
              }
            }}
          >
            Grid
          </Button>
        </Tooltip>
        <Tooltip title="Snap increment (scene units)">
          <InputNumber
            size="small"
            min={0.01}
            max={100}
            step={0.5}
            value={snapIncrement}
            onChange={(v) => {
              const val = v ?? 1;
              setSnapIncrement(val);
              if (gridSnap > 0) setGridSnap(val);
            }}
            style={{ width: 60 }}
          />
        </Tooltip>
        <Tooltip title="Snap to object vertices while translating">
          <Button
            size="small"
            type={vertexSnapEnabled ? 'primary' : 'default'}
            onClick={() => setVertexSnapEnabled(!vertexSnapEnabled)}
          >
            Verts
          </Button>
        </Tooltip>
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
        <Tooltip title={selectedIds.length > 0 ? 'Drop selection to workplane surface' : 'Select objects to drop to workplane'}>
          <Button size="small" disabled={selectedIds.length === 0} onClick={() => actionsRef.current?.dropToWorkplane()}>Drop</Button>
        </Tooltip>
        <Tooltip title={selectedIds.length > 0 ? 'Click a face to align it flush with the workplane (Esc to cancel)' : 'Select objects to use face align'}>
          <Button
            size="small"
            type={faceAlignMode ? 'primary' : 'default'}
            disabled={selectedIds.length === 0}
            onClick={() => setFaceAlignMode(!faceAlignMode)}
          >
            Face Align
          </Button>
        </Tooltip>
      </Space>

      <Divider type="vertical" style={{ borderColor: '#404040', height: 18, margin: '0 4px' }} />

      {/* Measure */}
      <Space size={3} align="center">
        <Text style={labelStyle}>Measure</Text>
        <Tooltip title={measureMode ? 'Click two points to measure distance (Esc to exit)' : 'Activate measurement tool (M)'}>
          <Button
            size="small"
            type={measureMode ? 'primary' : 'default'}
            onClick={() => setMeasureMode(!measureMode)}
          >
            Distance
          </Button>
        </Tooltip>
      </Space>

      {/* View — pushed to the right */}
      <Space size={3} align="center" style={{ marginLeft: 'auto' }}>
        <Tooltip title="Preferences">
          <Button size="small" onClick={() => setPrefsOpen(true)}>Prefs</Button>
        </Tooltip>
      </Space>
      <Space size={3} align="center">
        <Text style={labelStyle}>View</Text>
        {CAMERA_PRESETS.map((preset) => (
          <Tooltip key={preset} title={`${preset} view`}>
            <Button size="small" onClick={() => actionsRef.current?.setPreset(preset)}>
              {preset.charAt(0).toUpperCase() + preset.slice(1)}
            </Button>
          </Tooltip>
        ))}
      </Space>

      {/* Import modal */}
      <Modal
        title="Import"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        footer={null}
        width={480}
      >
        <Upload.Dragger
          accept=".stl,.obj,.3mf"
          multiple={false}
          showUploadList={false}
          beforeUpload={(file) => {
            handleImportFile(file);
            return false;
          }}
          style={{ padding: '24px 0' }}
        >
          <p style={{ marginBottom: 8 }}>Drop a file here, or click to browse</p>
          <p style={{ color: '#888', fontSize: 12 }}>Supported formats: STL, OBJ, 3MF</p>
        </Upload.Dragger>
      </Modal>

      {/* Export modal */}
      <Modal
        title={`Export (${exportScope})`}
        open={exportOpen}
        onCancel={() => setExportOpen(false)}
        footer={null}
        width={420}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button block onClick={() => { exportStl(); setExportOpen(false); }}>STL — 3D printing, universal mesh</Button>
          <Button block onClick={() => { exportObj(); setExportOpen(false); }}>OBJ — broad compatibility</Button>
          <Button block onClick={() => { void exportGltf(); setExportOpen(false); }}>glTF / GLB — web-native, preserves materials</Button>
          <Button block onClick={() => { export3mf(); setExportOpen(false); }}>3MF — slicers (PrusaSlicer, Bambu, Cura)</Button>
        </div>
      </Modal>

      {/* Preferences modal */}
      <Modal
        title="Preferences"
        open={prefsOpen}
        onCancel={() => setPrefsOpen(false)}
        footer={null}
        width={340}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
          <div>
            <Text style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Unit System</Text>
            <Space>
              <Button
                size="small"
                type={unitSystem === 'mm' ? 'primary' : 'default'}
                onClick={() => setUnitSystem('mm')}
              >
                Millimeters (mm)
              </Button>
              <Button
                size="small"
                type={unitSystem === 'in' ? 'primary' : 'default'}
                onClick={() => setUnitSystem('in')}
              >
                Inches (in)
              </Button>
            </Space>
          </div>
        </div>
      </Modal>
    </div>
  );
}
