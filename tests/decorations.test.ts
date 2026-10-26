import { describe, expect, it } from 'vitest';
import {
  buildDecorations,
  decorationSlots,
  forestDensity,
  forestSpeciesRegion,
} from '../src/core/decorations';
import { buildPathDetails, MAX_PATH_DETAILS, pathIconClearance } from '../src/core/pathDetails';
import { buildConnections, fieldBoundarySegments } from '../src/core/connections';
import { configSchema, defaultConfig } from '../src/core/config';
import { createSeededProject } from '../src/core/project';
import { generateTile } from '../src/core/generate';
import { createCenterPolygon } from '../src/core/center';
import { buildGrid, centroid, pointInPolygon, polygonArea } from '../src/core/geometry';
import { placementOffset, placementPoint } from '../src/core/subgrid';
import {
  ASSET_LIBRARY,
  normalizeVoxelModel,
  syncModelSlots,
  voxelGeometry,
} from '../src/render/voxels';
import type { Decoration, DecorationKind, GameField, Point, TileCell } from '../src/core/types';

function landscape() {
  const config = structuredClone(defaultConfig);
  config.seed = 'forest-regression-3';
  config.grid.divisions = 12;
  config.grid.subDivisions = 4;
  config.decoration.density = 0.8;
  config.decoration.maxPerCell = 8;
  config.decoration.species = ['pine', 'oak', 'birch', 'deadTree'];
  const center = createCenterPolygon(config.seed, config.center);
  const cells = buildGrid(config.grid, center);
  for (const cell of cells) cell.height = cell.baseHeight = 0.2;
  return { config, center, cells };
}
function grouped(objects: Decoration[]): Map<string, Decoration[]> {
  const result = new Map<string, Decoration[]>();
  for (const object of objects)
    result.set(object.cellId, [...(result.get(object.cellId) ?? []), object]);
  return result;
}

