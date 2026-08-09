import * as THREE from 'three';

/** Samples every vertex of meshes whose userData.nodeId is in
 *  `descendantIds`, optionally pre-multiplied by `extraMatrix` (applied
 *  before matrixWorld), and returns the minimum signed distance to
 *  `plane` (Infinity if nothing matched). Caller must have already
 *  called scene.updateMatrixWorld(). */
export function minSignedDistanceToPlane(
  scene: THREE.Scene,
  descendantIds: Set<string>,
  plane: THREE.Plane,
  extraMatrix?: THREE.Matrix4,
): number {
  let minDist = Infinity;
  const tempVertex = new THREE.Vector3();
  const tempMatrix = new THREE.Matrix4();
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!descendantIds.has(obj.userData.nodeId as string)) return;
    const positions = obj.geometry.attributes.position;
    if (!positions) return;
    const matrix = extraMatrix ? tempMatrix.multiplyMatrices(extraMatrix, obj.matrixWorld) : obj.matrixWorld;
    for (let i = 0; i < positions.count; i++) {
      tempVertex.fromBufferAttribute(positions, i).applyMatrix4(matrix);
      const d = plane.distanceToPoint(tempVertex);
      if (d < minDist) minDist = d;
    }
  });
  return minDist;
}
