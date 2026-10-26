import * as THREE from 'three';
import type { DecorationKind } from '../core/types';
import type { DecorationColorVariant } from '../core/object-colors';
import { DECORATION_KINDS } from '../core/objects';
import { createNewAssets } from './assets';

export interface VoxelModel {
  id: string;
  name: string;
  size: [number, number, number];
  palette: string[];
  voxels: [number, number, number, number][];
  /** Semantic color slots are assigned only to built-in models; custom model colors stay intact. */
  paletteRoles?: VoxelPaletteRole[];
}

export type VoxelPaletteRole =
  | 'neutral'
  | 'trunk'
  | 'foliage'
  | 'mushroom-cap-shadow'
  | 'mushroom-cap-main'
  | 'mushroom-cap-light';

export interface NormalizedVoxelModel extends VoxelModel {
  scale: number;
  pivot: [number, number, number];
  footprint: 1;
}

/** Normalize horizontal footprint, preserving height and resting on the ground. */
export function normalizeVoxelModel(model: VoxelModel): NormalizedVoxelModel {
  const minX = Math.min(...model.voxels.map((voxel) => voxel[0]));
  const minY = Math.min(...model.voxels.map((voxel) => voxel[1]));
  const minZ = Math.min(...model.voxels.map((voxel) => voxel[2]));
  const maxX = Math.max(...model.voxels.map((voxel) => voxel[0]));
  const maxZ = Math.max(...model.voxels.map((voxel) => voxel[2]));
  return {
    ...model,
    scale: 1 / Math.max(maxX - minX + 1, maxZ - minZ + 1),
    pivot: [(minX + maxX + 1) / 2, minY, (minZ + maxZ + 1) / 2],
    footprint: 1,
  };
}

function createModel(
  id: string,
  name: string,
  size: VoxelModel['size'],
  palette: string[],
  predicate: (x: number, y: number, z: number) => number,
): VoxelModel {
  const voxels: VoxelModel['voxels'] = [];
  for (let x = 0; x < size[0]; x++) {
    for (let y = 0; y < size[1]; y++) {
      for (let z = 0; z < size[2]; z++) {
        const color = predicate(x, y, z);
        if (color >= 0) voxels.push([x, y, z, color]);
      }
    }
  }
  return { id, name, size, palette, voxels };
}

function pine(): VoxelModel {
  return createModel(
    'pine',
    'Fichte',
    [7, 13, 7],
    ['#654a34', '#234b3a', '#376447', '#557b52'],
    (x, y, z) => {
      if (y < 4) return x === 3 && z === 3 ? 0 : -1;
      const radius = y < 7 ? 3 : y < 10 ? 2 : y < 12 ? 1 : 0;
      const d = Math.abs(x - 3) + Math.abs(z - 3);
      return d <= radius + (y % 3 === 0 ? 0 : 1) &&
        Math.max(Math.abs(x - 3), Math.abs(z - 3)) <= radius
        ? 1 + ((x + y + z) % 3)
        : -1;
    },
  );
}

const LEGACY_ASSETS: VoxelModel[] = [
  createModel(
    'tree',
    'Kiefer',
    [9, 14, 9],
    ['#825b3c', '#3c5939', '#637946', '#8c995e'],
    (x, y, z) => {
      if (y < 9) {
        const trunk = x === 4 && z === 4;
        const branches =
          (y === 7 && z === 4 && Math.abs(x - 4) <= 2) ||
          (y === 8 && x === 4 && Math.abs(z - 4) <= 2);
        return trunk || branches ? 0 : -1;
      }
      const dx = (x - 4) / 4.7,
        dz = (z - 4) / 4.5,
        dy = (y - 10.5) / 3.2;
      return dx * dx + dz * dz + dy * dy < 1 && (x + y * 3 + z * 2) % 11 !== 0
        ? 1 + ((x + y + z) % 3)
        : -1;
    },
  ),
  pine(),
  createModel(
    'oak',
    'Eiche',
    [9, 11, 9],
    ['#68492f', '#355337', '#557342', '#788949'],
    (x, y, z) => {
      if (y < 5) return Math.abs(x - 4) + Math.abs(z - 4) <= (y < 3 ? 0 : 1) ? 0 : -1;
      const dx = (x - 4) / 4.7,
        dz = (z - 4) / 4.5,
        dy = (y - 7) / 3.5;
      return dx * dx + dz * dz + dy * dy < 1.08 && (x + 3 * y + z) % 13 !== 0
        ? 1 + ((2 * x + y + z) % 3)
        : -1;
    },
  ),
  createModel(
    'birch',
    'Birke',
    [7, 15, 7],
    ['#d8d5bb', '#49493e', '#71884a', '#9eac63', '#c0c785'],
    (x, y, z) => {
      if (y < 7) return x === 3 && z === 3 ? (y % 4 === 0 ? 1 : 0) : -1;
      const dx = (x - 3) / 3.4,
        dz = (z - 3) / 3.1,
        dy = (y - 10) / 4.7;
      return dx * dx + dz * dz + dy * dy < 1 && (x + 2 * z + y) % 9 !== 0
        ? 2 + ((x + y + z) % 3)
        : -1;
    },
  ),
  createModel('deadTree', 'Totholz', [7, 12, 7], ['#615143', '#8b7761', '#a08c70'], (x, y, z) => {
    const trunk = x === 3 && z === 3 && y < 10;
    const left = y >= 4 && y <= 7 && x === 7 - y && z === 3;
    const right = y >= 6 && y <= 9 && x === y - 3 && z === 3;
    const back = y >= 7 && y <= 10 && x === 3 && z === y - 5;
    return trunk || left || right || back ? (x + y + z) % 3 : -1;
  }),
  createModel('bush', 'Busch', [7, 5, 6], ['#385e40', '#507345', '#729054'], (x, y, z) => {
    const dx = (x - 3) / 3.5,
      dz = (z - 2.5) / 3;
    return dx * dx + dz * dz + (y / 5) ** 2 < 1.05 ? (x + 2 * y + z) % 3 : -1;
  }),
  createModel('rock', 'Fels', [6, 4, 5], ['#7a8176', '#989b88', '#b0ad98'], (x, y, z) => {
    const dx = (x - 2.5) / 3,
      dz = (z - 2) / 2.5;
    return dx * dx + dz * dz + (y / 4) ** 2 < 1.1 ? (x + y + z) % 3 : -1;
  }),
];

