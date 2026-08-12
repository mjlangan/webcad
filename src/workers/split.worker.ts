import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { Evaluator, Brush, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import { geometryToStl } from '../lib/geometryToStl';

type Vec3 = [number, number, number];

interface SplitOperationMessage {
  type: 'SPLIT_OPERATION';
  payload: {
    mesh: ArrayBuffer;
    planeOrigin: Vec3;
    planeNormal: Vec3;
  };
}

const loader = new STLLoader();
const evaluator = new Evaluator();
evaluator.useGroups = false;
evaluator.attributes = ['position', 'normal'];

self.onmessage = (event: MessageEvent<SplitOperationMessage>) => {
  const { type, payload } = event.data;
  if (type !== 'SPLIT_OPERATION') return;

  try {
    const { mesh, planeOrigin, planeNormal } = payload;

    const geo = loader.parse(mesh);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const sphere = geo.boundingSphere!;
    const R = sphere.radius;
    const C = sphere.center;

    const originVec = new THREE.Vector3(...planeOrigin);
    const normalVec = new THREE.Vector3(...planeNormal).normalize();

    // Size the cutting box from the plane origin's full distance to the far
    // side of the mesh — not just the along-normal component. The box is
    // centered laterally on the plane origin, so a workplane set on a face
    // far off to one side needs the lateral reach too; using only the normal
    // component let the box's *side* faces clip the mesh, adding phantom cuts
    // that don't lie on the workplane.
    const reach = C.distanceTo(originVec) + R;
    const boxSize = Math.max(reach * 2.2, 1e-3);

    // Box center is offset along normal so one face coincides with the plane
    const boxCenter = originVec.clone().addScaledVector(normalVec, boxSize / 2);

    const boxGeo = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
    // Orient the box so its local +Y is the plane normal. This must be a
    // proper rotation: a mirrored (negative-determinant) basis reverses the
    // box's triangle winding, which makes the CSG evaluator read it as an
    // inside-out solid and produce cuts that don't follow the plane at all.
    // Only the normal matters here — the box is square and huge, so its
    // rotation about the normal can't affect which side of the plane
    // geometry lands on, and deriving it from the stored tangentX would risk
    // skewing the box if that vector ever drifts out of perpendicular.
    const orient = new THREE.Matrix4().makeRotationFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalVec),
    );
    orient.setPosition(boxCenter);
    boxGeo.applyMatrix4(orient);

    const meshBrush = new Brush(geo);
    const boxBrush = new Brush(boxGeo);
    meshBrush.updateMatrixWorld();
    boxBrush.updateMatrixWorld();

    const aboveResult = evaluator.evaluate(meshBrush, boxBrush, INTERSECTION);
    const belowResult = evaluator.evaluate(meshBrush, boxBrush, SUBTRACTION);

    const aboveBuffer = geometryToStl(aboveResult.geometry);
    const belowBuffer = geometryToStl(belowResult.geometry);

    geo.dispose();
    boxGeo.dispose();
    aboveResult.geometry.dispose();
    belowResult.geometry.dispose();

    (self as unknown as Worker).postMessage(
      { type: 'SPLIT_RESULT', payload: { above: aboveBuffer, below: belowBuffer } },
      [aboveBuffer, belowBuffer],
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'SPLIT_ERROR',
      payload: { message: err instanceof Error ? err.message : String(err) },
    });
  }
};
