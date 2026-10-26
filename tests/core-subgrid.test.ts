import { describe, expect, it } from 'vitest';
import {
  buildSubgrid,
  decorationSlots,
  defaultConfig,
  generateTile,
  placementPoint,
  placementOffset,
  pointInPolygon,
  polygonArea,
} from '../src/core';

describe('shared fine raster for renderer and object placement', () => {
  it.each(['hex', 'diamond'] as const)(
    'clips %s subcells to exactly the visible parent area',
    (kind) => {
      const config = structuredClone(defaultConfig);
      config.grid.kind = kind;
      const tile = generateTile(config);
      for (const subDivisions of [1, 3, 6]) {
        config.grid.subDivisions = subDivisions;
        for (const cell of tile.cells) {
          const subgrid = buildSubgrid(cell, config.grid);
          expect(new Set(subgrid.map((subcell) => subcell.id)).size).toBe(subgrid.length);
          const area = subgrid.reduce((sum, subcell) => sum + polygonArea(subcell.polygon), 0);
          expect(area).toBeCloseTo(
            cell.surfacePolygons.reduce((sum, p) => sum + polygonArea(p), 0),
            10,
          );
          for (const subcell of subgrid) {
            expect(pointInPolygon(subcell.center, subcell.polygon)).toBe(true);
            expect(
              cell.surfacePolygons.some((polygon) => pointInPolygon(subcell.center, polygon)),
            ).toBe(true);
            expect(Math.abs(subcell.offset.x)).toBeLessThanOrEqual(1);
            expect(Math.abs(subcell.offset.y)).toBeLessThanOrEqual(1);
            const reconstructed = placementPoint(cell, subcell.offset);
            expect(reconstructed.x).toBeCloseTo(subcell.center.x, 14);
            expect(reconstructed.y).toBeCloseTo(subcell.center.y, 14);
          }
        }
      }
    },
  );
  it('uses the editor lattice slots for deterministic seeded object placement', () => {
    const config = structuredClone(defaultConfig);
    config.decoration.density = 1;
    const tile = generateTile(config);
    for (const object of tile.decorations) {
      const cell = tile.cells.find((c) => c.id === object.cellId)!;
      expect(
        decorationSlots(cell, config.grid).some(
          (candidate) =>
            candidate.position.x === object.position.x &&
            candidate.position.y === object.position.y,
        ),
      ).toBe(true);
    }
  });
  it('reconstructs manual objects placed at a clipped subcell centroid', () => {
    const config = structuredClone(defaultConfig);
    config.decoration.density = 0;
    const tile = generateTile(config),
      cell = tile.cells.find((c) => !c.reserved && !c.fieldId)!;
    const candidate = buildSubgrid(cell, config.grid).at(-1)!;
    expect(placementOffset(cell, placementPoint(cell, candidate.offset))).toEqual(candidate.offset);
    config.decoration.placements = [
      {
        id: 'subgrid-object',
        kind: 'bush',
        cellId: cell.id,
        offset: candidate.offset,
        scale: 1,
        rotation: 0,
      },
    ];
    const position = generateTile(config).decorations[0]!.position;
    expect(position.x).toBeCloseTo(candidate.center.x, 14);
    expect(position.y).toBeCloseTo(candidate.center.y, 14);
  });
});
