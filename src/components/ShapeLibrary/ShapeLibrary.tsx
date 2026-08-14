import { useState } from 'react';
import { Drawer, Tooltip } from 'antd';
import { undoStack } from '../../store/undoStack';
import { AddNodeCommand } from '../../store/commands';
import type { PrimitiveParams } from '../../types/scene';

const PRIMITIVE_TYPES = [
  'box', 'sphere', 'cylinder', 'cone', 'torus',
  'wedge', 'roof', 'pyramid', 'tube', 'dome',
  'polygon', 'ellipsoid', 'capsule', 'torusknot',
  'beerglass',
] as const;

// Single knob controlling tile size — the tile grid below is a flex-wrap
// container (not a fixed-column CSS grid), so it stays responsive: however
// many TILE_SIZE-wide tiles fit the drawer's current width is how many show
// per row.
const TILE_SIZE = 90;
const DRAWER_WIDTH = 2 * TILE_SIZE + 40;

// Rendered thumbnails (scripts/generate-shape-thumbnails.spec.ts), keyed by
// type. Regenerate via `npm run generate:thumbnails` whenever a shape's
// default params or geometry construction changes.
const THUMBNAILS = import.meta.glob('../../assets/shapeThumbnails/*.png', { eager: true }) as Record<
  string,
  { default: string }
>;
function thumbnailFor(type: string): string | undefined {
  const entry = Object.entries(THUMBNAILS).find(([path]) => path.endsWith(`/${type}.png`));
  return entry?.[1].default;
}

// Overrides for types whose display name isn't just a capitalized single word.
const PRIMITIVE_LABELS: Partial<Record<string, string>> = {
  beerglass: 'Beer Glass',
  polygon: 'Polygon Prism',
  torusknot: 'Torus Knot',
};

function labelForType(type: string): string {
  return PRIMITIVE_LABELS[type] ?? (type.charAt(0).toUpperCase() + type.slice(1));
}

function buildPrimitiveGeometry(type: string): PrimitiveParams | null {
  switch (type) {
    case 'box':
      return { type: 'box', width: 20, height: 20, depth: 20 };
    case 'sphere':
      return { type: 'sphere', radius: 10, widthSegments: 64, heightSegments: 32 };
    case 'cylinder':
      return { type: 'cylinder', radius: 10, height: 20, radialSegments: 64 };
    case 'cone':
      return { type: 'cone', radiusTop: 0, radiusBottom: 10, height: 20, radialSegments: 64 };
    case 'torus':
      return { type: 'torus', radius: 10, tube: 4, radialSegments: 64, tubularSegments: 64 };
    case 'beerglass':
      return { type: 'beerglass', radiusUpper: 37.5, radiusLower: 34.2, height: 165, radialSegments: 64 };
    case 'wedge':
      return { type: 'wedge', width: 20, depth: 20, height: 20 };
    case 'roof':
      return { type: 'roof', width: 20, depth: 20, height: 10 };
    case 'pyramid':
      return { type: 'pyramid', width: 20, depth: 20, height: 20 };
    case 'tube':
      return { type: 'tube', outerRadius: 10, innerRadius: 6, height: 20, radialSegments: 64 };
    case 'dome':
      return { type: 'dome', radius: 10, widthSegments: 64, heightSegments: 32 };
    case 'polygon':
      return { type: 'polygon', sides: 6, radius: 10, height: 20 };
    case 'ellipsoid':
      return { type: 'ellipsoid', radiusX: 12, radiusY: 8, radiusZ: 10, widthSegments: 64, heightSegments: 32 };
    case 'capsule':
      return { type: 'capsule', radius: 6, length: 14, capSegments: 32, radialSegments: 64 };
    case 'torusknot':
      return { type: 'torusknot', radius: 10, tube: 3, tubularSegments: 64, radialSegments: 64, p: 2, q: 3 };
    default:
      return null;
  }
}

/** Right-side pop-out drawer showing every addable primitive as a scrollable,
 *  responsive tile grid (rendered thumbnail + label per tile), plus a docked
 *  edge handle that stays visible (and slides with the drawer) so it can be
 *  reopened at any time. Rendered inside `.app-viewport` (a positioned
 *  container that already excludes the toolbar row) with `getContainer={false}`
 *  / `position: absolute` so it's confined to the viewport area and never
 *  overlaps — or intercepts clicks on — the toolbar above it. */
export default function ShapeLibrary() {
  const [open, setOpen] = useState(false);

  const handleAdd = (type: string) => {
    const geometry = buildPrimitiveGeometry(type);
    if (geometry) undoStack.push(new AddNodeCommand(geometry));
  };

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          right: open ? DRAWER_WIDTH : 0,
          transform: 'translateY(-50%)',
          transition: 'right 0.2s ease',
          zIndex: 1001,
        }}
      >
        <Tooltip title={open ? 'Close shape library' : 'Open shape library'} placement="left">
          <button
            data-testid="shape-library-handle"
            onClick={() => setOpen((v) => !v)}
            style={{
              writingMode: 'vertical-rl',
              height: 92,
              padding: '10px 6px',
              cursor: 'pointer',
              border: '1px solid #424242',
              borderRight: 'none',
              borderRadius: '3px 0 0 3px',
              background: open ? '#4488ff' : '#1f1f1f',
              color: '#fff',
              fontSize: 14,
            }}
          >
            Shapes
          </button>
        </Tooltip>
      </div>

      <Drawer
        title="Shape Library"
        placement="right"
        open={open}
        onClose={() => setOpen(false)}
        mask={false}
        getContainer={false}
        size={DRAWER_WIDTH}
        styles={{ body: { padding: 8, overflowY: 'auto' } }}
      >
        <div
          data-testid="shape-library-list"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' }}
        >
          {PRIMITIVE_TYPES.map((type) => (
            <Tooltip key={type} title={`Add ${labelForType(type)}`} placement="top">
              <button
                data-testid={`toolbar-add-${type}`}
                onClick={() => handleAdd(type)}
                style={{
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 2,
                  padding: '4px 4px 6px',
                  cursor: 'pointer',
                  border: '1px solid #303030',
                  borderRadius: 4,
                  background: '#1a1a1a',
                }}
              >
                <img
                  src={thumbnailFor(type)}
                  alt=""
                  style={{ flex: 1, minHeight: 0, width: '100%', objectFit: 'contain' }}
                />
                <span style={{ fontSize: 11, color: '#ccc', textAlign: 'center', lineHeight: 1.2 }}>
                  {labelForType(type)}
                </span>
              </button>
            </Tooltip>
          ))}
        </div>
      </Drawer>
    </>
  );
}
