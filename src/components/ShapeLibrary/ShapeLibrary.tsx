import { useState } from 'react';
import { Button, Drawer, Tooltip } from 'antd';
import { useSceneStore } from '../../store/useSceneStore';
import type { PrimitiveParams } from '../../types/scene';

const PRIMITIVE_TYPES = [
  'box', 'sphere', 'cylinder', 'cone', 'torus',
  'wedge', 'roof', 'pyramid', 'tube', 'dome',
  'polygon', 'ellipsoid', 'capsule',
  'torusknot',
] as const;
const DRAWER_WIDTH = 200;

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
      return { type: 'sphere', radius: 10, widthSegments: 32, heightSegments: 16 };
    case 'cylinder':
      return { type: 'cylinder', radiusTop: 10, radiusBottom: 10, height: 20, radialSegments: 64 };
    case 'cone':
      return { type: 'cone', radius: 10, height: 20, radialSegments: 32 };
    case 'torus':
      return { type: 'torus', radius: 10, tube: 4, radialSegments: 16, tubularSegments: 64 };
    case 'beerglass':
      return { type: 'beerglass', radiusUpper: 37.5, radiusLower: 34.2, height: 165, radialSegments: 32 };
    case 'wedge':
      return { type: 'wedge', width: 20, depth: 20, height: 20 };
    case 'roof':
      return { type: 'roof', width: 20, depth: 20, height: 10 };
    case 'pyramid':
      return { type: 'pyramid', width: 20, depth: 20, height: 20 };
    case 'tube':
      return { type: 'tube', outerRadius: 10, innerRadius: 6, height: 20, radialSegments: 32 };
    case 'dome':
      return { type: 'dome', radius: 10, widthSegments: 32, heightSegments: 16 };
    case 'polygon':
      return { type: 'polygon', sides: 6, radius: 10, height: 20 };
    case 'ellipsoid':
      return { type: 'ellipsoid', radiusX: 12, radiusY: 8, radiusZ: 10, widthSegments: 32, heightSegments: 16 };
    case 'capsule':
      return { type: 'capsule', radius: 6, length: 14, capSegments: 8, radialSegments: 16 };
    case 'torusknot':
      return { type: 'torusknot', radius: 10, tube: 3, tubularSegments: 64, radialSegments: 8, p: 2, q: 3 };
    default:
      return null;
  }
}

/** Right-side pop-out drawer listing every addable primitive as a scrollable button list,
 *  plus a docked edge handle that stays visible (and slides with the drawer) so it can be
 *  reopened at any time. Rendered inside `.app-viewport` (a positioned container that
 *  already excludes the toolbar row) with `getContainer={false}` / `position: absolute` so
 *  it's confined to the viewport area and never overlaps — or intercepts clicks on — the
 *  toolbar above it. */
export default function ShapeLibrary() {
  const [open, setOpen] = useState(false);
  const addNode = useSceneStore((s) => s.addNode);

  const handleAdd = (type: string) => {
    const geometry = buildPrimitiveGeometry(type);
    if (geometry) addNode(geometry);
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
          <Button
            data-testid="shape-library-handle"
            type={open ? 'primary' : 'default'}
            onClick={() => setOpen((v) => !v)}
            style={{
              writingMode: 'vertical-rl',
              height: 92,
              padding: '10px 6px',
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
            }}
          >
            Shapes
          </Button>
        </Tooltip>
      </div>

      <Drawer
        title="Shape Library"
        placement="right"
        open={open}
        onClose={() => setOpen(false)}
        mask={false}
        getContainer={false}
        width={DRAWER_WIDTH}
        styles={{ body: { padding: 8, overflowY: 'auto' } }}
      >
        <div data-testid="shape-library-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {PRIMITIVE_TYPES.map((type) => (
            <Tooltip key={type} title={`Add ${labelForType(type)}`} placement="left">
              <Button data-testid={`toolbar-add-${type}`} block onClick={() => handleAdd(type)}>
                {labelForType(type)}
              </Button>
            </Tooltip>
          ))}
          <Tooltip title="Add beer glass (Superfest)" placement="left">
            <Button data-testid="toolbar-add-beerglass" block onClick={() => handleAdd('beerglass')}>
              Beer Glass
            </Button>
          </Tooltip>
        </div>
      </Drawer>
    </>
  );
}
