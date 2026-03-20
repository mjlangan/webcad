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
    planeTangentX: Vec3;
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
    const { mesh, planeOrigin, planeNormal, planeTangentX } = payload;

    const geo = loader.parse(mesh);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const sphere = geo.boundingSphere!;
    const R = sphere.radius;
    const C = sphere.center;

    const originVec = new THREE.Vector3(...planeOrigin);
    const normalVec = new THREE.Vector3(...planeNormal).normalize();
    const tangentXVec = new THREE.Vector3(...planeTangentX).normalize();
    const tangentZVec = new THREE.Vector3().crossVectors(normalVec, tangentXVec);

    // Size the cutting box to contain all geometry on the "above" side
    const distCenterToPlane = Math.abs(normalVec.dot(C.clone().sub(originVec)));
    const boxSize = Math.max((distCenterToPlane + R) * 3, R * 6, 1000);

    // Box center is offset along normal so one face coincides with the plane
    const boxCenter = originVec.clone().addScaledVector(normalVec, boxSize / 2);

    const boxGeo = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
    // Orient: local Y = normal, local X = tangentX, local Z = tangentZ
    const basis = new THREE.Matrix4().makeBasis(tangentXVec, normalVec, tangentZVec);
    basis.setPosition(boxCenter);
    boxGeo.applyMatrix4(basis);

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