describe('clustered multiple-object decoration', () => {
  it('places several stable subslot objects per cell with bounded counts and selected species', () => {
    const { config, center, cells } = landscape();
    const first = buildDecorations(config, cells, center);
    expect(buildDecorations(config, cells, center)).toEqual(first);
    expect(first.warnings).toEqual([]);
    expect([...grouped(first.decorations).values()].some((objects) => objects.length >= 3)).toBe(
      true,
    );
    expect(
      [...grouped(first.decorations).values()].every(
        (objects) => objects.length <= config.decoration.maxPerCell,
      ),
    ).toBe(true);
    expect(new Set(first.decorations.map((object) => object.id)).size).toBe(
      first.decorations.length,
    );
    expect(
      first.decorations.every((object) => config.decoration.species.includes(object.kind)),
    ).toBe(true);
    const map = new Map(cells.map((cell) => [cell.id, cell]));
    for (const object of first.decorations) {
      const cell = map.get(object.cellId)!;
      expect(cell.reserved).toBe(false);
      expect(pointInPolygon(object.position, cell.polygon)).toBe(true);
      expect(object.height).toBe(cell.height);
    }
    config.seed = 'a-different-forest';
    expect(buildDecorations(config, cells, center).decorations).not.toEqual(first.decorations);
  });
  it('makes Perlin groves denser than nearby clearings and increasing density preserves existing slots', () => {
    const { config, center, cells } = landscape();
    const eligible = cells.filter((cell) => !cell.reserved);
    const ranking = [...eligible].sort(
      (a, b) => forestDensity(config.seed, a.center) - forestDensity(config.seed, b.center),
    );
    const objects = grouped(buildDecorations(config, cells, center).decorations);
    const count = Math.floor(ranking.length / 5);
    const mean = (sample: TileCell[]) =>
      sample.reduce((sum, cell) => sum + (objects.get(cell.id)?.length ?? 0), 0) / sample.length;
    expect(mean(ranking.slice(-count))).toBeGreaterThan(mean(ranking.slice(0, count)) + 1);
    config.decoration.density = 0.25;
    const sparse = buildDecorations(config, cells, center).decorations;
    config.decoration.density = 0.75;
    const dense = new Set(
      buildDecorations(config, cells, center).decorations.map((object) => object.id),
    );
    expect(sparse.every((object) => dense.has(object.id))).toBe(true);
    config.decoration.density = 0;
    expect(buildDecorations(config, cells, center).decorations).toEqual([]);
  });
  it('overrides only one occupied subslot and leaves every other procedural object unchanged', () => {
    const { config, center, cells } = landscape();
    const original = buildDecorations(config, cells, center).decorations;
    const sameCell = [...grouped(original).values()].find((objects) => objects.length >= 3)!;
    const target = sameCell[1];
    const cell = cells.find((cell) => cell.id === target.cellId)!;
    config.decoration.placements.push({
      id: 'manual-rock',
      kind: 'rock',
      cellId: cell.id,
      offset: placementOffset(cell, target.position),
      scale: 0.8,
      rotation: 35,
    });
    const result = buildDecorations(config, cells, center);
    expect(result.warnings).toEqual([]);
    expect(result.decorations.filter((object) => object.id !== 'manual-rock')).toEqual(
      original.filter((object) => object.id !== target.id),
    );
    expect(result.decorations.find((object) => object.id === 'manual-rock')).toMatchObject({
      kind: 'rock',
      cellId: cell.id,
      rotation: 35,
    });
    expect(result.decorations.filter((object) => object.cellId === cell.id)).toHaveLength(
      sameCell.length,
    );
    config.decoration.placements = [];
    expect(buildDecorations(config, cells, center).decorations).toEqual(original);
  });
  it('validates manual positions and keeps clipped slot centers within the surface', () => {
    const { config, center, cells } = landscape();
    for (const cell of cells.filter((cell) => !cell.reserved)) {
      expect(
        decorationSlots(cell, config.grid).every((slot) =>
          pointInPolygon(slot.position, cell.polygon),
        ),
      ).toBe(true);
    }
    expect(
      decorationSlots(
        cells.find((cell) => cell.surfacePolygons.length === 0)!,
        config.grid,
      ),
    ).toEqual([]);
    const free = cells.find((cell) => !cell.reserved)!;
    config.decoration.placements = [
      {
        id: 'missing',
        kind: 'rock',
        cellId: 'does-not-exist',
        offset: { x: 0, y: 0 },
        scale: 1,
        rotation: 0,
      },
      {
        id: 'reserved',
        kind: 'rock',
        cellId: cells.find((cell) => cell.reserved)!.id,
        offset: { x: 0, y: 0 },
        scale: 1,
        rotation: 0,
      },
      {
        id: 'outside',
        kind: 'rock',
        cellId: free.id,
        offset: { x: 1, y: 1 },
        scale: 1,
        rotation: 0,
      },
    ];
    expect(buildDecorations(config, cells, center).warnings).toHaveLength(3);
    config.decoration.enabled = false;
    expect(buildDecorations(config, cells, center)).toEqual({ decorations: [], warnings: [] });
    config.grid.kind = 'diamond';
    const diamond = buildGrid(config.grid, center).find((cell) => !cell.reserved)!;
    expect(decorationSlots(diamond, config.grid).length).toBeGreaterThan(0);
  });
});

describe('normalized distinct tree species', () => {
  it('contains four living tree silhouettes plus dead wood with a shared footprint resting on ground', () => {
    const trees = ASSET_LIBRARY.filter((model) =>
      ['tree', 'pine', 'oak', 'birch', 'deadTree'].includes(model.id),
    );
    expect(trees).toHaveLength(5);
    expect(
      new Set(trees.map((model) => JSON.stringify(model.voxels.map((voxel) => voxel.slice(0, 3)))))
        .size,
    ).toBe(5);
    for (const tree of trees) {
      const normalized = normalizeVoxelModel(tree);
      expect(normalized.scale).toBeGreaterThan(0);
      const geometry = voxelGeometry(tree);
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;
      expect(Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z)).toBeCloseTo(1, 6);
      expect(bounds.min.y).toBeCloseTo(0, 6);
      expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
      geometry.dispose();
    }
    const slots = new Map<DecorationKind, string>();
    syncModelSlots(slots, {
      pine: 'model-pine',
      oak: 'model-oak',
      birch: 'model-birch',
      deadTree: 'model-dead',
    });
    expect([...slots.keys()]).toEqual(['pine', 'oak', 'birch', 'deadTree']);
    syncModelSlots(slots);
    expect(slots.size).toBe(0);
  });
});

