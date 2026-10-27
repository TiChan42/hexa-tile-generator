import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../src/core/config';
import { boardOrigin } from '../src/core/bulk';
import {
  boardCamera,
  disposeExportContent,
  portableModel,
  snapshotContent,
} from '../src/render/modelExport';

function content() {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(2, 0.4, 1.7);
  const material = new THREE.MeshStandardMaterial({ color: '#938153' });
  group.add(new THREE.Mesh(geometry, material));
  const objects = new THREE.InstancedMesh(geometry, material, 2);
  objects.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0.3, 0.8, 0.4));
  objects.setMatrixAt(1, new THREE.Matrix4().makeTranslation(-0.3, 1.4, -0.4));
  group.add(objects);
  return group;
}

describe('portable model and board exports', () => {
  it('freezes geometry, instance transforms and materials independently of editor changes', () => {
    const source = content();
    const snapshot = snapshotContent(source);
    const mesh = source.children[0] as THREE.Mesh;
    const copy = snapshot.children[0] as THREE.Mesh;
    const instances = source.children[1] as THREE.InstancedMesh;
    const frozen = snapshot.children[1] as THREE.InstancedMesh;
    const expected = copy.geometry.getAttribute('position').array.slice();
    mesh.geometry.translate(8, 7, 6);
    (mesh.material as THREE.MeshStandardMaterial).color.set('#ff0000');
    instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(99, 99, 99));
    expect(copy.geometry.getAttribute('position').array).toEqual(expected);
    expect((copy.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('938153');
    const matrix = new THREE.Matrix4();
    frozen.getMatrixAt(0, matrix);
    expect(matrix.elements[12]).toBeCloseTo(0.3);
    expect(copy.geometry).toBe(frozen.geometry);
    expect(copy.material).toBe(frozen.material);
    const sourceDispose = vi.spyOn(mesh.geometry, 'dispose');
    const copyDispose = vi.spyOn(copy.geometry, 'dispose');
    disposeExportContent(snapshot);
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(copyDispose).toHaveBeenCalledTimes(1);
    expect(source.children).toHaveLength(2);
    disposeExportContent(source);
  });

  it('preserves every decoration and its world transform as ordinary GLB mesh nodes', () => {
    const board = new THREE.Group();
    const tile = content();
    const position = boardOrigin(3, 2);
    tile.position.set(position.x, 0, position.y);
    tile.name = 'Kachel';
    tile.userData.tileId = 'stable-id';
    board.add(tile);
    const portable = portableModel(board);
    let count = 0;
    portable.updateMatrixWorld(true);
    portable.traverse((object) => {
      expect(object).not.toBeInstanceOf(THREE.InstancedMesh);
      if (object instanceof THREE.Mesh) count++;
    });
    expect(count).toBe(3);
    const copy = portable.children[0]!;
    expect(copy.name).toBe('Kachel');
    expect(copy.userData.tileId).toBe('stable-id');
    expect(copy.position).toEqual(tile.position);
    const objects = copy.children[1]!.children;
    const world = new THREE.Vector3().setFromMatrixPosition(objects[1]!.matrixWorld);
    expect(world.x).toBeCloseTo(position.x - 0.3);
    expect(world.y).toBeCloseTo(1.4);
    expect(world.z).toBeCloseTo(position.y - 0.4);
    expect(tile.children[1]).toBeInstanceOf(THREE.InstancedMesh);
    portable.clear();
    disposeExportContent(board);
  });

  it.each([
    { mode: 'top' as const, fov: 0, elevation: 90 },
    { mode: 'orbit' as const, fov: 0, elevation: 35 },
    { mode: 'orbit' as const, fov: 0, elevation: -70 },
    { mode: 'perspective' as const, fov: 65, elevation: 90 },
    { mode: 'perspective' as const, fov: -65, elevation: 90 },
    { mode: 'perspective' as const, fov: 0, elevation: 90 },
  ])(
    'fits the full displaced board, including tall objects, in $mode (fov $fov, elevation $elevation)',
    (view) => {
      const board = new THREE.Group();
      for (const index of [0, 1, 7, 14]) {
        const tile = content();
        const position = boardOrigin(index, 3);
        tile.position.set(position.x, 0, position.y);
        board.add(tile);
      }
      const camera = boardCamera(board, {
        ...defaultConfig.camera,
        ...view,
        zoom: 3,
        azimuth: 127,
      });
      const bounds = new THREE.Box3().setFromObject(board);
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const point = new THREE.Vector3(x, y, z).project(camera);
            expect(Math.abs(point.x)).toBeLessThan(1);
            expect(Math.abs(point.y)).toBeLessThan(1);
            expect(Math.abs(point.z)).toBeLessThan(1);
          }
      disposeExportContent(board);
    },
  );

  it('rejects an empty overview', () => {
    expect(() => boardCamera(new THREE.Group(), defaultConfig.camera)).toThrow(/keine Geometrie/);
  });
});
