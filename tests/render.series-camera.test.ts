import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { boardOrigin } from '../src/core/bulk';
import { fitSeriesCamera } from '../src/render/seriesCamera';

describe('responsive series framing', () => {
  for (const [rows, columns] of [
    [1, 7],
    [7, 1],
    [7, 7],
  ]) {
    for (const aspect of [0.45, 1, 2.5]) {
      it(`fits ${rows} × ${columns} tiles and tall objects at aspect ${aspect}`, () => {
        const board = new THREE.Group();
        const geometry = new THREE.BoxGeometry(2, 0.3, Math.sqrt(3));
        const material = new THREE.MeshBasicMaterial();
        for (let index = 0; index < rows! * columns!; index++) {
          const tile = new THREE.Mesh(geometry, material);
          const origin = boardOrigin(index, columns!);
          tile.position.set(origin.x, 0, origin.y);
          board.add(tile);
        }
        const decoration = new THREE.Mesh(geometry, material);
        decoration.position
          .copy(board.children.at(-1)!.position)
          .add(new THREE.Vector3(0.7, 3, 0.3));
        board.add(decoration);
        const bounds = new THREE.Box3().setFromObject(board);
        for (const camera of [new THREE.OrthographicCamera(), new THREE.PerspectiveCamera(42)]) {
          camera.zoom = 3;
          const target = fitSeriesCamera(board, camera, aspect);
          expect(target).toEqual(bounds.getCenter(new THREE.Vector3()));
          expect(camera.zoom).toBe(1);
          for (const x of [bounds.min.x, bounds.max.x])
            for (const y of [bounds.min.y, bounds.max.y])
              for (const z of [bounds.min.z, bounds.max.z]) {
                const point = new THREE.Vector3(x, y, z).project(camera);
                expect(Math.abs(point.x)).toBeLessThan(0.96);
                expect(Math.abs(point.y)).toBeLessThan(0.96);
                expect(Math.abs(point.z)).toBeLessThan(1);
              }
        }
        geometry.dispose();
        material.dispose();
      });
    }
  }
});
