import { useRef, type ChangeEvent, type MutableRefObject } from 'react';
import { useSceneStore } from '../../store/useSceneStore';
import type { PrimitiveParams } from '../../types/scene';
import type { CameraPreset, ViewportActions } from '../../types/viewport';
import { importStlFile } from '../../lib/stlImport';
import './Toolbar.css';

const CAMERA_PRESETS: CameraPreset[] = [
  'home', 'front', 'back', 'left', 'right', 'top', 'bottom',
];

interface ToolbarProps {
  actionsRef: MutableRefObject<ViewportActions | null>;
}

export default function Toolbar({ actionsRef }: ToolbarProps) {
  const addNode = useSceneStore((s) => s.addNode);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      default:
        return;
    }
    addNode(geometry);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importStlFile(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
  };

  return (
    <div className="toolbar">
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
          onClick={() => fileInputRef.current?.click()}
          title="Import STL file"
        >
          Import STL
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".stl"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
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
