import { describe, expect, it } from 'vitest';
import { defaultConfig, generateTile } from '../src/core';
import { decorationClearsBorder } from '../src/core/tile-border';
import { pointInPolygon } from '../src/core/geometry';
import { buildPathAccents, MAX_PATH_ACCENTS } from '../src/render/pathAccents';
import { fieldOutlineSegments } from '../src/render/borders';
import { distanceToSegment, fieldSurfaceRegions } from '../src/render/surfaces';
import { fieldSymbolLayout } from '../src/render/symbols';
import { samplePathCrack, samplePathFinish } from '../src/render/material';

describe('rendered path clusters', () => {
  it.each(['flat', 'terraced'] as const)(
    'keeps complete %s footprints on the owning plateau and clear of symbols, boundaries and connections',
    (mode) => {
      const config = structuredClone(defaultConfig);
      config.paths.heightMode = mode;
      config.paths.detail.pebbleDensity = 1;
      const tile = generateTile(config);
      const saved = structuredClone(tile);
      const accents = buildPathAccents(tile, config);
      expect(accents).toEqual(buildPathAccents(tile, config));
      expect(accents.length).toBeGreaterThan(0);
      expect(accents.length).toBeLessThanOrEqual(MAX_PATH_ACCENTS);
      expect(new Set(accents.map((item) => item.id)).size).toBe(accents.length);
      expect(accents.some((item) => item.id.includes(':cluster-v2:'))).toBe(true);
      for (const field of tile.fields) {
        const edges = fieldOutlineSegments(tile, field);
        const regions = fieldSurfaceRegions(tile, field);
        const symbol = fieldSymbolLayout(tile, field);
        const openings = tile.connections
          .filter((connection) => connection.from === field.id || connection.to === field.id)
          .flatMap((connection) => connection.segments);
        for (const item of accents.filter((item) => item.fieldId === field.id)) {
          const radius = item.scale * 0.5;
          expect(
            regions.some(
              (region) =>
                region.height === item.height &&
                region.polygons.some((polygon) => pointInPolygon(item.position, polygon)),
            ),
          ).toBe(true);
          for (const edge of edges)
            expect(distanceToSegment(item.position, edge.start, edge.end)).toBeGreaterThanOrEqual(
              radius + 0.001 - 1e-10,
            );
          for (const edge of openings)
            expect(distanceToSegment(item.position, edge.start, edge.end)).toBeGreaterThanOrEqual(
              radius + 0.014 - 1e-10,
            );
          if (field.action !== 'none')
            expect(
              Math.hypot(item.position.x - symbol.center.x, item.position.y - symbol.center.y),
            ).toBeGreaterThanOrEqual(symbol.size / Math.SQRT2 + radius + 0.003);
          for (let i = 0; i < 16; i++) {
            const angle = (i * Math.PI) / 8;
            const probe = {
              x: item.position.x + Math.cos(angle) * radius,
              y: item.position.y + Math.sin(angle) * radius,
            };
            expect(
              regions.some(
                (region) =>
                  region.height === item.height &&
                  region.polygons.some((polygon) => pointInPolygon(probe, polygon)),
              ),
            ).toBe(true);
          }
        }
      }
      expect(tile).toEqual(saved);
    },
  );

  it('hides saved clusters in either border mode and restores them when disabled; density zero hides all', () => {
    const config = structuredClone(defaultConfig);
    const tile = generateTile(config);
    const initial = buildPathAccents(tile, config);
    config.border.enabled = true;
    config.border.width = 0.25;
    config.border.mode = 'transparent';
    const transparent = buildPathAccents(tile, config);
    expect(transparent.length).toBeLessThan(initial.length);
    expect(
      transparent.every((item) =>
        decorationClearsBorder(config, item.position, item.scale, item.rotation),
      ),
    ).toBe(true);
    config.border.mode = 'black';
    expect(buildPathAccents(tile, config)).toEqual(transparent);
    config.border.enabled = false;
    expect(buildPathAccents(tile, config)).toEqual(initial);
    config.paths.detail.pebbleDensity = 0;
    expect(buildPathAccents(tile, config)).toEqual([]);
  });
});

describe('painted path finish', () => {
  const detail = { centerLight: 0.22, edgeShade: 0.12 };
  it('concentrates extra grit along edges and retains a brighter quiet center', () => {
    const edges: number[] = [],
      centers: number[] = [];
    for (let i = 0; i < 200; i++) {
      const point = { x: i * 0.0073 - 0.7, y: 0.137, z: 0.231 };
      edges.push(samplePathFinish('finish', point, 0.01, 0.09, detail));
      centers.push(samplePathFinish('finish', point, 0.9, 0.09, detail));
      expect(samplePathFinish('finish', point, 0.9, 0.09, detail, { x: 0.2, y: -0.1 })).toBe(
        samplePathFinish(
          'finish',
          { x: point.x + 0.2, y: point.y, z: point.z - 0.1 },
          0.9,
          0.09,
          detail,
        ),
      );
    }
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
    expect(spread(edges)).toBeGreaterThan(0.3);
    expect(spread(centers)).toBeLessThan(0.01);
    expect(Math.max(...edges)).toBeLessThan(Math.min(...centers));
    expect(
      samplePathFinish('finish', { x: 0.1, y: 0.1, z: 0.1 }, 0, 0, {
        centerLight: 0,
        edgeShade: 0,
      }),
    ).toBe(1);
  });

  it('places sparse reproducible hairline cracks, including at negative coordinates', () => {
    let occupied = 0,
      changed = 0;
    for (let x = -10; x <= 10; x++)
      for (let z = -10; z <= 10; z++) {
        const point = { x: (x + 0.48) / 5.5, y: 0.1, z: (z + 0.5) / 5.5 };
        const first = samplePathCrack('cracks', point);
        expect(first).toBe(samplePathCrack('cracks', point));
        expect(first).toBeGreaterThanOrEqual(0);
        expect(first).toBeLessThanOrEqual(1);
        if (first > 0) occupied++;
        if (first !== samplePathCrack('another', point)) changed++;
      }
    expect(occupied).toBeGreaterThan(0);
    expect(occupied).toBeLessThan(35);
    expect(changed).toBeGreaterThan(0);
  });
});
