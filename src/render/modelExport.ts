import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { bakeInstancePalette } from './objectPalettes';
import type { TileConfig } from '../core/types';
import { bakeModelTextures } from './textureBake';

/** Own geometry/material copies so subsequent editor updates cannot alter an export. */
export function snapshotContent(
  content: THREE.Group,
  cloneMaterial: (material: THREE.Material) => THREE.Material = (material) => material.clone(),
): THREE.Group {
  const result = content.clone(true);
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const materials = new Map<THREE.Material, THREE.Material>();
  const copyMaterial = (source: THREE.Material) => {
    let copy = materials.get(source);
    if (!copy) {
      copy = cloneMaterial(source);
      materials.set(source, copy);
    }
    return copy;
  };
  result.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
    const source: THREE.BufferGeometry = object.geometry;
    let copy = geometries.get(source);
    if (!copy) {
      copy = source.clone();
      geometries.set(source, copy);
    }
    object.geometry = copy;
    object.material = Array.isArray(object.material)
      ? object.material.map(copyMaterial)
      : copyMaterial(object.material);
  });
  return result;
}

/** Maps remain owned by the editor; snapshots only own geometry, instances and materials. */
export function disposeExportContent(content: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  content.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
    geometries.add(object.geometry);
    if (object instanceof THREE.InstancedMesh) object.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  content.clear();
}

/** Ordinary mesh nodes keep every instance portable without requiring GPU-instancing support. */
export function portableModel(
  content: THREE.Group,
  paletteGeometries = new Map<string, THREE.BufferGeometry>(),
): THREE.Group {
  const result = content.clone(true);
  const instances: THREE.InstancedMesh[] = [];
  result.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) instances.push(object);
  });
  for (const source of instances) {
    const group = new THREE.Group();
    group.name = source.name;
    group.position.copy(source.position);
    group.quaternion.copy(source.quaternion);
    group.scale.copy(source.scale);
    group.visible = source.visible;
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < source.count; index++) {
      const mesh = new THREE.Mesh(
        bakeInstancePalette(source, index, paletteGeometries),
        source.material,
      );
      source.getMatrixAt(index, matrix);
      mesh.matrix.copy(matrix);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    source.parent!.add(group);
    source.removeFromParent();
    source.dispose();
  }
  return result;
}

export async function exportGlb(
  content: THREE.Group,
  renderer: THREE.WebGLRenderer,
): Promise<Blob> {
  const paletteGeometries = new Map<string, THREE.BufferGeometry>();
  const model = portableModel(content, paletteGeometries);
  let releaseTextures: (() => void) | undefined;
  try {
    releaseTextures = bakeModelTextures(renderer, model);
    const data = await new GLTFExporter().parseAsync(model, { binary: true, onlyVisible: true });
    if (!(data instanceof ArrayBuffer)) throw new Error('GLB-Export fehlgeschlagen.');
    return new Blob([data], { type: 'model/gltf-binary' });
  } finally {
    releaseTextures?.();
    paletteGeometries.forEach((geometry) => geometry.dispose());
    // Portable nodes borrow the snapshot's resources.
    model.clear();
  }
}

/** Fit every object, including tall decorations, in a square overview with a small margin. */
export function boardCamera(content: THREE.Group, view: TileConfig['camera']): THREE.Camera {
  content.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(content);
  if (bounds.isEmpty()) throw new Error('Das Gesamtfeld enthält keine Geometrie.');
  const center = bounds.getCenter(new THREE.Vector3());
  const span = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1);
  const points: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) points.push(new THREE.Vector3(x, y, z));
  if (view.mode === 'perspective' && view.fov > 0) {
    const camera = new THREE.PerspectiveCamera(Math.max(5, view.fov), 1, 0.01, span * 20);
    const focal = 1 / Math.tan((camera.fov * Math.PI) / 360);
    const eye = Math.max(
      ...points.map(
        (p) => p.y + Math.max(Math.abs(p.x - center.x), Math.abs(p.z - center.z)) * focal * 1.04,
      ),
    );
    camera.up.set(0, 0, -1);
    camera.position.set(center.x, eye + 0.01, center.z);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    return camera;
  }
  const camera = new THREE.OrthographicCamera(-span, span, span, -span, 0.01, span * 20);
  const orbit = view.mode === 'orbit';
  const elevation = ((orbit ? view.elevation : 90) * Math.PI) / 180;
  const azimuth = ((orbit ? view.azimuth : 0) * Math.PI) / 180;
  const distance = span * 4;
  camera.up.set(0, orbit ? 1 : 0, orbit ? 0 : -1);
  camera.position
    .copy(center)
    .add(
      new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(elevation) * distance,
        Math.sin(elevation) * distance,
        Math.cos(azimuth) * Math.cos(elevation) * distance,
      ),
    );
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const k =
    view.mode === 'perspective' && view.fov < 0
      ? Math.min(0.3, Math.tan((Math.abs(view.fov) * Math.PI) / 360) / 4) / span
      : 0;
  const fit =
    Math.max(
      ...points.map((point) => {
        const projected = point.clone().applyMatrix4(camera.matrixWorldInverse);
        return (
          Math.max(Math.abs(projected.x), Math.abs(projected.y)) / (1 + k * (point.y - center.y))
        );
      }),
    ) * 1.04;
  camera.left = camera.bottom = -fit;
  camera.right = camera.top = fit;
  camera.updateProjectionMatrix();
  if (k > 0) {
    const w0 = 1 + k * distance;
    camera.far = Math.min(camera.far, (w0 / k) * 0.9);
    const depth = (-2 * w0 + k * (camera.near + camera.far)) / (camera.far - camera.near);
    camera.projectionMatrix.elements[11] = k;
    camera.projectionMatrix.elements[15] = w0;
    camera.projectionMatrix.elements[10] = depth;
    camera.projectionMatrix.elements[14] = -w0 + k * camera.near + depth * camera.near;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  return camera;
}