const rectangle = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
function cell(id: string, polygon: Point[]): TileCell {
  return {
    id,
    polygon,
    surfacePolygons: [polygon],
    center: centroid(polygon),
    height: 0.2,
    baseHeight: 0.2,
    color: '#987654',
    neighbors: [],
    reserved: false,
  };
}
function field(id: string, cells: TileCell[]): GameField {
  return {
    id,
    cellIds: cells.map((cell) => cell.id),
    center: centroid(rectangle(-0.5, -0.5, 0.5, 0.5)),
    height: 0.2,
    maxHeight: 0.2,
    symbolHeight: 0.2,
    area: cells.reduce((sum, cell) => sum + polygonArea(cell.polygon), 0),
    color: '#987654',
    action: 'event',
    label: id,
    isCenter: false,
  };
}
function distance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x,
    dy = end.y - start.y;
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}

describe('path border details', () => {
  it('uses true union outlines, avoids internal raster seams and action icon footprint, and is repeatable', () => {
    const config = structuredClone(defaultConfig);
    config.paths.detail.pebbleDensity = 1;
    const cells = [
      cell('left', rectangle(-0.6, -0.5, 0, 0.5)),
      cell('right', rectangle(0, -0.5, 0.6, 0.5)),
    ];
    const player = field('player', cells);
    const details = buildPathDetails(config, [player], cells, []);
    expect(details.length).toBeGreaterThan(10);
    expect(buildPathDetails(config, [player], cells, [])).toEqual(details);
    const borders = fieldBoundarySegments(player, cells);
    const icon = pathIconClearance(player, borders);
    for (const detail of details) {
      expect(
        Math.min(...borders.map((edge) => distance(detail.position, edge.start, edge.end))),
      ).toBeLessThan(detail.scale);
      expect(
        Math.hypot(detail.position.x - player.center.x, detail.position.y - player.center.y),
      ).toBeGreaterThanOrEqual(icon + detail.scale);
      expect(Math.abs(detail.position.x) < 0.02 && Math.abs(detail.position.y) < 0.45).toBe(false);
      expect(detail.height).toBe(player.height);
    }
    expect(details.length).toBeLessThanOrEqual(MAX_PATH_DETAILS);
    player.action = 'none';
    expect(pathIconClearance(player, borders)).toBe(0);
    config.paths.detail.pebbleDensity = 0;
    expect(buildPathDetails(config, [player], cells, [])).toEqual([]);
    config.paths.enabled = false;
    expect(buildPathDetails(config, [player], cells, [])).toEqual([]);
  });
  it('keeps all physical path and center connections open and skips the pentagon', () => {
    const config = structuredClone(defaultConfig);
    config.paths.detail.pebbleDensity = 1;
    const cells = [
      cell('left', rectangle(-0.6, -0.5, 0, 0.5)),
      cell('right', rectangle(0, -0.5, 0.6, 0.5)),
    ];
    const left = field('left', [cells[0]]);
    left.center = { x: -0.3, y: 0 };
    const right = field('center', [cells[1]]);
    right.center = { x: 0.3, y: 0 };
    right.isCenter = true;
    right.polygon = cells[1].polygon;
    const connections = buildConnections([left, right], cells);
    expect(connections).toHaveLength(1);
    const details = buildPathDetails(config, [left, right], cells, connections);
    expect(details.length).toBeGreaterThan(0);
    expect(details.every((detail) => detail.fieldId === left.id)).toBe(true);
    expect(
      details.every(
        (detail) => distance(detail.position, { x: 0, y: -0.5 }, { x: 0, y: 0.5 }) > 0.02,
      ),
    ).toBe(true);
  });
});

it('keeps outer entrance mouths free and caps dense detail output', () => {
  const config = structuredClone(defaultConfig);
  config.paths.detail.pebbleDensity = 1;
  const top = Math.sqrt(3) / 2;
  const entranceCell = cell('entrance', rectangle(-0.2, 0.55, 0.2, top));
  const entrance = field('entrance', [entranceCell]);
  entrance.center = { x: 0, y: 0.7 };
  const details = buildPathDetails(config, [entrance], [entranceCell], []);
  expect(details.length).toBeGreaterThan(0);
  expect(details.every((detail) => detail.position.y < top - 0.02)).toBe(true);
  const enormousCell = cell('large', rectangle(-50, -50, 50, 50));
  const enormous = field('large', [enormousCell]);
  expect(buildPathDetails(config, [enormous], [enormousCell], [])).toHaveLength(MAX_PATH_DETAILS);
});

