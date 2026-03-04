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

export interface ImportedMeshParams {
  type: 'imported';
  meshId: string;
  originalName: string;
}

export type PrimitiveParams =
  | BoxParams
  | SphereParams
  | CylinderParams
  | ConeParams
  | TorusParams
  | ImportedMeshParams;

export interface Transform {
  position: [number, number, number];
  rotation: [number, number, number]; // Euler XYZ in radians
  scale: [number, number, number];
}

export interface MaterialProps {
  color: string;
  opacity: number;
}

export interface SceneNode {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  transform: Transform;
  geometry: PrimitiveParams;
  material: MaterialProps;
}
