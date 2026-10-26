import { createHash } from 'node:crypto';
import { z } from 'zod';

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const dimension = z.number().int().min(1).max(64);
const modelInput = z
  .object({
    id: z.string().min(1).max(80).optional(),
    scale: z.number().positive().max(1).optional(),
    pivot: z
      .tuple([z.number().min(0).max(64), z.number().min(0).max(64), z.number().min(0).max(64)])
      .optional(),
    footprint: z.literal(1).optional(),
    builtin: z.boolean().optional(),
    name: z.string().trim().min(1).max(80),
    size: z.tuple([dimension, dimension, dimension]),
    palette: z.array(color).min(1).max(64),
    voxels: z
      .array(
        z.tuple([
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
        ]),
      )
      .min(1)
      .max(16_384),
  })
  .strict()
  .superRefine((model, context) => {
    const occupied = new Set<string>();
    for (const [index, voxel] of model.voxels.entries()) {
      if (
        voxel[0] >= model.size[0] ||
        voxel[1] >= model.size[1] ||
        voxel[2] >= model.size[2] ||
        voxel[3] >= model.palette.length
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Voxel liegt außerhalb der Modellgrenzen oder Palette.',
          path: ['voxels', index],
        });
      }
      const key = voxel.slice(0, 3).join(',');
      if (occupied.has(key))
        context.addIssue({
          code: 'custom',
          message: 'Doppelte Voxelposition.',
          path: ['voxels', index],
        });
      occupied.add(key);
    }
  });

export type VoxelModelInput = z.infer<typeof modelInput>;
export interface StoredVoxelModel {
  id: string;
  name: string;
  size: [number, number, number];
  palette: string[];
  voxels: [number, number, number, number][];
  scale: number;
  pivot: [number, number, number];
  footprint: 1;
  builtin: boolean;
}

export function normalizeModel(value: unknown, builtin = false): StoredVoxelModel {
  const input = modelInput.parse(value);
  const payload = {
    name: input.name,
    size: input.size,
    palette: input.palette.map((entry) => entry.toLowerCase()),
    voxels: [...input.voxels].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]),
  };
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  const minX = Math.min(...input.voxels.map((voxel) => voxel[0]));
  const minY = Math.min(...input.voxels.map((voxel) => voxel[1]));
  const minZ = Math.min(...input.voxels.map((voxel) => voxel[2]));
  const maxX = Math.max(...input.voxels.map((voxel) => voxel[0]));
  const maxZ = Math.max(...input.voxels.map((voxel) => voxel[2]));
  return {
    id: builtin && input.id && /^[a-zA-Z0-9-]+$/.test(input.id) ? input.id : `model-${digest}`,
    ...payload,
    scale: 1 / Math.max(maxX - minX + 1, maxZ - minZ + 1),
    pivot: [(minX + maxX + 1) / 2, minY, (minZ + maxZ + 1) / 2],
    footprint: 1,
    builtin,
  };
}

export function readStoredModel(value: unknown, builtin: boolean): StoredVoxelModel {
  const input = z
    .object({
      id: z.string(),
      name: z.string(),
      size: z.unknown(),
      palette: z.unknown(),
      voxels: z.unknown(),
    })
    .passthrough()
    .parse(value);
  return normalizeModel(
    {
      id: input.id,
      name: input.name,
      size: input.size,
      palette: input.palette,
      voxels: input.voxels,
    },
    builtin,
  );
}
