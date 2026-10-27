import { describe, expect, it } from 'vitest';
import { boundaryCells, defaultConfig, generateTile, isConnectedSelection } from '../src/core';
import { longestThinChain } from '../src/core/organic-topology';
import type { GeneratedTile } from '../src/core';

const degree = (tile: GeneratedTile, id: string) =>
  tile.connections.filter((edge) => edge.from === id || edge.to === id).length;

function sample(seed: string, legacy = false) {
  const config = structuredClone(defaultConfig);
  config.seed = seed;
  config.decoration.enabled = false;
  if (legacy) config.layoutVersion = 14;
  return generateTile(config);
}

describe('smaller fields and sparse path contacts', () => {
  it('keeps actual geometric contacts mostly at two, with occasional three and rare four', () => {
    const counts = [0, 0, 0, 0, 0];
    for (let index = 0; index < 8; index++) {
      const tile = sample(`sparse-v15-${index}`);
      expect(tile.fields).toHaveLength(13);
      expect(tile.warnings).toEqual([]);
      expect(tile.stats.connected).toBe(true);
      const cells = new Map(tile.cells.map((cell) => [cell.id, cell]));
      for (const field of tile.fields.filter((field) => !field.isCenter)) {
        const neighbors = degree(tile, field.id);
        expect(neighbors).toBeGreaterThanOrEqual(2);
        expect(neighbors).toBeLessThanOrEqual(4);
        counts[neighbors]!++;
        expect(isConnectedSelection(field.cellIds, tile.cells)).toBe(true);
        expect(field.area).toBeGreaterThanOrEqual(1 / 16 - 1e-10);
        expect(longestThinChain(new Set(field.cellIds), cells, 'hex')).toBeLessThanOrEqual(2);
      }
    }
    expect(counts[2]).toBeGreaterThan(counts[3]! * 2);
    expect(counts[3]).toBeGreaterThan(0);
    expect(counts[4]).toBeLessThanOrEqual(1);
    const junction = sample('sparse-v15-34');
    expect(
      junction.fields.filter((field) => !field.isCenter && degree(junction, field.id) === 4),
    ).toHaveLength(1);
    expect(
      junction.fields.every((field) => field.isCenter || degree(junction, field.id) <= 4),
    ).toBe(true);
  });

  it('uses less ground than V14 and preserves all six fixed centered mouths while varying interiors', () => {
    const shapes = Array.from({ length: 6 }, () => new Set<string>());
    let area = 0,
      previousArea = 0;
    const reference = sample('sparse-v15-0');
    for (let index = 0; index < 4; index++) {
      const seed = `sparse-v15-${index}`;
      const tile = sample(seed),
        previous = sample(seed, true);
      area += tile.fields
        .filter((field) => !field.isCenter)
        .reduce((sum, field) => sum + field.area, 0);
      previousArea += previous.fields
        .filter((field) => !field.isCenter)
        .reduce((sum, field) => sum + field.area, 0);
      for (const entrance of tile.entrances) {
        const field = tile.fields.find((field) => field.id === entrance.fieldId)!;
        expect(entrance.cellIds).toEqual(reference.entrances[entrance.side]!.cellIds);
        expect(entrance.cellIds.every((id) => field.cellIds.includes(id))).toBe(true);
        const outer = boundaryCells(tile.cells, entrance.side).filter((cell) => cell.fieldId);
        expect(new Set(outer.map((cell) => cell.fieldId))).toEqual(new Set([field.id]));
        expect(outer.map((cell) => cell.id).sort()).toEqual([...entrance.cellIds].sort());
        shapes[entrance.side]!.add([...field.cellIds].sort().join('|'));
      }
    }
    expect(area).toBeLessThan(previousArea * 0.8);
    expect(shapes.every((variants) => variants.size > 1)).toBe(true);
  });
});
