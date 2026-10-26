import type { VoxelModel } from '../voxels';
import { VoxelBuilder } from './builder';

export function createWillow(): VoxelModel {
  const b = new VoxelBuilder(
    'willow',
    'Weide',
    [19, 26, 19],
    ['#60462f', '#8a6640', '#345b43', '#547c4f', '#78955d', '#a5b976'],
  );
  b.line([9, 0, 9], [10, 19, 9], 0, 1);
  for (const end of [
    [4, 18, 8],
    [14, 18, 9],
    [8, 19, 4],
    [10, 18, 14],
  ] as const)
    b.line([10, 12, 9], end, 1);
  for (const end of [
    [4, 0, 9],
    [14, 0, 10],
    [9, 0, 4],
    [9, 0, 14],
  ] as const)
    b.line([9, 1, 9], end, 0);
  const roof = (x: number, z: number): number | undefined => {
    const r = ((x - 9) / 8.2) ** 2 + ((z - 9) / 8) ** 2;
    return r <= 1 ? 18 + Math.round(3 * Math.sqrt(1 - r)) : undefined;
  };
  for (let x = 0; x < 19; x++)
    for (let z = 0; z < 19; z++) {
      const top = roof(x, z);
      if (top === undefined) continue;
      for (let y = top - 2; y <= top; y++) b.set(x, y, z, y === top && x < 10 ? 5 : z < 8 ? 4 : 3);
    }
  for (const [x, z, bottom, leanX, leanZ] of [
    [3, 8, 8, -1, 0],
    [5, 3, 10, -1, -1],
    [9, 2, 7, 0, -1],
    [14, 4, 9, 1, -1],
    [16, 9, 7, 1, 0],
    [13, 15, 9, 1, 1],
    [8, 16, 8, 0, 1],
    [3, 13, 10, -1, 1],
  ]) {
    const top = roof(x!, z!);
    if (top === undefined) continue;
    b.line([x!, top, z!], [x! + leanX!, bottom!, z! + leanZ!], z! < 9 ? 4 : 2);
    b.line([x! + 1, top - 1, z!], [x! + leanX! + 1, bottom! + 2, z! + leanZ!], 3);
  }
  return b.finish();
}

export function createMaple(): VoxelModel {
  const b = new VoxelBuilder(
    'maple',
    'Herbstahorn',
    [17, 21, 17],
    ['#654630', '#946541', '#8c3d2f', '#bc5b32', '#dc8c3e', '#e8b655', '#f0d47b'],
  );
  b.line([8, 0, 8], [8, 15, 8], 0, 1);
  for (const end of [
    [3, 12, 8],
    [13, 13, 9],
    [8, 15, 3],
    [7, 13, 13],
  ] as const)
    b.line([8, 7, 8], end, 1);
  for (const end of [
    [4, 0, 8],
    [12, 0, 9],
    [8, 0, 4],
    [8, 0, 12],
  ] as const)
    b.line([8, 1, 8], end, 0);
  const color = (x: number, y: number, z: number): number =>
    y >= 17 ? 6 : y >= 15 && z < 9 ? 5 : x < 5 ? 2 : x > 10 ? 4 : 3;
  b.ellipsoid([8, 15, 8], [6.4, 4.7, 6.3], color);
  b.ellipsoid([4, 13, 8], [4.2, 3.7, 4], color);
  b.ellipsoid([12, 14, 9], [4.1, 3.8, 4.1], color);
  b.ellipsoid([8, 16, 4], [4, 3.8, 3.9], color);
  return b.finish();
}
