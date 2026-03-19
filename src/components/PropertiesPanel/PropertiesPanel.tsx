import { useRef } from 'react';
import { InputNumber, Slider, Switch, ColorPicker, Divider, Typography } from 'antd';
import { useSceneStore } from '../../store/useSceneStore';
import { undoStack } from '../../store/undoStack';
import { TransformCommand, UpdateGeometryCommand, UpdateMaterialCommand } from '../../store/commands';
import type { ReactNode } from 'react';
import type { PrimitiveParams, Transform } from '../../types/scene';
import { parseMmValue, formatMm } from '../../lib/units';

const { Text } = Typography;

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#888',
  width: 72,
  flexShrink: 0,
};

interface MmInputProps {
  value: number;
  step?: number;
  min?: number;
  onChange: (v: number) => void;
}

function MmInput({ value, step = 1, min, onChange }: MmInputProps) {
  return (
    <InputNumber
      size="small"
      style={{ flex: 1, minWidth: 0 }}
      value={value}
      step={step}
      min={min}
      formatter={(v, { userTyping, input }) => {
        if (userTyping) return input;
        if (v === undefined || v === null) return '';
        return formatMm(Number(v));
      }}
      parser={(v) => parseMmValue(v ?? '') ?? value}
      onChange={(v) => { if (v !== null) onChange(v as number); }}
    />
  );
}

interface NumFieldProps {
  label: string;
  value: number;
  step?: number;
  min?: number;
  unit?: string;
  onChange: (v: number) => void;
}

function NumField({ label, value, step = 1, min, unit, onChange }: NumFieldProps) {
  let input: React.ReactNode;
  if (unit === 'mm') {
    input = <MmInput value={value} step={step} min={min} onChange={onChange} />;
  } else if (unit === 'deg') {
    input = (
      <InputNumber
        size="small"
        style={{ flex: 1, minWidth: 0 }}
        value={value}
        step={step}
        formatter={(v, { userTyping, input: raw }) => {
          if (userTyping) return raw;
          if (v === undefined || v === null) return '';
          return `${parseFloat(Number(v).toFixed(4))}°`;
        }}
        parser={(v) => parseFloat((v ?? '').replace(/°/g, '')) || 0}
        onChange={(v) => { if (v !== null) onChange(v as number); }}
      />
    );
  } else {
    input = (
      <InputNumber
        size="small"
        style={{ flex: 1, minWidth: 0 }}
        value={parseFloat(value.toFixed(4))}
        step={step}
        min={min}
        onChange={(v) => { if (v !== null) onChange(v); }}
      />
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={labelStyle}>{label}</span>
      {input}
    </div>
  );
}

interface SectionProps {
  title: string;
  children: ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div style={{ marginBottom: 8 }}>
      <Divider plain style={{ marginTop: 8, marginBottom: 8, fontSize: 11, color: '#666' }}>
        {title}
      </Divider>
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
    case 'beerglass':
      return (
        <Section title="Geometry — Beer Glass">
          <NumField label="R Rim"    unit="mm" value={geometry.radiusUpper} min={0.1} onChange={(v) => onUpdate({ ...geometry, radiusUpper: v })} />
          <NumField label="R Base"   unit="mm" value={geometry.radiusLower} min={0.1} onChange={(v) => onUpdate({ ...geometry, radiusLower: v })} />
          <NumField label="Height"   unit="mm" value={geometry.height}      min={0.1} onChange={(v) => onUpdate({ ...geometry, height:      v })} />
          <NumField label="Segments"           value={geometry.radialSegments} step={1} min={3} onChange={(v) => onUpdate({ ...geometry, radialSegments: Math.max(3, Math.round(v)) })} />
        </Section>
      );
    case 'imported':
      return (
        <Section title="Geometry — Imported">
          <Text style={{ fontSize: 11, color: '#aaa', wordBreak: 'break-all' }}>{geometry.originalName}</Text>
        </Section>
      );
  }
}

