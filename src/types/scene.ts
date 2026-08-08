export interface BoxParams {
  type: 'box';
  width: number;
  height: number;
  depth: number;
}

export interface SphereParams {
  type: 'sphere';
  radius: number;
  widthSegments: number;
  heightSegments: number;
}

export interface CylinderParams {
  type: 'cylinder';
  radiusTop: number;
  radiusBottom: number;
  height: number;
  radialSegments: number;
}

export interface ConeParams {
  type: 'cone';
  radius: number;
  height: number;
  radialSegments: number;
}

export interface TorusParams {
  type: 'torus';
  radius: number;
  tube: number;
  radialSegments: number;
  tubularSegments: number;
}

export interface BeerGlassParams {
  type: 'beerglass';
  radiusUpper: number;
  radiusLower: number;
  height: number;
  radialSegments: number;
}

export interface WedgeParams {
  type: 'wedge';
  width: number;
  depth: number;
  height: number;
}

export interface RoofParams {
  type: 'roof';
  width: number;
  depth: number;
  height: number;
}

export interface PyramidParams {
  type: 'pyramid';
  width: number;
  depth: number;
  height: number;
}

export interface TubeParams {
  type: 'tube';
  outerRadius: number;
  innerRadius: number;
  height: number;
  radialSegments: number;
}

export interface DomeParams {
  type: 'dome';
  radius: number;
  widthSegments: number;
  heightSegments: number;
}

export interface PolygonParams {
  type: 'polygon';
  sides: number;
  radius: number;
  height: number;
}

export interface EllipsoidParams {
  type: 'ellipsoid';
  radiusX: number;
  radiusY: number;
  radiusZ: number;
  widthSegments: number;
  heightSegments: number;
}

export interface CapsuleParams {
  type: 'capsule';
  radius: number;
  length: number;
  capSegments: number;
  radialSegments: number;
}

export interface TorusKnotParams {
  type: 'torusknot';
  radius: number;
  tube: number;
  tubularSegments: number;
  radialSegments: number;
  p: number;
  q: number;
}

export interface ImportedMeshParams {
  type: 'imported';
  meshId: string;
  originalName: string;
}

export interface GroupParams {
  type: 'group';
}

export type PrimitiveParams =
  | BoxParams
  | SphereParams
  | CylinderParams
  | ConeParams
  | TorusParams
  | BeerGlassParams
  | WedgeParams
  | RoofParams
  | PyramidParams
  | TubeParams
  | DomeParams
  | PolygonParams
  | EllipsoidParams
  | CapsuleParams
  | TorusKnotParams
  | ImportedMeshParams
  | GroupParams;

export interface Transform {
  position: [number, number, number];
  rotation: [number, number, number]; // Euler XYZ in radians
  scale: [number, number, number];
}

export interface MaterialProps {
  color: string;
  opacity: number;
  wireframe: boolean;
}

export type CsgOperation = 'union' | 'subtract' | 'intersect';

export interface SceneNode {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  transform: Transform;
  geometry: PrimitiveParams;
  material: MaterialProps;
  // Parent-child for CSG groups
  parentId: string | null;
  childIds: string[];
  csgOperation: CsgOperation | null;
  csgError: string | null;
}

export interface Workplane {
  origin: [number, number, number];
  normal: [number, number, number];
  tangentX: [number, number, number];
}

export const DEFAULT_WORKPLANE: Workplane = {
  origin: [0, 0, 0],
  normal: [0, 1, 0],   // World +Y
  tangentX: [1, 0, 0], // World +X
};
