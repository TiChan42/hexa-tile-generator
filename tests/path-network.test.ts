import { describe, expect, it } from 'vitest';
import {
  buildPathNetwork,
  defaultConfig,
  ensurePathTerrainContrast,
  generateTile,
  MIN_PATH_TERRAIN_CONTRAST,
  oklabColorDistance,
  selectBranchAnchors,
} from '../src/core';

describe('seeded branching path network', () => {
  it('chooses stable, distributed field anchors from the available raster', () => {
    const config = structuredClone(defaultConfig);
    config.decoration.enabled = false;
    const tile = generateTile(config),
      candidates = tile.cells.filter(
        (cell) =>
          cell.surfacePolygons.length > 0 && !cell.fieldId && !cell.landscapeOnly && !cell.reserved,
      ),
      first = selectBranchAnchors(config.seed, candidates, 7),
      second = selectBranchAnchors(config.seed, candidates, 7);
    expect(first.map((cell) => cell.id)).toEqual(second.map((cell) => cell.id));
    expect(new Set(first.map((cell) => cell.id)).size).toBe(first.length);
    expect(first).toHaveLength(7);
    expect(
      Math.min(
        ...first.flatMap((cell, index) =>
          first
            .slice(index + 1)
            .map((other) =>
              Math.hypot(cell.center.x - other.center.x, cell.center.y - other.center.y),
            ),
        ),
      ),
    ).toBeGreaterThan(0.06);
  });

  it('connects every site from the center roots and adds only seed-stable loop edges', () => {
    const sites = [
      { id: 'root', point: { x: 0, y: 0 } },
      { id: 'a', point: { x: -0.65, y: 0.45 } },
      { id: 'b', point: { x: -0.05, y: 0.72 } },
      { id: 'c', point: { x: 0.61, y: 0.51 } },
      { id: 'd', point: { x: -0.71, y: -0.4 } },
      { id: 'e', point: { x: 0.03, y: -0.69 } },
      { id: 'f', point: { x: 0.68, y: -0.39 } },
    ];
    const tree = buildPathNetwork('branch-seed', sites, ['root'], false),
      network = buildPathNetwork('branch-seed', sites, ['root'], true),
      visited = new Set(['root']),
      queue = ['root'];
    for (let i = 0; i < queue.length; i++)
      for (const link of tree)
        if (link.from === queue[i] && !visited.has(link.to)) {
          visited.add(link.to);
          queue.push(link.to);
        } else if (link.to === queue[i] && !visited.has(link.from)) {
          visited.add(link.from);
          queue.push(link.from);
        }
    expect(visited).toEqual(new Set(sites.map((site) => site.id)));
    expect(tree).toHaveLength(sites.length - 1);
    expect(tree.every((link) => !link.loop)).toBe(true);
    expect(network).toEqual(buildPathNetwork('branch-seed', sites, ['root'], true));
    expect(network.filter((link) => link.loop).length).toBeGreaterThan(0);
    expect(network.length).toBeGreaterThan(tree.length);
  });
});

describe('generated path color contrast', () => {
  it('keeps generated field colors visibly different from adjacent landscape colors', () => {
    const config = structuredClone(defaultConfig);
    config.decoration.enabled = false;
    config.terrain.gradient = [
      { at: 0, color: '#8a8a8a' },
      { at: 0.5, color: '#8a8a8a' },
      { at: 1, color: '#8a8a8a' },
    ];
    config.paths.gradient = [
      { at: 0, color: '#8a8a8a' },
      { at: 0.5, color: '#8a8a8a' },
      { at: 1, color: '#8a8a8a' },
    ];
    const tile = generateTile(config),
      map = new Map(tile.cells.map((cell) => [cell.id, cell]));
    for (const field of tile.fields.filter((field) => !field.isCenter)) {
      const ids = new Set(field.cellIds),
        landscape = [...new Set(field.cellIds.flatMap((id) => map.get(id)!.neighbors))].filter(
          (id) => !tile.fields.some((candidate) => candidate.cellIds.includes(id)),
        );
      if (!landscape.length) continue;
      for (const id of landscape)
        expect(oklabColorDistance(field.color, map.get(id)!.color)).toBeGreaterThanOrEqual(
          MIN_PATH_TERRAIN_CONTRAST - 1e-5,
        );
      expect(ids.size).toBe(field.cellIds.length);
    }
  });

  it('moves a near-identical gradient color by the smallest stable amount that meets contrast', () => {
    const first = ensurePathTerrainContrast('#8b8b8b', ['#8a8a8a']),
      second = ensurePathTerrainContrast('#8b8b8b', ['#8a8a8a']);
    expect(first).toBe(second);
    expect(oklabColorDistance(first, '#8a8a8a')).toBeGreaterThanOrEqual(
      MIN_PATH_TERRAIN_CONTRAST - 1e-5,
    );
  });

  it('preserves an explicitly saved field color even when it matches the landscape', () => {
    const config = structuredClone(defaultConfig);
    config.decoration.enabled = false;
    const first = generateTile(config),
      fieldId = first.fields.find((field) => !field.isCenter)!.id;
    config.paths.fields = [{ id: fieldId, cellIds: [], action: 'none', color: '#8a8a8a' }];
    const tile = generateTile(config);
    expect(tile.fields.find((field) => field.id === fieldId)!.color).toBe('#8a8a8a');
  });
});