export default function PropertiesPanel() {
  const nodes = useSceneStore((s) => s.nodes);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const updateMaterial = useSceneStore((s) => s.updateMaterial);

  const node = nodes.find((n) => n.id === selectedIds[0]);

  const materialBeforeRef = useRef(node?.material);

  if (!node) {
    return (
      <div style={{
        gridArea: 'props',
        background: '#1a1a1a',
        borderLeft: '1px solid #2a2a2a',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #2a2a2a', fontSize: 12, fontWeight: 600, color: '#aaa' }}>
          Properties
        </div>
        <div style={{ padding: '12px', fontSize: 12, color: '#555' }}>
          Select an object to edit its properties.
        </div>
      </div>
    );
  }

  const { transform, geometry, material } = node;

  const applyTransform = (newTransform: Transform) => {
    undoStack.push(new TransformCommand([node.id], [transform], [newTransform]));
  };

  const setPos = (axis: 0 | 1 | 2, v: number) => {
    const pos = [...transform.position] as [number, number, number];
    pos[axis] = v;
    applyTransform({ ...transform, position: pos });
  };

  const setRot = (axis: 0 | 1 | 2, deg: number) => {
    const rot = [...transform.rotation] as [number, number, number];
    rot[axis] = deg * DEG_TO_RAD;
    applyTransform({ ...transform, rotation: rot });
  };

  const setScale = (axis: 0 | 1 | 2, v: number) => {
    const sc = [...transform.scale] as [number, number, number];
    sc[axis] = v;
    applyTransform({ ...transform, scale: sc });
  };

  const commitMaterial = () => {
    const after = useSceneStore.getState().nodes.find((n) => n.id === node.id)?.material;
    if (after && materialBeforeRef.current) {
      undoStack.push(new UpdateMaterialCommand(node.id, materialBeforeRef.current, after));
    }
  };

  return (
    <div style={{
      gridArea: 'props',
      background: '#1a1a1a',
      borderLeft: '1px solid #2a2a2a',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #2a2a2a', fontSize: 12, fontWeight: 600, color: '#aaa' }}>
        Properties
      </div>
      <div style={{ padding: '0 12px 12px', overflowY: 'auto', flex: 1 }}>
        <div style={{ fontSize: 12, color: '#ccc', padding: '8px 0 4px' }}>
          {selectedIds.length > 1 ? `${selectedIds.length} objects selected` : node.name}
        </div>

        <Section title="Position">
          <NumField label="X" unit="mm" value={transform.position[0]} onChange={(v) => setPos(0, v)} />
          <NumField label="Y" unit="mm" value={transform.position[1]} onChange={(v) => setPos(1, v)} />
          <NumField label="Z" unit="mm" value={transform.position[2]} onChange={(v) => setPos(2, v)} />
        </Section>

        <Section title="Rotation">
          <NumField label="X" unit="deg" value={transform.rotation[0] * RAD_TO_DEG} step={1} onChange={(v) => setRot(0, v)} />
          <NumField label="Y" unit="deg" value={transform.rotation[1] * RAD_TO_DEG} step={1} onChange={(v) => setRot(1, v)} />
          <NumField label="Z" unit="deg" value={transform.rotation[2] * RAD_TO_DEG} step={1} onChange={(v) => setRot(2, v)} />
        </Section>

        <Section title="Scale">
          <NumField label="X" value={transform.scale[0]} step={0.1} min={0.001} onChange={(v) => setScale(0, v)} />
          <NumField label="Y" value={transform.scale[1]} step={0.1} min={0.001} onChange={(v) => setScale(1, v)} />
          <NumField label="Z" value={transform.scale[2]} step={0.1} min={0.001} onChange={(v) => setScale(2, v)} />
        </Section>

        {selectedIds.length === 1 && (
          <GeometryFields
            geometry={geometry}
            onUpdate={(g) => undoStack.push(new UpdateGeometryCommand(node.id, geometry, g))}
          />
        )}

        <Section title="Appearance">
          {/* Color */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={labelStyle}>Color</span>
            <ColorPicker
              size="small"
              value={material.color}
              onOpenChange={(open) => {
                if (open) {
                  materialBeforeRef.current = material;
                } else {
                  commitMaterial();
                }
              }}
              onChange={(color) => updateMaterial(node.id, { ...material, color: color.toHexString() })}
            />
          </div>

          {/* Opacity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={labelStyle}>Opacity</span>
            <div
              style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}
              onPointerDown={() => { materialBeforeRef.current = material; }}
            >
              <Slider
                style={{ flex: 1 }}
                min={0}
                max={1}
                step={0.01}
                value={material.opacity}
                onChange={(v) => updateMaterial(node.id, { ...material, opacity: v })}
                onChangeComplete={commitMaterial}
              />
              <span style={{ fontSize: 11, color: '#888', width: 34, textAlign: 'right', flexShrink: 0 }}>
                {Math.round(material.opacity * 100)}%
              </span>
            </div>
          </div>

          {/* Wireframe */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={labelStyle}>Wireframe</span>
            <Switch
              size="small"
              checked={material.wireframe}
              onChange={(checked) => {
                const after = { ...material, wireframe: checked };
                undoStack.push(new UpdateMaterialCommand(node.id, material, after));
              }}
            />
          </div>
        </Section>
      </div>
    </div>
  );
}
