import { useRef, type ChangeEvent, type RefObject } from 'react';
import { useSceneStore } from '../../store/useSceneStore';
import type { TransformMode } from '../../store/useSceneStore';
import type { PrimitiveParams } from '../../types/scene';
import { DEFAULT_WORKPLANE } from '../../types/scene';
import type { CameraPreset, ViewportActions } from '../../types/viewport';
import { importStlFile } from '../../lib/stlImport';
import { importObjFile } from '../../lib/objImport';
import { import3mfFile } from '../../lib/threemfImport';
import { saveProject, openProject } from '../../lib/sceneFile';
import { exportStl, exportObj, exportGltf, export3mf } from '../../lib/exportScene';
import { undoStack } from '../../store/undoStack';
import { SetWorkplaneCommand } from '../../store/commands';
import { triggerCsg } from '../../lib/triggerCsg';
import type { CsgOperation } from '../../lib/csgWorker';
import './Toolbar.css';

const CAMERA_PRESETS: CameraPreset[] = [
  'home', 'front', 'back', 'left', 'right', 'top', 'bottom',
];

interface ToolbarProps {
  actionsRef: RefObject<ViewportActions | null>;
}

const TRANSFORM_MODES: { mode: TransformMode; label: string }[] = [
  { mode: 'translate', label: 'Move' },
  { mode: 'rotate',    label: 'Rotate' },
  { mode: 'scale',     label: 'Scale' },
];

const BOOLEAN_OPS: { op: CsgOperation; label: string; title: string }[] = [
  { op: 'union',     label: 'Union',     title: 'Combine two selected objects (A ∪ B)' },
  { op: 'subtract',  label: 'Subtract',  title: 'Subtract second object from first (A − B)' },
  { op: 'intersect', label: 'Intersect', title: 'Keep only the overlapping volume (A ∩ B)' },
];

export default function Toolbar({ actionsRef }: ToolbarProps) {
  const addNode = useSceneStore((s) => s.addNode);
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
    <div className="toolbar">
      <div className="toolbar-group">
        <span className="toolbar-label">File</span>
        <button
          className="toolbar-btn"
          onClick={() => { void saveProject(); }}
          title="Save scene as .webcad file"
        >
          Save
        </button>
        <button
          className="toolbar-btn"
          onClick={() => openInputRef.current?.click()}
          title="Open a .webcad file (replaces current scene)"
        >
          Open
        </button>
        <input
          ref={openInputRef}
          type="file"
          accept=".webcad"
          style={{ display: 'none' }}
          onChange={makeFileHandler(openProject)}
        />
      </div>

      <div className="toolbar-group">
        <span className="toolbar-label">Add</span>
        {(['box', 'sphere', 'cylinder', 'cone', 'torus'] as const).map((type) => (
          <button
            key={type}
            className="toolbar-btn"
            onClick={() => handleAddPrimitive(type)}
            title={`Add ${type}`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
        <button
          className="toolbar-btn"
          onClick={() => handleAddPrimitive('beerglass')}
          title="Add beer glass (Superfest)"
        >
          Beer Glass
        </button>
      </div>

      <div className="toolbar-group">
        <span className="toolbar-label">Import</span>
        <button
          className="toolbar-btn"
          onClick={() => stlInputRef.current?.click()}
          title="Import STL file"
        >
          STL
        </button>
        <button
          className="toolbar-btn"
          onClick={() => objInputRef.current?.click()}
          title="Import OBJ file"
        >
          OBJ
        </button>
        <button
          className="toolbar-btn"
          onClick={() => mfInputRef.current?.click()}
          title="Import 3MF file"
        >
          3MF
        </button>
        <input
          ref={stlInputRef}
          type="file"
          accept=".stl"
          style={{ display: 'none' }}
          onChange={makeFileHandler(importStlFile)}
        />
        <input
          ref={objInputRef}
          type="file"
          accept=".obj"
          style={{ display: 'none' }}
          onChange={makeFileHandler(importObjFile)}
        />
        <input
          ref={mfInputRef}
          type="file"
          accept=".3mf"
          style={{ display: 'none' }}
          onChange={makeFileHandler(import3mfFile)}
        />
      </div>

      <div className="toolbar-group">
        <span className="toolbar-label">Transform</span>
        {TRANSFORM_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            className={`toolbar-btn${transformMode === mode ? ' toolbar-btn--active' : ''}`}
            onClick={() => setTransformMode(mode)}
            title={`${label} (${mode === 'translate' ? 'G' : mode === 'rotate' ? 'R' : 'S'})`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="toolbar-group">
        <span className="toolbar-label">Boolean</span>
        {BOOLEAN_OPS.map(({ op, label, title }) => (
          <button
            key={op}
            className="toolbar-btn"
            disabled={!booleanEnabled}
            onClick={() => { void triggerCsg(op); }}
            title={booleanEnabled ? title : 'Select exactly 2 objects to use boolean operations'}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="toolbar-group">
        <span className="toolbar-label">Workplane</span>
        <button
          className={`toolbar-btn${workplanePlacementMode ? ' toolbar-btn--active' : ''}`}
          onClick={() => setWorkplanePlacementMode(!workplanePlacementMode)}
          title="Set workplane on face (click to activate, Esc to cancel)"
        >
          Set Plane
        </button>
        <button
          className="toolbar-btn"
          onClick={handleResetWorkplane}
          title="Reset workplane to world XZ plane"
        >
          Reset Plane
        </button>
      </div>

      <div className="toolbar-group">
        <span className="toolbar-label">Export ({exportScope})</span>
        <button
          className="toolbar-btn"
          onClick={exportStl}
          title={exportTitle('STL')}
        >
          STL
        </button>
        <button
          className="toolbar-btn"
          onClick={exportObj}
          title={exportTitle('OBJ')}
        >
          OBJ
        </button>
        <button
          className="toolbar-btn"
          onClick={() => { void exportGltf(); }}
          title={exportTitle('glTF/GLB')}
        >
          glTF
        </button>
        <button
          className="toolbar-btn"
          onClick={export3mf}
          title={exportTitle('3MF')}
        >
          3MF
        </button>
      </div>

      <div className="toolbar-group toolbar-group--right">
        <span className="toolbar-label">View</span>
        {CAMERA_PRESETS.map((preset) => (
          <button
            key={preset}
            className="toolbar-btn"
            onClick={() => actionsRef.current?.setPreset(preset)}
            title={`${preset} view`}
          >
            {preset.charAt(0).toUpperCase() + preset.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
