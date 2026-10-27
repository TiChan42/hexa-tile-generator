import * as THREE from 'three';

/** Fit the actual board and its objects to the current viewport, including narrow screens. */
export function fitSeriesCamera(
  content: THREE.Object3D,
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
  aspect: number,
): THREE.Vector3 {
  content.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(content);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const span = Math.max(size.length(), 2);
  camera.zoom = 1;
  camera.near = 0.03;
  camera.far = span * 20;
  if (camera instanceof THREE.OrthographicCamera) {
    const halfHeight = Math.max(size.z, size.x / aspect, 0.1) * 0.55;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.up.set(0, 0, -1);
    camera.position.set(center.x, bounds.max.y + span * 3, center.z);
  } else {
    camera.aspect = aspect;
    camera.up.set(0, 1, 0);
    const direction = new THREE.Vector3(1, 1.15, 1).normalize();
    camera.position.copy(center);
    camera.lookAt(center.clone().sub(direction));
    camera.updateMatrixWorld(true);
    const focal = 1 / Math.tan((camera.fov * Math.PI) / 360);
    let distance = 0;
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
          distance = Math.max(
            distance,
            point.z + Math.max(Math.abs(point.x) / aspect, Math.abs(point.y)) * focal * 1.1,
          );
        }
    camera.position.copy(center).addScaledVector(direction, distance);
  }
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return center;
}
