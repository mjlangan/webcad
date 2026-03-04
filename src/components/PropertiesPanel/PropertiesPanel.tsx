import { useSceneStore } from '../../store/useSceneStore';
import type { ReactNode } from 'react';
import type { PrimitiveParams } from '../../types/scene';
import './PropertiesPanel.css';

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

interface NumFieldProps {
  label: string;
  value: number;
  step?: number;
  min?: number;
  unit?: string;
  onChange: (v: number) => void;
}

function NumField({ label, value, step = 1, min, unit, onChange }: NumFieldProps) {
  return (
    <label className="prop-field">
      <span className="prop-field-label">{label}</span>
      <div className="prop-field-input-wrap">
        <input
          type="number"
          className={unit ? 'prop-field-input prop-field-input--with-unit' : 'prop-field-input'}
          value={parseFloat(value.toFixed(4))}
          step={step}
          min={min}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
        />
        {unit && <span className="prop-field-unit">{unit}</span>}
      </div>
    </label>
  );
}

interface SectionProps {
  title: string;
  children: ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="prop-section">
      <div className="prop-section-title">{title}</div>
      {children}
    </div>
  );
}

function GeometryFields({
  geometry,
  onUpdate,
}: {
  geometry: PrimitiveParams;
  onUpdate: (g: PrimitiveParams) => void;
}) {
  switch (geometry.type) {
    case 'box':
      return (
        <Section title="Geometry — Box">
          <NumField label="W" unit="mm" value={geometry.width}  onChange={(v) => onUpdate({ ...geometry, width:  v })} />
          <NumField label="H" unit="mm" value={geometry.height} onChange={(v) => onUpdate({ ...geometry, height: v })} />
          <NumField label="D" unit="mm" value={geometry.depth}  onChange={(v) => onUpdate({ ...geometry, depth:  v })} />
        </Section>
      );
    case 'sphere':
      return (
        <Section title="Geometry — Sphere">
          <NumField label="Radius"     unit="mm" value={geometry.radius}         onChange={(v) => onUpdate({ ...geometry, radius:         v })} />
          <NumField label="Width Seg"            value={geometry.widthSegments}  step={1} min={3} onChange={(v) => onUpdate({ ...geometry, widthSegments:  Math.max(3,  Math.round(v)) })} />
          <NumField label="Height Seg"           value={geometry.heightSegments} step={1} min={2} onChange={(v) => onUpdate({ ...geometry, heightSegments: Math.max(2,  Math.round(v)) })} />
        </Section>
      );
    case 'cylinder':
      return (
        <Section title="Geometry — Cylinder">
          <NumField label="R Top"    unit="mm" value={geometry.radiusTop}    onChange={(v) => onUpdate({ ...geometry, radiusTop:    v })} />
          <NumField label="R Bottom" unit="mm" value={geometry.radiusBottom} onChange={(v) => onUpdate({ ...geometry, radiusBottom: v })} />
          <NumField label="Height"   unit="mm" value={geometry.height}       onChange={(v) => onUpdate({ ...geometry, height:       v })} />
          <NumField label="Segments"           value={geometry.radialSegments} step={1} min={3} onChange={(v) => onUpdate({ ...geometry, radialSegments: Math.max(3, Math.round(v)) })} />
        </Section>
      );
    case 'cone':
      return (
        <Section title="Geometry — Cone">
          <NumField label="Radius"   unit="mm" value={geometry.radius} onChange={(v) => onUpdate({ ...geometry, radius: v })} />
          <NumField label="Height"   unit="mm" value={geometry.height} onChange={(v) => onUpdate({ ...geometry, height: v })} />
          <NumField label="Segments"           value={geometry.radialSegments} step={1} min={3} onChange={(v) => onUpdate({ ...geometry, radialSegments: Math.max(3, Math.round(v)) })} />
        </Section>
      );
    case 'torus':
      return (
        <Section title="Geometry — Torus">
          <NumField label="Radius"   unit="mm" value={geometry.radius}         onChange={(v) => onUpdate({ ...geometry, radius:         v })} />
          <NumField label="Tube"     unit="mm" value={geometry.tube}           onChange={(v) => onUpdate({ ...geometry, tube:           v })} />
          <NumField label="Rad Seg"            value={geometry.radialSegments}  step={1} min={2} onChange={(v) => onUpdate({ ...geometry, radialSegments:  Math.max(2, Math.round(v)) })} />
          <NumField label="Tube Seg"           value={geometry.tubularSegments} step={1} min={3} onChange={(v) => onUpdate({ ...geometry, tubularSegments: Math.max(3, Math.round(v)) })} />
        </Section>
      );
    case 'imported':
      return (
        <Section title="Geometry — Imported">
          <div className="prop-imported-name">{geometry.originalName}</div>
        </Section>
      );
  }
}

export default function PropertiesPanel() {
  const nodes = useSceneStore((s) => s.nodes);
  const selectedId = useSceneStore((s) => s.selectedId);
  const updateTransform = useSceneStore((s) => s.updateTransform);
  const updatePrimitiveParams = useSceneStore((s) => s.updatePrimitiveParams);

  const node = nodes.find((n) => n.id === selectedId);

  if (!node) {
    return (
      <div className="props-panel props-panel--empty">
        <div className="panel-header">Properties</div>
        <p className="props-empty-msg">Select an object to edit its properties.</p>
      </div>
    );
  }

  const { transform, geometry } = node;

  const setPos = (axis: 0 | 1 | 2, v: number) => {
    const pos = [...transform.position] as [number, number, number];
    pos[axis] = v;
    updateTransform(node.id, { ...transform, position: pos });
  };

  const setRot = (axis: 0 | 1 | 2, deg: number) => {
    const rot = [...transform.rotation] as [number, number, number];
    rot[axis] = deg * DEG_TO_RAD;
    updateTransform(node.id, { ...transform, rotation: rot });
  };

  const setScale = (axis: 0 | 1 | 2, v: number) => {
    const sc = [...transform.scale] as [number, number, number];
    sc[axis] = v;
    updateTransform(node.id, { ...transform, scale: sc });
  };

  return (
    <div className="props-panel">
      <div className="panel-header">Properties</div>
      <div className="props-node-name">{node.name}</div>

      <Section title="Position">
        <NumField label="X" unit="mm" value={transform.position[0]} onChange={(v) => setPos(0, v)} />
        <NumField label="Y" unit="mm" value={transform.position[1]} onChange={(v) => setPos(1, v)} />
        <NumField label="Z" unit="mm" value={transform.position[2]} onChange={(v) => setPos(2, v)} />
      </Section>

      <Section title="Rotation (°)">
        <NumField label="X" value={transform.rotation[0] * RAD_TO_DEG} step={1} onChange={(v) => setRot(0, v)} />
        <NumField label="Y" value={transform.rotation[1] * RAD_TO_DEG} step={1} onChange={(v) => setRot(1, v)} />
        <NumField label="Z" value={transform.rotation[2] * RAD_TO_DEG} step={1} onChange={(v) => setRot(2, v)} />
      </Section>

      <Section title="Scale">
        <NumField label="X" value={transform.scale[0]} step={0.01} min={0.001} onChange={(v) => setScale(0, v)} />
        <NumField label="Y" value={transform.scale[1]} step={0.01} min={0.001} onChange={(v) => setScale(1, v)} />
        <NumField label="Z" value={transform.scale[2]} step={0.01} min={0.001} onChange={(v) => setScale(2, v)} />
      </Section>

      <GeometryFields
        geometry={geometry}
        onUpdate={(g) => updatePrimitiveParams(node.id, g)}
      />

    </div>
  );
}
