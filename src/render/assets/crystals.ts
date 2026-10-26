import type { VoxelModel } from '../voxels';
import { VoxelBuilder } from './builder';

interface Prism {
  x: number;
  z: number;
  top: number;
  radius: number;
  leanX: number;
  leanZ: number;
}

function prism(builder: VoxelBuilder, shape: Prism): void {
  const bottom = 1,
    tipLength = Math.max(3, Math.round(shape.radius * 2));
  for (let y = bottom; y <= shape.top; y++) {
    const shaftProgress = Math.min(1, (y - bottom) / Math.max(1, shape.top - tipLength - bottom));
    const cx = shape.x + Math.round(shape.leanX * shaftProgress),
      cz = shape.z + Math.round(shape.leanZ * shaftProgress);
    const tip = Math.max(0, (y - (shape.top - tipLength)) / tipLength);
    const radius = Math.max(0.25, shape.radius * (1 - tip));
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++)
      for (let z = Math.floor(cz - radius); z <= Math.ceil(cz + radius); z++) {
        const dx = x - cx,
          dz = z - cz;
        if (
          Math.max(Math.abs(dx), Math.abs(dz)) > radius ||
          Math.abs(dx) + Math.abs(dz) > radius * 1.5
        )
          continue;
        // Large continuous face regions, independent of height: never a checkerboard.
        let facet = dx < 0 && dz <= 0 ? 6 : dz < 0 ? 5 : dx > 0 ? 3 : 4;
        if (dx < 0 && Math.abs(dx) >= Math.abs(dz)) facet = 7;
        if (tip > 0) facet = Math.min(7, facet + 1);
        if (y === shape.top) facet = 8;
        builder.set(x, y, z, facet);
      }
  }
}
function base(builder: VoxelBuilder, cx: number, cz: number, rx: number, rz: number): void {
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < builder.size[0]; x++)
      for (let z = 0; z < builder.size[2]; z++) {
        const dx = (x - cx) / rx,
          dz = (z - cz) / rz;
        if (dx * dx + dz * dz > 1 - y * 0.09 || Math.abs(dx) + Math.abs(dz) > 1.36 - y * 0.035)
          continue;
        builder.set(x, y, z, y === 0 ? 0 : x < cx && z < cz ? 2 : 1);
      }
}

export function createAmethyst(): VoxelModel {
  const builder = new VoxelBuilder(
    'crystal',
    'Amethystgruppe',
    [19, 28, 17],
    [
      '#34303f',
      '#51465b',
      '#776781',
      '#2d1b46',
      '#4a286d',
      '#6f3f9a',
      '#a06bc4',
      '#d1a0e8',
      '#efd8f6',
    ],
  );
  base(builder, 9, 8, 8.2, 6.7);
  for (const shape of [
    { x: 10, z: 9, top: 27, radius: 2.2, leanX: 0, leanZ: -1 },
    { x: 5, z: 7, top: 18, radius: 1.7, leanX: -1, leanZ: 0 },
    { x: 6, z: 13, top: 14, radius: 1.4, leanX: 0, leanZ: 1 },
    { x: 14, z: 6, top: 21, radius: 1.8, leanX: 1, leanZ: 0 },
    { x: 13, z: 13, top: 10, radius: 1.2, leanX: 0, leanZ: 0 },
  ])
    prism(builder, shape);
  return builder.finish();
}

export function createQuartz(): VoxelModel {
  const builder = new VoxelBuilder(
    'quartz',
    'Bergkristall',
    [18, 23, 19],
    [
      '#4a5860',
      '#77868d',
      '#a4b4b5',
      '#466576',
      '#6c8b9c',
      '#99b5bf',
      '#c1d6d8',
      '#e2edeb',
      '#fff6df',
    ],
  );
  base(builder, 8.5, 9, 7.6, 7.5);
  for (const shape of [
    { x: 5, z: 9, top: 22, radius: 2.1, leanX: -1, leanZ: 0 },
    { x: 12, z: 7, top: 18, radius: 2, leanX: 1, leanZ: -1 },
    { x: 10, z: 14, top: 13, radius: 1.6, leanX: 0, leanZ: 1 },
    { x: 9, z: 3, top: 14, radius: 1.3, leanX: 0, leanZ: 0 },
    { x: 3, z: 13, top: 9, radius: 1.2, leanX: 0, leanZ: 0 },
  ])
    prism(builder, shape);
  return builder.finish();
}