it('leaves enough space for the full icon even on a narrow connected field', () => {
  const config = structuredClone(defaultConfig);
  config.paths.detail.pebbleDensity = 1;
  const narrowCell = cell('narrow', rectangle(-0.5, -0.035, 0.5, 0.035));
  const narrow = field('narrow', [narrowCell]);
  const withIcon = buildPathDetails(config, [narrow], [narrowCell], []);
  const icon = pathIconClearance(narrow, fieldBoundarySegments(narrow, [narrowCell]));
  expect(
    withIcon.every(
      (detail) => Math.hypot(detail.position.x, detail.position.y) >= icon + detail.scale,
    ),
  ).toBe(true);
  const noIcon = { ...narrow, action: 'none' as const };
  expect(buildPathDetails(config, [noIcon], [narrowCell], []).length).toBeGreaterThan(
    withIcon.length,
  );
});

it.each(['project-1', 'project-6', 'board-42'])(
  'freezes boundary subslots into strict valid configuration for %s',
  (seed) => {
    const project = createSeededProject(seed);
    expect(configSchema.safeParse(project).success).toBe(true);
    expect(
      project.decoration.placements.every(
        (object) => Math.abs(object.offset.x) <= 1 && Math.abs(object.offset.y) <= 1,
      ),
    ).toBe(true);
    const tile = generateTile(project);
    expect(tile.decorations).toHaveLength(project.decoration.placements.length);
    const cells = new Map(tile.cells.map((cell) => [cell.id, cell]));
    for (const object of project.decoration.placements) {
      const position = placementPoint(cells.get(object.cellId)!, object.offset);
      expect(pointInPolygon(position, cells.get(object.cellId)!.polygon)).toBe(true);
    }
  },
  15000,
);

it('corrects only epsilon overshoot at cell bounds and leaves real outside positions invalid', () => {
  const square = cell('square', rectangle(-1, -1, 1, 1));
  expect(placementOffset(square, { x: 1 + 1e-12, y: -1 - 1e-12 })).toEqual({ x: 1, y: -1 });
  const outside = placementOffset(square, { x: 1.001, y: -1.001 });
  expect(outside.x).toBeGreaterThan(1);
  expect(outside.y).toBeLessThan(-1);
});

it('keeps pebbles on the local terrace of their playing field', () => {
  const config = structuredClone(defaultConfig);
  config.paths.detail.pebbleDensity = 1;
  const left = cell('left-step', rectangle(-0.6, -0.3, 0, 0.3)),
    right = cell('right-step', rectangle(0, -0.3, 0.6, 0.3));
  left.height = 0.12;
  right.height = 0.32;
  const terraces = {
    ...field('terraces', [left, right]),
    height: 0.12,
    maxHeight: 0.32,
    symbolHeight: 0.32,
    action: 'none' as const,
  };
  const details = buildPathDetails(config, [terraces], [left, right], []);
  expect(details.length).toBeGreaterThan(0);
  expect(details.some((detail) => detail.position.x < 0)).toBe(true);
  expect(details.some((detail) => detail.position.x > 0)).toBe(true);
  for (const detail of details) expect(detail.height).toBe(detail.position.x < 0 ? 0.12 : 0.32);
});

it('keeps discrete forest species regions stable at floating-point lattice boundaries', () => {
  expect(forestSpeciesRegion({ x: 1 / 3 - 1e-16, y: -1 / 3 + 1e-16 })).toEqual({ x: 1, y: -1 });
  expect(forestSpeciesRegion({ x: 1 / 3 + 1e-16, y: -1 / 3 - 1e-16 })).toEqual({ x: 1, y: -1 });
  expect(forestSpeciesRegion({ x: -1e-16, y: 1e-16 })).toEqual({ x: 0, y: 0 });
  expect(forestSpeciesRegion({ x: 1 / 3 - 1e-6, y: -1e-6 })).toEqual({ x: 0, y: -1 });
});