const modelsById = new Map(
  [...LEGACY_ASSETS, ...createNewAssets()].map((model) => [model.id, model]),
);
const paletteRoles: Partial<Record<DecorationKind, VoxelPaletteRole[]>> = {
  tree: ['trunk', 'foliage', 'foliage', 'foliage'],
  pine: ['trunk', 'foliage', 'foliage', 'foliage'],
  oak: ['trunk', 'foliage', 'foliage', 'foliage'],
  birch: ['trunk', 'trunk', 'foliage', 'foliage', 'foliage'],
  willow: ['trunk', 'trunk', 'foliage', 'foliage', 'foliage', 'foliage'],
  maple: ['trunk', 'trunk', 'foliage', 'foliage', 'foliage', 'foliage', 'foliage'],
  mushrooms: [
    'neutral',
    'neutral',
    'mushroom-cap-shadow',
    'neutral',
    'mushroom-cap-main',
    'mushroom-cap-light',
  ],
};
export const ASSET_LIBRARY: VoxelModel[] = DECORATION_KINDS.map((kind) => {
  const model = modelsById.get(kind);
  if (!model) throw new Error(`Kein Voxelmodell für ${kind}.`);
  const roles = paletteRoles[kind];
  return roles ? { ...model, paletteRoles: [...roles] } : model;
});

/** Resolve a semantic palette without changing the source model or its stable content ID. */
export function voxelPalette(
  input: VoxelModel,
  variant: DecorationColorVariant | null = null,
): string[] {
  const palette = [...input.palette];
  const roles = input.paletteRoles;
  if (!roles || !variant) return palette;
  const foliageSlots = roles.flatMap((role, index) => (role === 'foliage' ? [index] : []));
  foliageSlots.forEach((paletteIndex, index) => {
    if (!variant.foliage?.length) return;
    const sourceIndex = Math.round(
      (index / Math.max(1, foliageSlots.length - 1)) * (variant.foliage.length - 1),
    );
    palette[paletteIndex] = variant.foliage[sourceIndex]!;
  });
  const capColors = variant.mushroomCap;
  if (capColors)
    roles.forEach((role, index) => {
      if (role === 'mushroom-cap-shadow') palette[index] = capColors[0];
      if (role === 'mushroom-cap-main') palette[index] = capColors[1];
      if (role === 'mushroom-cap-light') palette[index] = capColors[2];
    });
  return palette;
}

/** Face-culling keeps the library compact without changing its voxel silhouette. */
export function voxelGeometry(
  input: VoxelModel,
  variant: DecorationColorVariant | null = null,
): THREE.BufferGeometry {
  const model = normalizeVoxelModel(input);
  const palette = voxelPalette(model, variant);
  const occupied = new Set(model.voxels.map(([x, y, z]) => `${x},${y},${z}`));
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [];
  const faces = [
    {
      n: [1, 0, 0],
      corners: [
        [1, 0, 0],
        [1, 1, 0],
        [1, 1, 1],
        [1, 0, 1],
      ],
    },
    {
      n: [-1, 0, 0],
      corners: [
        [0, 0, 1],
        [0, 1, 1],
        [0, 1, 0],
        [0, 0, 0],
      ],
    },
    {
      n: [0, 1, 0],
      corners: [
        [0, 1, 0],
        [0, 1, 1],
        [1, 1, 1],
        [1, 1, 0],
      ],
    },
    {
      n: [0, -1, 0],
      corners: [
        [0, 0, 1],
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
      ],
    },
    {
      n: [0, 0, 1],
      corners: [
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1],
        [0, 0, 1],
      ],
    },
    {
      n: [0, 0, -1],
      corners: [
        [0, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
        [1, 0, 0],
      ],
    },
  ];
  model.voxels.forEach(([x, y, z, index]) => {
    const color = new THREE.Color(palette[index] ?? model.palette[index]);
    faces.forEach((face) => {
      const [nx = 0, ny = 0, nz = 0] = face.n;
      if (occupied.has(`${x + nx},${y + ny},${z + nz}`)) return;
      [0, 1, 2, 0, 2, 3].forEach((i) => {
        const corner = face.corners[i];
        if (!corner) return;
        positions.push(
          (x + (corner[0] ?? 0) - model.pivot[0]) * model.scale,
          (y + (corner[1] ?? 0) - model.pivot[1]) * model.scale,
          (z + (corner[2] ?? 0) - model.pivot[2]) * model.scale,
        );
        normals.push(nx, ny, nz);
        colors.push(color.r, color.g, color.b);
      });
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Configuration wins over any transient registerModel hint, including after undo/import. */
export function syncModelSlots(
  slots: Map<DecorationKind, string>,
  configured?: Partial<Record<DecorationKind, string>>,
): void {
  slots.clear();
  for (const kind of DECORATION_KINDS) {
    const id = configured?.[kind];
    if (id) slots.set(kind, id);
  }
}
