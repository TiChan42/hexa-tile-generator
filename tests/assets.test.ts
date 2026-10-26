import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DECORATION_KINDS } from '../src/core/objects';
import {
  ASSET_LIBRARY,
  normalizeVoxelModel,
  syncModelSlots,
  voxelGeometry,
  type VoxelModel,
} from '../src/render/voxels';
import { createNewAssets } from '../src/render/assets';

function components(voxels: VoxelModel['voxels']): VoxelModel['voxels'][] {
  const map = new Map(voxels.map((voxel) => [voxel.slice(0, 3).join(','), voxel])),
    remaining = new Set(map.keys()),
    result: VoxelModel['voxels'][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value!;
    remaining.delete(first);
    const queue = [map.get(first)!];
    for (let i = 0; i < queue.length; i++) {
      const [x, y, z] = queue[i]!;
      for (const [dx, dy, dz] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ]) {
        const key = [x + dx!, y + dy!, z + dz!].join(',');
        if (remaining.delete(key)) queue.push(map.get(key)!);
      }
    }
    result.push(queue);
  }
  return result;
}
const legacyHashes: Record<string, string> = {
  tree: '6f710d117d9a27e43d94867a925ce37dc4113c5eb23c8dd36fdfdb5e833183c7',
  pine: '14ae0154c50d7b53c34dd1c53d821fdfaa74fef960005b88309df3d2f2cff99e',
  oak: '9fe01e48149f9ad0127f7fd316b086448ea3c147365547f78468b982dcfe80e5',
  birch: '5b66461252fb18e4ef0f7327a4512bd2251f52ee2150865def599bc90adf0a2c',
  deadTree: '409b3025dc216c0e437dce5ca5b6234e15fc9a41d94b013d34db01115a022524',
  bush: 'bcd0f2836fa6f2d8cd59b9c767c7c84e193c5207ef5ae2899600e29d0efac4f0',
  rock: 'da6729751dcd36730a79b39bb4f91c87ad85fe3d2d77c896f2419d9d90715a8c',
};

describe('catalogued code-native voxel assets', () => {
  it('matches every central catalog identity exactly once, including all new model slots', () => {
    expect(ASSET_LIBRARY.map((model) => model.id)).toEqual([...DECORATION_KINDS]);
    expect(new Set(ASSET_LIBRARY.map((model) => model.id)).size).toBe(18);
    const slots = new Map();
    syncModelSlots(slots, {
      willow: 'custom-willow',
      quartz: 'custom-quartz',
      crystal: 'custom-amethyst',
    });
    expect([...slots]).toEqual([
      ['crystal', 'custom-amethyst'],
      ['willow', 'custom-willow'],
      ['quartz', 'custom-quartz'],
    ]);
  });
  it('rebuilds the new models deterministically without shared mutable model arrays', () => {
    const first = createNewAssets(),
      second = createNewAssets();
    expect(first).toEqual(second);
    expect(first[0]!.voxels).not.toBe(second[0]!.voxels);
    expect(first[0]!.palette).not.toBe(second[0]!.palette);
  });
  it.each(ASSET_LIBRARY)(
    '$id is bounded, uses a valid palette and matches its editable public JSON',
    async (model) => {
      expect(model.voxels.length).toBeGreaterThan(0);
      expect(model.voxels.length).toBeLessThanOrEqual(16384);
      expect(
        model.size.every(
          (dimension) => Number.isInteger(dimension) && dimension > 0 && dimension <= 64,
        ),
      ).toBe(true);
      expect(model.palette.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true);
      const occupied = new Set<string>();
      for (const [x, y, z, color] of model.voxels) {
        expect([x, y, z, color].every(Number.isInteger)).toBe(true);
        expect(
          x >= 0 && y >= 0 && z >= 0 && x < model.size[0] && y < model.size[1] && z < model.size[2],
        ).toBe(true);
        expect(color >= 0 && color < model.palette.length).toBe(true);
        const key = [x, y, z].join(',');
        expect(occupied.has(key)).toBe(false);
        occupied.add(key);
      }
      const saved = JSON.parse(
        await readFile(new URL(`../public/models/${model.id}.json`, import.meta.url), 'utf8'),
      ) as unknown;
      expect(saved).toEqual(model);
    },
  );
  it.each(createNewAssets())(
    '$id has one face-connected grounded component and a unit occupied footprint',
    (model) => {
      expect(components(model.voxels)).toHaveLength(1);
      const normalized = normalizeVoxelModel(model),
        geometry = voxelGeometry(model);
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!,
        size = bounds.getSize(new THREE.Vector3());
      expect(bounds.min.y).toBe(0);
      expect(Math.max(size.x, size.z)).toBeCloseTo(1, 6);
      expect(bounds.min.x + bounds.max.x).toBeCloseTo(0, 6);
      expect(bounds.min.z + bounds.max.z).toBeCloseTo(0, 6);
      expect(size.y).toBeCloseTo(
        (Math.max(...model.voxels.map((voxel) => voxel[1])) - normalized.pivot[1] + 1) *
          normalized.scale,
        6,
      );
      expect(geometry.getAttribute('position').count).toBeLessThan(model.voxels.length * 36 * 0.8);
      expect([...geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true);
      geometry.dispose();
    },
  );
  it('retains all seven unaffected legacy models voxel for voxel and palette for palette', () => {
    for (const [id, digest] of Object.entries(legacyHashes)) {
      const model = ASSET_LIBRARY.find((model) => model.id === id)!;
      expect(createHash('sha256').update(JSON.stringify(model)).digest('hex')).toBe(digest);
    }
  });
});

describe('faceted crystal groups', () => {
  it.each(['crystal', 'quartz'])(
    '%s has multiple separate slender pointed shafts on a connected rock base',
    (id) => {
      const model = ASSET_LIBRARY.find((model) => model.id === id)!;
      const shafts = components(model.voxels.filter((voxel) => voxel[1] >= 4));
      expect(shafts.length).toBeGreaterThanOrEqual(4);
      const tops = shafts.map((shaft) => Math.max(...shaft.map((voxel) => voxel[1])));
      expect(new Set(tops).size).toBeGreaterThanOrEqual(4);
      expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThanOrEqual(10);
      for (const shaft of shafts) {
        const top = Math.max(...shaft.map((voxel) => voxel[1]));
        expect(shaft.filter((voxel) => voxel[1] === top)).toHaveLength(1);
        const width = Math.max(
          Math.max(...shaft.map((v) => v[0])) - Math.min(...shaft.map((v) => v[0])) + 1,
          Math.max(...shaft.map((v) => v[2])) - Math.min(...shaft.map((v) => v[2])) + 1,
        );
        expect(top - 3).toBeGreaterThanOrEqual(width * 1.5);
      }
      expect(model.voxels.filter((voxel) => voxel[3] === 8).length).toBeLessThanOrEqual(6);
    },
  );
  it('uses independent amethyst and quartz arrangements rather than recoloring one mesh', () => {
    const amethyst = ASSET_LIBRARY.find((model) => model.id === 'crystal')!,
      quartz = ASSET_LIBRARY.find((model) => model.id === 'quartz')!;
    expect(amethyst.voxels.map((voxel) => voxel.slice(0, 3))).not.toEqual(
      quartz.voxels.map((voxel) => voxel.slice(0, 3)),
    );
    expect(amethyst.palette).not.toEqual(quartz.palette);
    expect(amethyst.palette[3]).toBe('#2d1b46');
  });
});
