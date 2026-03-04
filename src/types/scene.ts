export interface BoxParams {
  type: 'box';
  width: number;
  height: number;
  depth: number;
}

export type PrimitiveParams = BoxParams;

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
