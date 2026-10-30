import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  ACTION_PROBABILITIES,
  actionProbabilitiesSchema,
} from '../src/core/action-probabilities.js';
import { ACTIONS } from '../src/core/types.js';
import { BIOME_PRESETS } from '../src/core/biomes.js';
import type { ActionProbabilities } from '../src/core/action-probabilities.js';

export class ProbabilityConflict extends Error {}
export const probabilitySaveSchema = z
  .object({
    version: z.literal(1),
    expectedRevision: z.string().regex(/^[a-f\d]{64}$/),
    probabilities: actionProbabilitiesSchema,
  })
  .strict();

function canonical(value: ActionProbabilities) {
  return JSON.stringify({
    version: value.version,
    baseWeights: Object.fromEntries(ACTIONS.map(({ id }) => [id, value.baseWeights[id]])),
    biomeBuffs: Object.fromEntries(
      BIOME_PRESETS.map(({ id }) => [
        id,
        Object.fromEntries(
          ACTIONS.filter((action) => value.biomeBuffs[id][action.id] !== undefined).map(
            (action) => [action.id, value.biomeBuffs[id][action.id]],
          ),
        ),
      ]),
    ),
  });
}
function result(probabilities: ActionProbabilities) {
  return {
    version: 1 as const,
    probabilities,
    revision: createHash('sha256').update(canonical(probabilities)).digest('hex'),
  };
}
export async function readActionProbabilities(root: string) {
  try {
    const value = JSON.parse(
      await readFile(join(root, 'working/settings/action-probabilities.json'), 'utf8'),
    );
    return result(actionProbabilitiesSchema.parse(value));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return result(structuredClone(ACTION_PROBABILITIES));
    throw error;
  }
}
const writes = new Map<string, Promise<unknown>>();
/** Serialize compare-and-save and use an atomic rename; stale tabs cannot overwrite newer edits. */
export async function saveActionProbabilities(root: string, input: unknown) {
  const request = probabilitySaveSchema.parse(input);
  const previous = writes.get(root) ?? Promise.resolve();
  const task = previous
    .catch(() => undefined)
    .then(async () => {
      const current = await readActionProbabilities(root);
      if (current.revision !== request.expectedRevision)
        throw new ProbabilityConflict(
          'Die globale Verteilung wurde inzwischen geändert. Lade sie neu, bevor du speicherst.',
        );
      const directory = join(root, 'working/settings');
      await mkdir(directory, { recursive: true });
      const temporary = join(directory, `.action-probabilities-${randomUUID()}.json`);
      try {
        await writeFile(temporary, `${JSON.stringify(request.probabilities, null, 2)}\n`, {
          flag: 'wx',
        });
        await rename(temporary, join(directory, 'action-probabilities.json'));
      } finally {
        await rm(temporary, { force: true });
      }
      return result(request.probabilities);
    });
  writes.set(root, task);
  try {
    return await task;
  } finally {
    if (writes.get(root) === task) writes.delete(root);
  }
}
