import { describe, expect, it } from 'vitest';
import {
  boundaryCells,
  buildGrid,
  clipHalfPlane,
  clipPolygon,
  configSchema,
  defaultConfig,
  fbm,
  generateTile,
  hash32,
  hexagon,
  isConnectedSelection,
  parseConfig,
  pentagon,
  perlin,
  pointInPolygon,
  polygonArea,
  randomAt,
  sampleGradient,
  subtractPolygon,
  centroid,
} from '../src/core';
import type { TileConfig } from '../src/core';
const config = (): TileConfig => structuredClone(defaultConfig);

describe('versioned deterministic generator', () => {
  it('reproduces every geometry, field, color, height, action and decoration for the same configuration', () => {
    const a = generateTile(config());
    expect(generateTile(JSON.parse(JSON.stringify(defaultConfig)) as TileConfig)).toEqual(a);
    const changed = config();
    changed.seed = 'another-seed';
    expect(generateTile(changed).cells.map((c) => c.height)).not.toEqual(
      a.cells.map((c) => c.height),
    );
  });
  it('isolates domains so decor edits do not perturb terrain or paths', () => {
    const a = generateTile(config()),
      changed = config();
    changed.decoration.density = 0.9;
    const b = generateTile(changed);
    expect(b.cells).toEqual(a.cells);
    expect(b.fields).toEqual(a.fields);
    expect(b.decorations.length).toBeGreaterThan(a.decorations.length);
  });
  it.each(['hex', 'diamond'] as const)(
    'partitions the flat-top main hex exactly using %s cells',
    (kind) => {
      const c = config();
      c.grid.kind = kind;
      const tile = generateTile(c),
        boundary = hexagon(),
        center = tile.center.polygon;
      expect(Math.abs(polygonArea(boundary))).toBeCloseTo((3 * Math.sqrt(3)) / 2, 10);
      expect(tile.cells.reduce((area, cell) => area + polygonArea(cell.polygon), 0)).toBeCloseTo(
        polygonArea(boundary),
        9,
      );
      for (const cell of tile.cells) {
        expect(cell.polygon.every((point) => pointInPolygon(point, boundary))).toBe(true);
        expect(polygonArea(cell.polygon)).toBeGreaterThan(0);
        expect(
          cell.neighbors.every((id) =>
            tile.cells.find((c) => c.id === id)?.neighbors.includes(cell.id),
          ),
        ).toBe(true);
      }
      const remaining = tile.cells.reduce(
        (area, cell) => area + cell.surfacePolygons.reduce((sum, p) => sum + polygonArea(p), 0),
        0,
      );
      expect(remaining + polygonArea(center)).toBeCloseTo(polygonArea(boundary), 9);
      expect(tile.cells.some((cell) => cell.reserved && cell.surfacePolygons.length > 0)).toBe(
        true,
      );
    },
  );
  it.each([6, 24])('keeps all six routes connected at grid bound %i', (divisions) => {
    const c = config();
    c.grid.divisions = divisions;
    const tile = generateTile(c);
    expect(tile.stats.connected).toBe(true);
    expect(tile.entrances).toHaveLength(6);
    for (const entrance of tile.entrances) {
      expect(entrance.widthCells).toBe(
        Math.max(1, Math.floor(boundaryCells(tile.cells, entrance.side).length / 3)),
      );
      expect(entrance.cellIds).toHaveLength(entrance.widthCells);
    }
    for (const field of tile.fields) {
      expect(field.height).toBe(
        Math.min(...field.cellIds.map((id) => tile.cells.find((c) => c.id === id)!.baseHeight)),
      );
      if (!field.isCenter) expect(isConnectedSelection(field.cellIds, tile.cells)).toBe(true);
    }
  });
  it('supports a regular reference pentagon and exact shared-raster central fragments', () => {
    const center = pentagon();
    for (let i = 0; i < center.length; i++)
      expect(
        Math.hypot(center[i]!.x - center[(i + 1) % 5]!.x, center[i]!.y - center[(i + 1) % 5]!.y),
      ).toBeCloseTo(0.2, 12);
    const tile = generateTile(config());
    expect(tile.fields.filter((f) => f.isCenter)).toHaveLength(1);
    expect(tile.fields[0]!.id).toBe('center');
    const insideRasters = new Set(
      tile.cells.filter((cell) => !cell.surfacePolygons.length).map((cell) => cell.rasterId),
    );
    expect(
      tile.cells.some(
        (cell) => cell.surfacePolygons.length > 0 && insideRasters.has(cell.rasterId),
      ),
    ).toBe(true);
    expect(
      tile.fields[0]!.cellIds.every((id) =>
        tile.fields.slice(1).every((field) => !field.cellIds.includes(id)),
      ),
    ).toBe(true);
  });
  it('supports editing generated fields without changing geometry', () => {
    const c = config(),
      original = generateTile(c),
      field = original.fields[1]!;
    c.paths.fields = [
      { id: field.id, cellIds: [], action: 'alb', color: '#123456', label: 'Nebel' },
      { id: 'center', cellIds: [], action: 'shop', color: '#654321' },
    ];
    const tile = generateTile(c),
      edited = tile.fields.find((f) => f.id === field.id)!;
    expect(edited.cellIds).toEqual(field.cellIds);
    expect(edited.color).toBe('#123456');
    expect(edited.action).toBe('alb');
    expect(edited.label).toBe('Nebel');
    expect(tile.fields[0]!.color).toBe('#654321');
    expect(tile.fields[0]!.action).toBe('shop');
  });
  it('validates connected manual fields, overlaps, missing IDs and reserved center cells', () => {
    const c = config();
    c.grid.divisions = 10;
    c.paths.auto = false;
    const initial = generateTile(c),
      allowed = (id: string) => {
        const candidate = initial.cells.find((cell) => cell.id === id)!;
        return (
          !candidate.reserved && !candidate.landscapeOnly && candidate.entranceSide === undefined
        );
      },
      cell = initial.cells.find(
        (cell) =>
          allowed(cell.id) &&
          cell.center.x > 0.25 &&
          cell.center.x < 0.4 &&
          Math.abs(cell.center.y) < 0.1,
      )!;
    const ids = [cell.id];
    for (let cursor = 0; cursor < ids.length && ids.length < 4; cursor++)
      for (const next of initial.cells.find((cell) => cell.id === ids[cursor])!.neighbors)
        if (allowed(next) && !ids.includes(next) && ids.length < 4) ids.push(next);
    c.paths.fields = [
      { id: 'manual-a', cellIds: ids, action: 'jump', color: '#fedcba' },
      { id: 'overlap', cellIds: [cell.id], action: 'none' },
      { id: 'missing', cellIds: ['missing'], action: 'event' },
    ];
    const reserved = initial.cells.find((c) => c.surfacePolygons.length === 0);
    if (reserved) c.paths.fields.push({ id: 'reserved', cellIds: [reserved.id], action: 'event' });
    const tile = generateTile(c);
    expect(tile.fields.find((f) => f.id === 'manual-a')?.color).toBe('#fedcba');
    expect(
      tile.fields.some((f) => f.id === 'overlap' || f.id === 'missing' || f.id === 'reserved'),
    ).toBe(false);
    expect(tile.stats.connected).toBe(false);
    expect(tile.warnings.length).toBeGreaterThanOrEqual(3);
  });
  it('supports disabled routes, a single entrance, no entrances, and optional loops', () => {
    const c = config();
    c.paths.enabled = false;
    expect(generateTile(c).fields).toHaveLength(1);
    c.paths.enabled = true;
    c.paths.loop = false;
    c.paths.enabledSides = [true, false, false, false, false, false];
    expect(generateTile(c).stats.connected).toBe(true);
    c.paths.enabledSides = Array.from({ length: 6 }, () => false);
    expect(generateTile(c).warnings.some((s) => s.includes('Alle sechs'))).toBe(true);
    c.paths.fields = [{ id: 'center', cellIds: ['ignored'], action: 'event' }];
    expect(generateTile(c).warnings.some((s) => s.includes('Zentrum-Rasterstücke'))).toBe(true);
  });
  it('keeps multiple manual objects in distinct subgrid spots of the same cell', () => {
    const c = config();
    c.decoration.density = 1;
    const cell = generateTile(c).cells.find(
      (cell) => !cell.reserved && !cell.fieldId && cell.polygon.length === 6,
    )!;
    c.decoration.placements = [
      {
        id: 'first-object',
        kind: 'tree',
        cellId: cell.id,
        offset: { x: -0.25, y: 0 },
        rotation: 0,
        scale: 1,
      },
      {
        id: 'second-object',
        kind: 'rock',
        cellId: cell.id,
        offset: { x: 0.25, y: 0 },
        rotation: 0,
        scale: 1,
      },
    ];
    const tile = generateTile(c),
      objects = tile.decorations.filter((d) => d.cellId === cell.id);
    expect(objects.map((d) => d.id)).toEqual(
      expect.arrayContaining(['first-object', 'second-object']),
    );
    expect(objects.find((d) => d.id === 'first-object')!.position).not.toEqual(
      objects.find((d) => d.id === 'second-object')!.position,
    );
    expect(objects.every((d) => pointInPolygon(d.position, cell.polygon))).toBe(true);
  });
  it.each(['hex', 'diamond'] as const)(
    'anchors every %s field inside its visible exterior surfaces',
    (kind) => {
      const c = config();
      c.grid.kind = kind;
      for (const divisions of [6, 10, 24]) {
        c.grid.divisions = divisions;
        const tile = generateTile(c);
        for (const field of tile.fields) {
          const polygons = field.isCenter
            ? [tile.center.polygon]
            : tile.cells
                .filter((cell) => field.cellIds.includes(cell.id))
                .flatMap((cell) => cell.surfacePolygons);
          expect(polygons.some((polygon) => pointInPolygon(field.center, polygon))).toBe(true);
        }
      }
    },
  );
  it('keeps a concave manual field anchor outside an interior landscape cavity', () => {
    const c = config();
    c.paths.auto = false;
    const original = generateTile(c),
      map = new Map(original.cells.map((cell) => [cell.id, cell]));
    const cavity = original.cells.find(
      (cell) =>
        !cell.reserved &&
        Math.abs(cell.center.x) < 0.01 &&
        cell.center.y > 0.35 &&
        cell.center.y < 0.45,
    )!;
    const region = new Set([cavity.id]);
    let frontier = [cavity.id];
    for (let depth = 0; depth < 2; depth++) {
      const next = frontier.flatMap((id) => map.get(id)!.neighbors).filter((id) => !region.has(id));
      next.forEach((id) => region.add(id));
      frontier = [...new Set(next)];
    }
    const ids = [...region].filter((id) => id !== cavity.id);
    expect(ids).toHaveLength(18);
    expect(
      ids.every(
        (id) =>
          !map.get(id)!.reserved &&
          !map.get(id)!.landscapeOnly &&
          map.get(id)!.entranceSide === undefined,
      ),
    ).toBe(true);
    c.paths.fields = [{ id: 'ring', cellIds: ids, action: 'event' }];
    const tile = generateTile(c),
      ring = tile.fields.find((field) => field.id === 'ring')!;
    expect(ring).toBeDefined();
    expect(pointInPolygon(ring.center, cavity.polygon)).toBe(false);
    expect(
      tile.cells
        .filter((cell) => cell.fieldId === 'ring')
        .some((cell) =>
          cell.surfacePolygons.some((polygon) => pointInPolygon(ring.center, polygon)),
        ),
    ).toBe(true);
  });
  it('places seeded and manual objects only in unreserved landscape', () => {
    const c = config();
    c.decoration.density = 1;
    const original = generateTile(c);
    for (const object of original.decorations) {
      const cell = original.cells.find((c) => c.id === object.cellId)!;
      expect(cell.fieldId).toBeUndefined();
      expect(cell.reserved).toBe(false);
      expect(pointInPolygon(object.position, cell.polygon)).toBe(true);
    }
    const cell = original.cells.find((cell) => !cell.reserved && !cell.fieldId)!;
    c.decoration.placements = [
      {
        id: 'manual-tree',
        kind: 'tree',
        cellId: cell.id,
        offset: { x: 0, y: 0 },
        rotation: 90,
        scale: 2,
      },
      { id: 'bad', kind: 'rock', cellId: 'missing', offset: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      {
        id: 'outside',
        kind: 'rock',
        cellId: cell.id,
        offset: { x: 1, y: 1 },
        rotation: 0,
        scale: 1,
      },
    ];
    const tile = generateTile(c);
    expect(tile.decorations.find((d) => d.id === 'manual-tree')?.scale).toBe(2 / c.grid.divisions);
    expect(tile.decorations.filter((d) => d.id === 'manual-tree')).toHaveLength(1);
    expect(tile.decorations.some((d) => d.id === 'outside' || d.id === 'bad')).toBe(false);
    expect(tile.warnings.some((s) => s.includes('bad'))).toBe(true);
    expect(tile.warnings.some((s) => s.includes('outside'))).toBe(true);
    c.decoration.enabled = false;
    expect(generateTile(c).decorations).toHaveLength(0);
  });
});

describe('geometry, colors and noise primitives', () => {
  it('uses stateless independent randomness and smooth gradient Perlin fBm', () => {
    expect(hash32('a')).toBe(hash32('a'));
    expect(hash32('a')).not.toBe(hash32('b'));
    expect(randomAt('seed', 'a', 1)).not.toBe(randomAt('seed', 'b', 1));
    expect(randomAt('seed', 'a', 1)).toBeGreaterThanOrEqual(0);
    expect(randomAt('seed', 'a', 1)).toBeLessThan(1);
    expect(perlin('seed', 0, 0)).toBe(0);
    expect(Math.abs(perlin('seed', 0.5, 0.7) - perlin('seed', 0.50001, 0.7))).toBeLessThan(0.001);
    expect(fbm('a', 0.3, 0.7, 4, 0.5, 2)).toBeGreaterThanOrEqual(0);
    expect(fbm('a', 0.3, 0.7, 4, 0.5, 2)).toBeLessThanOrEqual(1);
  });
  it('interpolates and clamps gradients', () => {
    const stops = [
      { at: 0, color: '#000000' },
      { at: 1, color: '#ffffff' },
    ];
    expect(sampleGradient(stops, 0.5)).toBe('#808080');
    expect(sampleGradient(stops, -1)).toBe('#000000');
    expect(sampleGradient(stops, 2)).toBe('#ffffff');
  });
  it('clips and subtracts convex polygons including degenerate cases', () => {
    expect(clipHalfPlane([], { x: 0, y: 0 }, { x: 1, y: 0 })).toEqual([]);
    expect(centroid([])).toEqual({ x: 0, y: 0 });
    expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
    expect(clipPolygon(pentagon(), hexagon())).toHaveLength(5);
    expect(subtractPolygon(pentagon(), hexagon())).toEqual([]);
    const cells = buildGrid(defaultConfig.grid);
    expect(isConnectedSelection([], cells)).toBe(false);
    expect(isConnectedSelection(['missing'], cells)).toBe(false);
    expect(isConnectedSelection([cells[0]!.id, cells.at(-1)!.id], cells)).toBe(false);
  });
});

describe('strict import schema', () => {
  it('accepts the default configuration and custom voxel slots', () => {
    const c = config();
    c.decoration.modelSlots = { tree: 'pine-voxel' };
    expect(parseConfig(c)).toEqual(c);
    expect(configSchema.safeParse(defaultConfig).success).toBe(true);
  });
  it('rejects unsupported versions, unknown keys, nonfinite numbers and unordered gradients', () => {
    expect(configSchema.safeParse({ ...defaultConfig, schemaVersion: 999 }).success).toBe(false);
    expect(configSchema.safeParse({ ...defaultConfig, surprise: true }).success).toBe(false);
    const c = config();
    c.terrain.elevation = Infinity;
    expect(configSchema.safeParse(c).success).toBe(false);
    c.terrain.elevation = 0.2;
    c.terrain.gradient = [
      { at: 0.2, color: '#000000' },
      { at: 1, color: '#ffffff' },
    ];
    expect(configSchema.safeParse(c).success).toBe(false);
    c.terrain.gradient = [
      { at: 0, color: '#000000' },
      { at: 0.7, color: '#ffffff' },
      { at: 0.5, color: '#ffffff' },
      { at: 1, color: '#ffffff' },
    ];
    expect(configSchema.safeParse(c).success).toBe(false);
    c.terrain.gradient = defaultConfig.terrain.gradient;
    c.seed = '';
    expect(() => generateTile(c)).toThrow();
  });
});
