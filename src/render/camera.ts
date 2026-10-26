import * as THREE from 'three';
import type { TileConfig } from '../core/types';

export const CAMERA_TARGET = new THREE.Vector3(0, 0.07, 0);
const RAD = Math.PI / 180;

export interface CameraGroundPoint {
  point: { x: number; y: number };
  height: number;
}
const DEFAULT_GROUND: CameraGroundPoint[] = Array.from({ length: 6 }, (_, i) => ({
  point: { x: Math.cos((i * Math.PI) / 3), y: Math.sin((i * Math.PI) / 3) },
  height: 0.08,
}));

/** Perspective always looks straight down at the main tile, independently of its center field. */
export function configureTileCamera(
  orthographic: THREE.OrthographicCamera,
  perspective: THREE.PerspectiveCamera,
  view: TileConfig['camera'],
  aspect: number,
  exporting = false,
  suppliedGround: readonly CameraGroundPoint[] = DEFAULT_GROUND,
): THREE.OrthographicCamera | THREE.PerspectiveCamera {
  const ground = suppliedGround.length ? suppliedGround : DEFAULT_GROUND;
  const projected = view.mode !== 'orbit';
  const margin = exporting ? 1 : 1.12;
  const distance = 4;
  const elevation = (projected ? 90 : view.elevation) * RAD;
  const azimuth = (projected ? 0 : view.azimuth) * RAD;
  const usePerspective = view.mode === 'perspective' && view.fov > 0;
  const camera = usePerspective ? perspective : orthographic;
  camera.position.set(
    Math.sin(azimuth) * Math.cos(elevation) * distance,
    Math.sin(elevation) * distance + CAMERA_TARGET.y,
    Math.cos(azimuth) * Math.cos(elevation) * distance,
  );
  if (projected) camera.position.set(0, distance + CAMERA_TARGET.y, 0);
  camera.up.set(0, projected ? 0 : 1, projected ? -1 : 0);
  camera.lookAt(CAMERA_TARGET);
  if (usePerspective) {
    perspective.aspect = aspect;
    perspective.fov = Math.max(5, view.fov);
    perspective.zoom = 1;
    perspective.near = 0.005;
    const focal = 1 / Math.tan((perspective.fov * RAD) / 2);
    const eye = Math.max(
      ...ground.map(
        ({ point, height }) =>
          height + Math.max(Math.abs(point.x) / aspect, Math.abs(point.y)) * focal * margin,
      ),
      Math.max(...ground.map((p) => p.height)) + 0.02,
    );
    camera.position.set(0, eye, 0);
    camera.lookAt(CAMERA_TARGET);
    perspective.far = Math.max(40, eye + 8);
    perspective.updateProjectionMatrix();
  } else {
    const k =
      view.mode === 'perspective' && view.fov < 0
        ? Math.min(0.3, Math.tan((Math.abs(view.fov) * RAD) / 2) / 4)
        : 0;
    const fit =
      Math.max(
        ...ground.map(
          ({ point, height }) => Math.abs(point.x) / (1 + k * (height - CAMERA_TARGET.y)),
        ),
      ) / aspect;
    const verticalFit = Math.max(
      ...ground.map(
        ({ point, height }) => Math.abs(point.y) / (1 + k * (height - CAMERA_TARGET.y)),
      ),
    );
    const span = projected ? Math.max(fit, verticalFit) * margin : 1.25;
    orthographic.left = -span * aspect;
    orthographic.right = span * aspect;
    orthographic.top = span;
    orthographic.bottom = -span;
    orthographic.zoom = projected ? 1 : view.zoom;
    orthographic.near = 0.01;
    orthographic.far = 40;
    orthographic.updateProjectionMatrix();
    if (k > 0) {
      const matrix = orthographic.projectionMatrix;
      const w0 = 1 + k * distance;
      const near = orthographic.near;
      const far = (orthographic.far = Math.min(8, (w0 / k) * 0.9));
      const depth = (-2 * w0 + k * (near + far)) / (far - near);
      matrix.elements[11] = k;
      matrix.elements[15] = w0;
      matrix.elements[10] = depth;
      matrix.elements[14] = -w0 + k * near + depth * near;
      orthographic.projectionMatrixInverse.copy(matrix).invert();
    }
  }
  camera.updateMatrixWorld();
  return camera;
}

export interface CameraSnapshot {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  projection: THREE.Matrix4;
  inverseProjection: THREE.Matrix4;
  zoom: number;
}

export function captureCameraState(camera: THREE.Camera): CameraSnapshot {
  return {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    projection: camera.projectionMatrix.clone(),
    inverseProjection: camera.projectionMatrixInverse.clone(),
    zoom:
      camera instanceof THREE.OrthographicCamera || camera instanceof THREE.PerspectiveCamera
        ? camera.zoom
        : 1,
  };
}

/** Copying projection matrices also preserves the custom reverse projection. */
export function restoreCameraState(camera: THREE.Camera, state: CameraSnapshot): void {
  camera.position.copy(state.position);
  camera.quaternion.copy(state.quaternion);
  if (camera instanceof THREE.OrthographicCamera || camera instanceof THREE.PerspectiveCamera)
    camera.zoom = state.zoom;
  camera.projectionMatrix.copy(state.projection);
  camera.projectionMatrixInverse.copy(state.inverseProjection);
  camera.updateMatrixWorld();
}

/** Turn transient orbit gestures into a serializable, centered export camera. */
export function captureCameraView(
  camera: THREE.Camera,
  configured: TileConfig['camera'],
): TileConfig['camera'] {
  if (configured.mode !== 'orbit') return { ...configured, azimuth: 0, elevation: 90, zoom: 1 };
  const offset = camera.position.clone().sub(CAMERA_TARGET);
  const azimuth = Math.atan2(offset.x, offset.z) / RAD;
  const elevation = Math.atan2(offset.y, Math.hypot(offset.x, offset.z)) / RAD;
  const zoom =
    camera instanceof THREE.OrthographicCamera || camera instanceof THREE.PerspectiveCamera
      ? camera.zoom
      : configured.zoom;
  return {
    ...configured,
    azimuth,
    elevation: Math.max(-85, Math.min(90, elevation)),
    zoom: Math.max(0.4, Math.min(3, zoom)),
  };
}
