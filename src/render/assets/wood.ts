import type { VoxelModel } from '../voxels';
import { VoxelBuilder } from './builder';

export function createLog(): VoxelModel {
  const b = new VoxelBuilder(
    'log',
    'Liegender Baumstamm',
    [19, 10, 11],
    ['#4c392c', '#755039', '#9d7047', '#bd9159', '#ddb777', '#987044'],
  );
  for (let x = 1; x <= 17; x++)
    for (let y = 0; y <= 6; y++)
      for (let z = 1; z <= 9; z++) {
        const r = Math.hypot(y - 3, z - 5);
        if (r > 3.2) continue;
        let color = r > 2.25 ? (y > 4 ? 2 : z < 5 ? 1 : 0) : 3;
        if (x === 1 || x === 17) color = r > 2.3 ? 1 : r > 1.25 ? 4 : 5;
        b.set(x, y, z, color);
      }
  b.line([11, 5, 5], [12, 8, 4], 1, 1);
  b.set(12, 9, 4, 4);
  b.line([5, 4, 7], [4, 6, 9], 0);
  b.set(4, 6, 9, 3);
  return b.finish();
}

export function createStump(): VoxelModel {
  const b = new VoxelBuilder(
    'stump',
    'Baumstumpf',
    [13, 10, 13],
    ['#5b4231', '#876041', '#ab8051', '#bb8a52', '#d8ad6d', '#f2ce8f'],
  );
  for (let y = 0; y <= 8; y++)
    for (let x = 2; x <= 10; x++)
      for (let z = 2; z <= 10; z++) {
        const r = Math.hypot(x - 6, z - 6);
        if (r > 3.3) continue;
        const color =
          y === 8 ? (r < 1.2 ? 3 : r < 2.4 ? 5 : 4) : r > 2.3 ? (x < 6 ? 2 : z > 6 ? 0 : 1) : 3;
        b.set(x, y, z, color);
      }
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    for (let step = 1; step <= 5; step++) {
      const height = Math.max(0, Math.floor(3 * (1 - step / 6)));
      b.line(
        [6 + dx! * step, 0, 6 + dz! * step],
        [6 + dx! * step, height, 6 + dz! * step],
        1,
        step < 4 ? 1 : 0,
      );
    }
  b.line([8, 6, 5], [8, 9, 5], 0);
  b.set(8, 9, 5, 2);
  return b.finish();
}
