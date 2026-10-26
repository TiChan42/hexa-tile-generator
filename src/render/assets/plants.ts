import type { VoxelModel } from '../voxels';
import { VoxelBuilder } from './builder';

export function createFern(): VoxelModel {
  const b = new VoxelBuilder(
    'fern',
    'Farn',
    [17, 10, 17],
    ['#4d4931', '#375944', '#5b844d', '#8ead64'],
  );
  b.ellipsoid([8, 0, 8], [3, 0.6, 3], 0);
  b.line([8, 0, 8], [8, 5, 8], 1);
  for (const [dx, dz, extent] of [
    [1, 0, 7],
    [-1, 0, 7],
    [0, 1, 7],
    [0, -1, 7],
    [1, 1, 5],
    [1, -1, 5],
    [-1, 1, 5],
    [-1, -1, 5],
  ]) {
    let previous: [number, number, number] = [8, 2, 8];
    for (let step = 1; step <= extent!; step++) {
      const x = 8 + dx! * step,
        z = 8 + dz! * step,
        y = Math.round(2 + 5 * Math.sin((Math.PI * step) / (extent! + 2)));
      b.line(previous, [x, y, z], 1);
      previous = [x, y, z];
      if (step < 2 || step >= extent!) continue;
      const leafLength = Math.max(1, Math.round(3 * (1 - step / (extent! + 1))));
      for (const side of [-1, 1])
        b.line(
          [x, y, z],
          [x - dz! * leafLength * side, y - 1, z + dx! * leafLength * side],
          step < extent! - 2 ? 2 : 3,
        );
    }
  }
  b.line([8, 4, 8], [8, 8, 8], 2);
  b.line([8, 8, 8], [9, 8, 8], 3);
  b.line([9, 8, 8], [9, 7, 8], 3);
  return b.finish();
}

export function createGrass(): VoxelModel {
  const b = new VoxelBuilder(
    'grass',
    'Grasbüschel',
    [11, 12, 11],
    ['#55563b', '#456440', '#739148', '#a7af65'],
  );
  b.ellipsoid([5, 0, 5], [3.6, 0.6, 3.3], 0);
  for (const [x, z, height, lx, lz] of [
    [5, 5, 11, 1, 0],
    [4, 5, 9, -3, 0],
    [6, 5, 8, 3, 1],
    [5, 4, 10, 0, -3],
    [5, 6, 7, 1, 3],
    [4, 4, 6, -2, -2],
    [6, 6, 9, 2, 2],
  ]) {
    let previous: [number, number, number] = [x!, 0, z!];
    for (let y = 1; y <= height!; y++) {
      const t = (y / height!) ** 2,
        point: [number, number, number] = [x! + Math.round(lx! * t), y, z! + Math.round(lz! * t)];
      b.line(previous, point, y > height! - 3 ? 3 : y > 3 ? 2 : 1);
      previous = point;
    }
  }
  return b.finish();
}

export function createFlowers(): VoxelModel {
  const b = new VoxelBuilder(
    'flowers',
    'Wildblumen',
    [15, 15, 13],
    ['#4d5135', '#41663f', '#81a059', '#f1e4bd', '#dfad38', '#9a729e', '#ce8e8e', '#8c5c2b'],
  );
  b.ellipsoid([7, 0, 6], [5.8, 0.6, 4.5], 0);
  for (const [x, z, height, petal] of [
    [4, 5, 11, 3],
    [10, 7, 8, 6],
    [7, 4, 13, 5],
  ]) {
    b.line([x!, 0, z!], [x!, height!, z!], 1);
    for (const [y, side] of [
      [3, -1],
      [6, 1],
    ])
      if (y! < height!) {
        b.line([x!, y!, z!], [x! + 2 * side!, y!, z! + 1], 2);
        b.ellipsoid([x! + 2 * side!, y!, z! + 1], [1.3, 0.6, 1], 2);
      }
    b.set(x!, height!, z!, 4);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      b.set(x! + dx!, height!, z! + dz!, petal!);
      b.set(x! + 2 * dx!, height!, z! + 2 * dz!, petal!);
      b.set(x! + dx! + dz!, height!, z! + dz! - dx!, petal!);
    }
    b.set(x!, height! + 1, z!, 7);
  }
  return b.finish();
}

export function createMushrooms(): VoxelModel {
  const b = new VoxelBuilder(
    'mushrooms',
    'Pilzgruppe',
    [16, 12, 14],
    ['#554c3e', '#bfb094', '#e8d8b4', '#874634', '#bc5945', '#df9b68'],
  );
  b.ellipsoid([7.5, 0, 7], [6.3, 0.6, 5], 0);
  for (const [x, z, stem, radius] of [
    [5, 7, 6, 4.2],
    [11, 6, 4, 2.6],
    [10, 10, 2, 1.6],
  ]) {
    b.line([x!, 0, z!], [x!, stem!, z!], 1, stem! > 4 ? 1 : 0);
    const capTop = stem! + Math.ceil(radius! * 0.8);
    for (let y = stem!; y <= capTop; y++) {
      const t = (y - stem!) / Math.max(1, capTop - stem!),
        r = radius! * Math.sqrt(Math.max(0.04, 1 - t * t));
      for (let px = Math.ceil(x! - r); px <= Math.floor(x! + r); px++)
        for (let pz = Math.ceil(z! - r); pz <= Math.floor(z! + r); pz++)
          if ((px - x!) ** 2 + (pz - z!) ** 2 <= r * r)
            b.set(px, y, pz, y === stem! ? 2 : px < x! && pz < z! ? 5 : 4);
    }
    for (const [dx, dz] of [
      [-1, -1],
      [2, 0],
      [-2, 1],
    ])
      if (dx! * dx! + dz! * dz! < radius! * radius! * 0.65) {
        for (let y = capTop; y >= stem!; y--)
          if (b.has(x! + dx!, y, z! + dz!)) {
            b.set(x! + dx!, y, z! + dz!, 2);
            break;
          }
      }
  }
  return b.finish();
}

export function createReeds(): VoxelModel {
  const b = new VoxelBuilder(
    'reeds',
    'Schilf',
    [13, 18, 13],
    ['#4b5241', '#3a5949', '#6c8956', '#acb16b', '#6c4d37', '#b08756'],
  );
  b.ellipsoid([6, 0, 6], [4.8, 0.6, 3.9], 0);
  for (const [x, z, height] of [
    [4, 5, 17],
    [8, 7, 14],
    [6, 4, 16],
    [5, 8, 12],
  ]) {
    b.line([x!, 0, z!], [x!, height!, z!], 1);
    for (let y = height! - 4; y < height!; y++) {
      b.set(x!, y, z!, 4);
      b.set(x! + 1, y, z!, y > height! - 3 ? 5 : 4);
    }
    b.line([x!, 2, z!], [x! - 3, 8, z! + 1], 2);
    b.line([x! - 3, 8, z! + 1], [x! - 4, 5, z! + 2], 3);
    b.line([x!, 3, z!], [x! + 3, 7, z! - 2], 2);
  }
  return b.finish();
}
