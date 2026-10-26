import type { VoxelModel } from '../voxels';
import { createAmethyst, createQuartz } from './crystals';
import { createWillow, createMaple } from './trees';
import { createFern, createGrass, createFlowers, createMushrooms, createReeds } from './plants';
import { createLog, createStump } from './wood';

export function createNewAssets(): VoxelModel[] {
  return [
    createAmethyst(),
    createWillow(),
    createMaple(),
    createFern(),
    createGrass(),
    createFlowers(),
    createMushrooms(),
    createReeds(),
    createLog(),
    createStump(),
    createQuartz(),
  ];
}
