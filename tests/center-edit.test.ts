import { describe, expect, it } from 'vitest';
import {
  boundaryCells,
  centralSideCells,
  clipPolygon,
  configSchema,
  createCenterPolygon,
  defaultConfig,
  fieldBoundarySegments,
  generateTile,
  hexagon,
  pointInPolygon,
  polygonArea,
  prepareCenterEdit,
  rollFieldActions,
  segmentOverlapLength,
} from '../src/core';
import type { GeneratedTile, TileCell, TileConfig } from '../src/core';

function fixture(kind: TileConfig['grid']['kind'] = 'hex'): {
  config: TileConfig;
  tile: GeneratedTile;
} {
  const config = structuredClone(defaultConfig);
  config.grid.kind = kind;
  config.decoration.enabled = false;
  return { config, tile: generateTile(config) };
}
const sourceId = (cell: TileCell) => cell.rasterId ?? cell.id;
const movedCenter = (config: TileConfig): TileConfig['center'] => ({
  ...config.center,
  rotation: 11,
  scale: 0.9,
  offset: { x: 0.04, y: 0.025 },
});

function assertStructuralGeometry(tile: GeneratedTile): void {
  const cells = new Map(tile.cells.map((cell) => [cell.id, cell]));
  expect(tile.cells.reduce((sum, cell) => sum + polygonArea(cell.polygon), 0)).toBeCloseTo(
    polygonArea(hexagon()),
    9,
  );
  expect(tile.cells.filter((cell) => cell.landscapeOnly).every((cell) => !cell.fieldId)).toBe(true);
  for (const portal of centralSideCells(tile.cells, tile.center.polygon)) {
    const owners = new Set([...portal].map((id) => cells.get(id)!.fieldId ?? null));
    expect(owners.size).toBe(1);
  }
  for (const entrance of tile.entrances) {
    expect(entrance.fieldId).not.toBeNull();
    expect(entrance.cellIds.every((id) => cells.get(id)!.fieldId === entrance.fieldId)).toBe(true);
    const contacts = boundaryCells(tile.cells, entrance.side).filter((cell) => cell.fieldId);
    expect(new Set(contacts.map((cell) => cell.fieldId))).toEqual(new Set([entrance.fieldId]));
    expect(contacts.every((cell) => entrance.cellIds.includes(cell.id))).toBe(true);
  }
  for (const side of tile.center.sides) {
    const owner = tile.fields.find((field) => field.id === side.fieldId);
    if (!owner) continue;
    const boundary = fieldBoundarySegments(owner, tile.cells);
    for (const [a, b] of [
      [side.start, side.portalStart],
      [side.portalEnd, side.end],
    ] as const)
      expect(
        boundary.every((edge) => segmentOverlapLength(edge.start, edge.end, a, b) < 1e-8),
      ).toBe(true);
  }
}

describe('pure center edits of the visible field layout', () => {
  it.each(['hex', 'diamond'] as const)(
    'freezes automatic %s fields without changing identities, metadata or untouched source cells',
    (kind) => {
      const { config, tile } = fixture(kind),
        beforeConfig = structuredClone(config),
        beforeTile = structuredClone(tile),
        nextCenter = movedCenter(config),
        beforeCenter = structuredClone(nextCenter),
        draft = prepareCenterEdit(config, tile, nextCenter),
        result = generateTile(draft),
        oldCells = new Map(tile.cells.map((cell) => [cell.id, cell]));
      expect(config).toEqual(beforeConfig);
      expect(tile).toEqual(beforeTile);
      expect(nextCenter).toEqual(beforeCenter);
      expect(draft.center).toEqual(nextCenter);
      expect(draft.center).not.toBe(nextCenter);
      expect(draft.paths.auto).toBe(false);
      expect(draft.paths.fieldCount).toBe(config.paths.fieldCount);
      expect(result.fields.map((field) => field.id)).toEqual(tile.fields.map((field) => field.id));
      expect(result.entrances).toEqual(tile.entrances);
      const affected = new Set(
        [...tile.cells, ...result.cells].filter((cell) => cell.rasterId).map(sourceId),
      );
      for (const cell of result.cells) {
        if (affected.has(sourceId(cell))) continue;
        const previous = oldCells.get(cell.id)!;
        expect(cell.polygon).toEqual(previous.polygon);
        expect(cell.surfacePolygons).toEqual(previous.surfacePolygons);
        expect(cell.fieldId).toBe(previous.fieldId);
        expect(cell.baseHeight).toBe(previous.baseHeight);
      }
      for (const field of tile.fields.filter((field) => !field.isCenter)) {
        const frozen = draft.paths.fields.find((edit) => edit.id === field.id)!;
        expect(frozen.action).toBe(field.action);
        expect(frozen.label).toBe(field.label);
        expect(frozen.color === undefined || frozen.color === field.color).toBe(true);
        expect(result.fields.find((candidate) => candidate.id === field.id)!.color).toBe(
          field.color,
        );
        if (field.cellIds.every((id) => !affected.has(sourceId(oldCells.get(id)!))))
          expect(frozen.cellIds).toEqual(field.cellIds);
      }
      expect(result.warnings.some((warning) => warning.includes('ignoriert'))).toBe(false);
      expect(configSchema.parse(draft)).toEqual(draft);
      expect(prepareCenterEdit(config, tile, nextCenter)).toEqual(draft);
      assertStructuralGeometry(result);
    },
  );

  it.each(['hex', 'diamond'] as const)(
    'preserves generated %s colors when a center cut changes terrain contrast',
    (kind) => {
      const { config, tile } = fixture(kind);
      const draft = prepareCenterEdit(config, tile, { ...config.center, rotation: 11 });
      const result = generateTile(draft);
      expect(result.fields.map(({ id, color }) => ({ id, color }))).toEqual(
        tile.fields.map(({ id, color }) => ({ id, color })),
      );
    },
  );

  it('materializes an unchanged cut exactly, including field order and symbol anchors', () => {
    const { config, tile } = fixture(),
      draft = prepareCenterEdit(config, tile, config.center);
    expect(generateTile(draft)).toEqual(tile);
  });

  it('preserves a manually reshaped entrance instead of restoring its automatic footprint', () => {
    const { config, tile: initial } = fixture(),
      entrance = initial.entrances[0]!,
      entry = initial.fields.find((field) => field.id === entrance.fieldId)!,
      removed = entry.cellIds.find((id) => !entrance.cellIds.includes(id))!,
      outer = new Set(
        Array.from({ length: 6 }, (_, side) => boundaryCells(initial.cells, side)).flatMap(
          (cells) => cells.map((cell) => cell.id),
        ),
      ),
      added = initial.cells.find(
        (cell) =>
          !cell.fieldId &&
          !cell.reserved &&
          !outer.has(cell.id) &&
          Math.hypot(cell.center.x, cell.center.y) > 0.5,
      )!;
    config.paths.auto = false;
    config.paths.fields = initial.fields
      .filter((field) => !field.isCenter)
      .map((field) => ({
        id: field.id,
        cellIds:
          field.id === entry.id
            ? [...field.cellIds.filter((id) => id !== removed), added.id]
            : [...field.cellIds],
        action: field.action,
        label: field.label,
      }));
    const tile = generateTile(config),
      draft = prepareCenterEdit(config, tile, movedCenter(config)),
      result = generateTile(draft),
      edited = result.fields.find((field) => field.id === entry.id)!;
    expect(edited.cellIds).toEqual(tile.fields.find((field) => field.id === entry.id)!.cellIds);
    expect(edited.cellIds).not.toContain(removed);
    expect(edited.cellIds).toContain(added.id);
    expect(result.entrances).toEqual(tile.entrances);
    expect(result.warnings.some((warning) => warning.includes('ignoriert'))).toBe(false);
  });

  it('keeps explicit center and normal-field edits and every manual object while changing a cut', () => {
    const { config, tile: initial } = fixture(),
      first = initial.fields.find((field) => !field.isCenter)!,
      normal = {
        id: first.id,
        cellIds: [],
        action: 'gold' as const,
        label: 'Goldgrube',
        color: '#123456',
        heightOffset: 0.04,
        heightMode: 'terraced' as const,
      },
      center = {
        id: 'center',
        cellIds: [],
        action: 'shop' as const,
        label: 'Zentrale',
        color: '#abcdef',
        heightOffset: 0.07,
        heightMode: 'terraced' as const,
      };
    config.paths.fields = [center, normal];
    config.decoration.enabled = true;
    config.decoration.density = 0;
    config.decoration.sourceDensity = 0.65;
    const free = initial.cells.find(
      (cell) => !cell.fieldId && !cell.reserved && Math.hypot(cell.center.x, cell.center.y) > 0.45,
    )!;
    config.decoration.placements = [
      {
        id: 'kept-tree',
        kind: 'tree',
        cellId: free.id,
        offset: { x: 0, y: 0 },
        scale: 0.7,
        rotation: 12,
      },
      {
        id: 'temporarily-hidden',
        kind: 'quartz',
        cellId: 'h:0:0',
        offset: { x: 0, y: 0 },
        scale: 0.8,
        rotation: 45,
      },
    ];
    const tile = generateTile(config),
      draft = prepareCenterEdit(config, tile, movedCenter(config)),
      result = generateTile(draft),
      frozen = draft.paths.fields.find((edit) => edit.id === normal.id)!;
    expect(draft.paths.fields.find((edit) => edit.id === 'center')).toEqual(center);
    expect(frozen).toEqual({ ...normal, cellIds: frozen.cellIds });
    expect(draft.decoration).toEqual(config.decoration);
    expect(result.fields.find((field) => field.id === normal.id)).toMatchObject({
      action: normal.action,
      label: normal.label,
      color: normal.color,
    });
    expect(result.decorations.some((object) => object.id === 'kept-tree')).toBe(true);
    expect(result.decorations.some((object) => object.id === 'temporarily-hidden')).toBe(false);
    expect(result.warnings.some((warning) => warning.includes('temporarily-hidden'))).toBe(true);
  });

  it('uses the visible cut rather than an earlier pending center configuration', () => {
    const { config, tile } = fixture(),
      pending = prepareCenterEdit(config, tile, {
        ...config.center,
        rotation: -42,
        offset: { x: -0.2, y: 0.08 },
      });
    const next = movedCenter(config),
      expected = prepareCenterEdit(config, tile, next),
      actual = prepareCenterEdit(pending, tile, next);
    expect(actual).toEqual(expected);
    const firstTile = generateTile(expected),
      secondCenter = { ...next, rotation: 21, offset: { x: 0.07, y: 0.01 } },
      staleConfig = structuredClone(expected);
    staleConfig.center = { ...next, rotation: -60 };
    const second = prepareCenterEdit(staleConfig, firstTile, secondCenter),
      equivalent = prepareCenterEdit(expected, firstTile, secondCenter);
    expect(second).toEqual(equivalent);
    expect(generateTile(second).fields.map((field) => field.id)).toEqual(
      firstTile.fields.map((field) => field.id),
    );
  });

  it('keeps newly rolled actions and metadata while the visible preview is still pending', () => {
    const { config, tile } = fixture();
    config.actions.biome = 'juwelensteppe';
    const rolled = rollFieldActions(config, tile),
      first = rolled.paths.fields.find((edit) => edit.id !== 'center')!;
    first.label = 'Gerade bearbeitet';
    first.color = '#aabbcc';
    first.heightOffset = 0.04;
    const draft = prepareCenterEdit(rolled, tile, movedCenter(config)),
      result = generateTile(draft);
    expect(draft.actions).toEqual(rolled.actions);
    expect(
      result.fields.map(({ id, action, resourceAmount }) => ({ id, action, resourceAmount })),
    ).toEqual(
      generateTile(rolled).fields.map(({ id, action, resourceAmount }) => ({
        id,
        action,
        resourceAmount,
      })),
    );
    expect(draft.paths.fields.find((edit) => edit.id === first.id)).toMatchObject({
      ...first,
      cellIds: expect.any(Array),
    });
    expect(result.fields.find((field) => field.id === first.id)).toMatchObject({
      label: first.label,
      color: first.color,
    });
  });

  it('keeps manual center-edit fields connected when the frozen layout remains valid', () => {
    const { config, tile } = fixture(),
      next = {
        ...config.center,
        scale: 1.1,
        rotation: 60,
        offset: { x: 0.2, y: -0.05 },
      },
      draft = prepareCenterEdit(config, tile, next),
      result = generateTile(draft);
    expect(result.fields.map((field) => field.id)).toEqual(tile.fields.map((field) => field.id));
    expect(result.stats.connected).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('nicht vollständig verbunden'))).toBe(
      false,
    );
    expect(draft.paths.auto).toBe(false);
    assertStructuralGeometry(result);
  });

  it('keeps an empty manual board empty instead of adding paths to newly revealed ground', () => {
    const config = structuredClone(defaultConfig);
    config.paths.enabled = false;
    config.paths.auto = false;
    config.decoration.enabled = false;
    const tile = generateTile(config),
      draft = prepareCenterEdit(config, tile, movedCenter(config)),
      result = generateTile(draft);
    expect(
      draft.paths.fields.every((field) => field.id === 'center' && field.cellIds.length === 0),
    ).toBe(true);
    expect(result.fields[0]!.color).toBe(tile.fields[0]!.color);
    expect(draft.paths.auto).toBe(false);
    expect(draft.paths.enabled).toBe(false);
    expect(result.fields.map((field) => field.id)).toEqual(['center']);
    expect(result.center.sides.every((side) => side.fieldId === null)).toBe(true);
  });

  it.each(['hex', 'diamond'] as const)(
    'preserves hidden automatic and manual %s fields across consecutive center edits',
    (kind) => {
      const { config, tile: initial } = fixture(kind);
      config.paths.fields = [{ id: initial.entrances[0]!.fieldId!, cellIds: [], action: 'gold' }];
      const visible = generateTile(config);
      config.paths.enabled = false;
      const before = structuredClone(config),
        hidden = generateTile(config),
        next = movedCenter(config),
        draft = prepareCenterEdit(config, hidden, next),
        expected = prepareCenterEdit(
          { ...config, paths: { ...config.paths, enabled: true } },
          visible,
          next,
        );
      expect(config).toEqual(before);
      expect(draft.paths).toEqual({ ...expected.paths, enabled: false });
      expect(draft.decoration).toEqual(config.decoration);
      const expectedTile = generateTile(expected);
      expect(generateTile(draft).fields.map((field) => field.id)).toEqual(['center']);
      expect(generateTile({ ...draft, paths: { ...draft.paths, enabled: true } }).fields).toEqual(
        expectedTile.fields,
      );

      // The second change can arrive before the hidden preview has rendered the first cut.
      const secondCenter = { ...draft.center, rotation: 19 },
        second = prepareCenterEdit(draft, hidden, secondCenter),
        expectedSecond = prepareCenterEdit(expected, expectedTile, secondCenter);
      expect(second.paths).toEqual({ ...expectedSecond.paths, enabled: false });
      const restored = generateTile({ ...second, paths: { ...second.paths, enabled: true } });
      expect(restored.fields).toEqual(generateTile(expectedSecond).fields);
      expect(restored.fields.map((field) => field.id)).toEqual(
        visible.fields.map((field) => field.id),
      );
      expect(restored.entrances).toEqual(visible.entrances);
      assertStructuralGeometry(restored);
    },
  );

  it('rejects a completely swallowed field without mutating its source project', () => {
    const { config, tile: initial } = fixture(),
      next = { ...config.center, scale: 1.2, offset: { x: 0.25, y: 0 } },
      polygon = createCenterPolygon(config.seed, next),
      cell = initial.cells.find(
        (cell) =>
          cell.surfacePolygons.length &&
          !cell.reserved &&
          !cell.landscapeOnly &&
          cell.polygon.every((point) => pointInPolygon(point, polygon)),
      )!;
    expect(cell).toBeDefined();
    config.paths.auto = false;
    config.paths.fields = [
      { id: 'tiny', cellIds: [cell.id], action: 'event', label: 'Kleine Insel' },
    ];
    const tile = generateTile(config),
      before = structuredClone(config);
    expect(tile.fields.some((field) => field.id === 'tiny')).toBe(true);
    expect(() => prepareCenterEdit(config, tile, next)).toThrow(
      'Spielfeld „Kleine Insel“ vollständig verdrängen',
    );
    expect(config).toEqual(before);
  });

  it('rejects an entry collision instead of moving the requested pentagon or entrance', () => {
    const { config, tile } = fixture(),
      next = {
        ...config.center,
        scale: 1.2,
        offset: { x: 0.45, y: 0.45 },
      },
      before = structuredClone(config);
    expect(() => prepareCenterEdit(config, tile, next)).toThrow(
      'kollidiert mit festem Eingangsfeld',
    );
    expect(config).toEqual(before);
  });

  it.each(['kind', 'divisions'] as const)(
    'rejects a stale visible raster after changing grid %s',
    (key) => {
      const { config, tile } = fixture();
      if (key === 'kind') config.grid.kind = 'diamond';
      else config.grid.divisions = 24;
      expect(() => prepareCenterEdit(config, tile, movedCenter(config))).toThrow(
        'sichtbare Raster ist noch nicht aktuell',
      );
      expect(() =>
        prepareCenterEdit(config, tile, {
          ...config.center,
          scale: 1.2,
          offset: { x: 0.45, y: 0.45 },
        }),
      ).toThrow('sichtbare Raster ist noch nicht aktuell');
    },
  );

  it('accepts changed fine-grid and presentation settings because the source raster is unchanged', () => {
    const { config, tile } = fixture();
    config.grid.subDivisions = 6;
    config.grid.showGrid = !config.grid.showGrid;
    config.grid.showSubgrid = !config.grid.showSubgrid;
    expect(() => prepareCenterEdit(config, tile, movedCenter(config))).not.toThrow();
  });

  it.each([undefined, 0.72])(
    'rebuilds paths and clears objects only when explicitly requested (source density %s)',
    (sourceDensity) => {
      const { config, tile } = fixture();
      config.editing.regeneratePathsOnCenterChange = true;
      config.paths.auto = false;
      config.paths.fields = [{ id: 'center', cellIds: [], action: 'gold' }];
      config.decoration.density = 0.13;
      config.decoration.sourceDensity = sourceDensity;
      config.decoration.placements = [
        {
          id: 'reset',
          kind: 'tree',
          cellId: 'h:1:0',
          offset: { x: 0, y: 0 },
          scale: 1,
          rotation: 0,
        },
      ];
      const before = structuredClone(config),
        next = movedCenter(config),
        draft = prepareCenterEdit(config, tile, next);
      expect(draft).toEqual({
        ...before,
        center: next,
        paths: { ...before.paths, auto: true, fields: [] },
        decoration: {
          ...before.decoration,
          density: sourceDensity ?? 0.13,
          placements: [],
        },
      });
      expect(config).toEqual(before);
    },
  );

  it('inherits newly clipped pieces through actual local overlap rather than source-ID coincidence alone', () => {
    const { config, tile } = fixture(),
      draft = prepareCenterEdit(config, tile, movedCenter(config)),
      result = generateTile(draft),
      oldOwners = new Map(tile.cells.filter((cell) => cell.fieldId).map((cell) => [cell.id, cell])),
      portalIds = new Set(
        centralSideCells(result.cells, result.center.polygon).flatMap((ids) => [...ids]),
      );
    let changed = 0;
    for (const cell of result.cells) {
      if (
        !cell.fieldId ||
        cell.fieldId === 'center' ||
        portalIds.has(cell.id) ||
        oldOwners.has(cell.id)
      )
        continue;
      changed++;
      const candidates = [...oldOwners.values()].filter(
        (previous) => previous.fieldId === cell.fieldId && sourceId(previous) === sourceId(cell),
      );
      expect(
        candidates.some((previous) =>
          previous.surfacePolygons.some((a) =>
            cell.surfacePolygons.some((b) => polygonArea(clipPolygon(a, b)) > 1e-12),
          ),
        ),
      ).toBe(true);
    }
    expect(changed).toBeGreaterThan(0);
  });

  it.each([
    ['hex', 'local-cut-a', 18, 0.25],
    ['hex', 'local-cut-b', 24, 0.7],
    ['diamond', 'local-cut-a', 18, 0.25],
    ['diamond', 'local-cut-b', 24, 0.7],
  ] as const)(
    'keeps structural ownership and exact area across seeded %s center edits (%s)',
    (kind, seed, divisions, portalWidth) => {
      const config = structuredClone(defaultConfig);
      config.grid.kind = kind;
      config.grid.divisions = divisions;
      config.center.portalWidth = portalWidth;
      config.seed = seed;
      config.decoration.enabled = false;
      const tile = generateTile(config);
      for (const [rotation, x, y] of [
        [17, 0.055, -0.03],
        [-31, -0.045, 0.05],
      ]) {
        const draft = prepareCenterEdit(config, tile, {
            ...config.center,
            rotation: rotation!,
            offset: { x: x!, y: y! },
          }),
          result = generateTile(draft);
        expect(result.fields.map((field) => field.id)).toEqual(
          tile.fields.map((field) => field.id),
        );
        expect(result.entrances).toEqual(tile.entrances);
        expect(result.warnings.some((warning) => warning.includes('ignoriert'))).toBe(false);
        assertStructuralGeometry(result);
      }
    },
  );
});
