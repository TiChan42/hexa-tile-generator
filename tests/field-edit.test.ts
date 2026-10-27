import { describe, expect, it } from 'vitest';
import {
  boundaryCells,
  centralSideCells,
  defaultConfig,
  fieldArea,
  generateTile,
  isConnectedSelection,
  MIN_FIELD_AREA,
  prepareFieldShapeEdit,
  validateFieldShapeSelection,
} from '../src/core';
import type { GameField, GeneratedTile, TileConfig } from '../src/core';
import { adjustFieldShapeLine } from '../src/core/field-edit';

function fixture(): { config: TileConfig; tile: GeneratedTile } {
  const config = structuredClone(defaultConfig);
  config.decoration.enabled = false;
  return { config, tile: generateTile(config) };
}
function freeInterior(tile: GeneratedTile): string[] {
  const outer = new Set(
    Array.from({ length: 6 }, (_, side) => boundaryCells(tile.cells, side)).flatMap((cells) =>
      cells.map((cell) => cell.id),
    ),
  );
  return tile.cells
    .filter(
      (cell) =>
        !cell.fieldId && !cell.landscapeOnly && cell.surfacePolygons.length && !outer.has(cell.id),
    )
    .map((cell) => cell.id);
}
function growCandidate(tile: GeneratedTile, field: GameField): string | undefined {
  const owned = new Set(field.cellIds);
  return freeInterior(tile).find((id) =>
    tile.cells.find((cell) => cell.id === id)!.neighbors.some((next) => owned.has(next)),
  );
}
function freeConnectedField(tile: GeneratedTile): string[] {
  const map = new Map(tile.cells.map((cell) => [cell.id, cell])),
    free = new Set(freeInterior(tile));
  for (const first of free) {
    if (
      !map
        .get(first)!
        .neighbors.some((id) => map.get(id)!.fieldId && map.get(id)!.fieldId !== 'center')
    )
      continue;
    const ids = [first],
      seen = new Set(ids);
    for (let i = 0; i < ids.length; i++) {
      if (fieldArea(ids, map) + 1e-10 >= MIN_FIELD_AREA) return ids;
      for (const id of map.get(ids[i]!)!.neighbors)
        if (free.has(id) && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
    }
  }
  throw new Error('Fixture has no free connected field.');
}
function editableEntry(tile: GeneratedTile): { field: GameField; added: string; removed: string } {
  const map = new Map(tile.cells.map((cell) => [cell.id, cell]));
  for (const entry of tile.entrances) {
    const field = tile.fields.find((field) => field.id === entry.fieldId)!,
      added = growCandidate(tile, field);
    if (!added) continue;
    for (const removed of field.cellIds) {
      if (entry.cellIds.includes(removed)) continue;
      if (
        map
          .get(removed)!
          .neighbors.some((id) => map.get(id)!.fieldId && map.get(id)!.fieldId !== field.id)
      )
        continue;
      const ids = [...field.cellIds.filter((id) => id !== removed), added];
      if (isConnectedSelection(ids, tile.cells) && fieldArea(ids, map) + 1e-10 >= MIN_FIELD_AREA)
        return { field, added, removed };
    }
  }
  throw new Error('Fixture has no editable inner entrance cell.');
}

describe('pure visible-board field shape edits', () => {
  it('adds and removes complete horizontal and vertical raster lines without disconnecting the selection', () => {
    const { tile } = fixture();
    for (const [axis, coordinate] of [
      ['horizontal', (point: { x: number; y: number }) => point.y],
      ['vertical', (point: { x: number; y: number }) => point.x],
    ] as const) {
      let selected: string[] | undefined, expanded: string[] | undefined;
      for (const cell of tile.cells) {
        if (
          cell.fieldId ||
          cell.landscapeOnly ||
          cell.entranceSide !== undefined ||
          cell.centerPort !== undefined ||
          !cell.surfacePolygons.length
        )
          continue;
        const next = adjustFieldShapeLine(tile, [cell.id], axis, 1, null);
        if (next.length > 1) {
          selected = [cell.id];
          expanded = next;
          break;
        }
      }
      expect(expanded, `expected a free ${axis} line to be available`).toBeDefined();
      expect(isConnectedSelection(expanded!, tile.cells)).toBe(true);
      const pointFor = (id: string) => {
        const cell = tile.cells.find((candidate) => candidate.id === id)!;
        return cell.rasterCenter ?? cell.center;
      };
      const before = new Set(selected!.map((id) => coordinate(pointFor(id)).toFixed(6)));
      const after = new Set(expanded!.map((id) => coordinate(pointFor(id)).toFixed(6)));
      expect(after.size).toBe(before.size + 1);

      const contracted = adjustFieldShapeLine(tile, expanded!, axis, -1, null);
      expect(new Set(contracted.map((id) => coordinate(pointFor(id)).toFixed(6))).size).toBe(
        after.size - 1,
      );
      expect(isConnectedSelection(contracted, tile.cells)).toBe(true);
    }
  });
  it('validates a live selection without materializing fields or mutating the source board', () => {
    const { config, tile } = fixture();
    const beforeConfig = structuredClone(config),
      beforeTile = structuredClone(tile);
    const field = tile.fields.find((field) => !field.isCenter)!;
    const selection = [...field.cellIds, field.cellIds[0]!];
    const result = validateFieldShapeSelection(config, tile, field.id, selection);
    expect(result).toEqual({
      original: field,
      ids: field.cellIds,
      nextCount: config.paths.fieldCount,
      warnings: [],
    });
    expect(config).toEqual(beforeConfig);
    expect(tile).toEqual(beforeTile);
    expect(selection).toHaveLength(field.cellIds.length + 1);
    const fresh = validateFieldShapeSelection(config, tile, null, freeConnectedField(tile));
    expect(fresh.original).toBeUndefined();
    expect(fresh.nextCount).toBe(tile.fields.length + 1);
    expect(() => validateFieldShapeSelection(config, tile, null, [])).toThrow(
      'mindestens eine Rasterzelle',
    );
    expect(() => validateFieldShapeSelection(config, tile, ' ', field.cellIds)).toThrow('gültige');
  });
  it('materializes every automatic field unchanged without forcing generated colors into overrides', () => {
    const { config, tile } = fixture(),
      before = structuredClone(config),
      field = tile.fields.find(
        (field) => !field.isCenter && !tile.entrances.some((entry) => entry.fieldId === field.id),
      )!;
    const draft = prepareFieldShapeEdit(config, tile, field.id, field.cellIds);
    expect(config).toEqual(before);
    expect(draft).not.toBe(config);
    expect(draft.paths.auto).toBe(false);
    expect(draft.paths.enabled).toBe(true);
    expect(draft.paths.fields).toHaveLength(tile.fields.length - 1);
    for (const visible of tile.fields.filter((field) => !field.isCenter)) {
      const frozen = draft.paths.fields.find((field) => field.id === visible.id)!;
      expect(frozen.cellIds).toEqual(visible.cellIds);
      expect(frozen.action).toBe(visible.action);
      expect(frozen.label).toBe(visible.label);
      expect(Object.hasOwn(frozen, 'color')).toBe(false);
    }
    expect(generateTile(draft)).toEqual(tile);
    expect(prepareFieldShapeEdit(config, tile, field.id, field.cellIds)).toEqual(draft);
  });
  it('preserves center metadata and original per-field overrides while retaining gradient-driven colors', () => {
    const { config, tile: initial } = fixture(),
      first = initial.fields.find((field) => !field.isCenter)!,
      other = initial.fields.find((field) => !field.isCenter && field.id !== first.id)!;
    const center = {
      id: 'center',
      cellIds: [],
      action: 'shop' as const,
      label: 'Zentrale',
      color: '#fedcba',
      heightOffset: 0.07,
      heightMode: 'terraced' as const,
    };
    config.paths.fields = [
      center,
      {
        id: first.id,
        cellIds: [],
        action: 'alb',
        label: 'Waldtor',
        color: '#123456',
        heightOffset: 0.05,
        heightMode: 'terraced',
      },
    ];
    const tile = generateTile(config),
      field = tile.fields.find((field) => field.id === other.id)!,
      draft = prepareFieldShapeEdit(config, tile, field.id, field.cellIds);
    expect(draft.paths.fields.find((field) => field.id === 'center')).toEqual(center);
    expect(draft.paths.fields.find((field) => field.id === first.id)).toEqual({
      ...config.paths.fields[1]!,
      cellIds: tile.fields.find((field) => field.id === first.id)!.cellIds,
    });
    expect(generateTile(draft)).toEqual(tile);
    draft.paths.gradient = [
      { at: 0, color: '#000000' },
      { at: 1, color: '#ffffff' },
    ];
    const changed = generateTile(draft);
    expect(changed.fields.find((field) => field.id === first.id)!.color).toBe('#123456');
    expect(changed.fields.find((field) => field.id === other.id)!.color).not.toBe(field.color);
  });
  it('adds and removes inner entrance cells while preserving the complete immutable mouth and every other field', () => {
    const { config, tile } = fixture(),
      { field, added, removed } = editableEntry(tile),
      entry = tile.entrances.find((entry) => entry.fieldId === field.id)!;
    const expanded = prepareFieldShapeEdit(config, tile, field.id, [...field.cellIds, added]),
      expandedTile = generateTile(expanded);
    expect(expandedTile.fields.find((visible) => visible.id === field.id)!.cellIds).toEqual([
      ...field.cellIds,
      added,
    ]);
    const ids = [...field.cellIds.filter((id) => id !== removed), added],
      draft = prepareFieldShapeEdit(expanded, expandedTile, field.id, ids),
      edited = generateTile(draft);
    expect(edited.stats.connected).toBe(true);
    expect(edited.fields).toHaveLength(tile.fields.length);
    expect(edited.fields.find((visible) => visible.id === field.id)!.cellIds).toEqual(ids);
    expect(edited.entrances.find((visible) => visible.side === entry.side)!.fieldId).toBe(field.id);
    expect(entry.cellIds.every((id) => ids.includes(id))).toBe(true);
    for (const other of tile.fields.filter((other) => other.id !== field.id))
      expect(edited.fields.find((visible) => visible.id === other.id)).toEqual(other);
  });
  it('rejects removal of any owned mouth cell and keeps foreign visible fields protected', () => {
    const { config, tile } = fixture(),
      entry = tile.entrances[0]!,
      field = tile.fields.find((field) => field.id === entry.fieldId)!,
      foreign = tile.fields.find((other) => !other.isCenter && other.id !== field.id)!;
    expect(() =>
      prepareFieldShapeEdit(
        config,
        tile,
        field.id,
        field.cellIds.filter((id) => id !== entry.cellIds[0]),
      ),
    ).toThrow('Eingangsmündung');
    expect(() =>
      prepareFieldShapeEdit(config, tile, field.id, [...field.cellIds, foreign.cellIds[0]!]),
    ).toThrow('anderen sichtbaren Spielfeld');
  });
  it('keeps the outer contact restricted to the immutable mouth instead of any other boundary cell', () => {
    const { config, tile } = fixture(),
      entry = tile.entrances[0]!,
      field = tile.fields.find((field) => field.id === entry.fieldId)!;
    const extra = boundaryCells(tile.cells, entry.side).find(
      (cell) =>
        !cell.fieldId &&
        !entry.cellIds.includes(cell.id) &&
        cell.neighbors.some((id) => field.cellIds.includes(id)),
    )!;
    expect(extra).toBeDefined();
    expect(() =>
      prepareFieldShapeEdit(config, tile, field.id, [...field.cellIds, extra.id]),
    ).toThrow('Nur die mittigen Mündungszellen');
  });
  it('rejects missing cells, center pieces and corner landscape while warning about small or disconnected selections', () => {
    const { config, tile } = fixture(),
      field = tile.fields.find((field) => !field.isCenter)!,
      free = freeInterior(tile),
      far = free.find(
        (id) =>
          !tile.cells
            .find((cell) => cell.id === id)!
            .neighbors.some((next) => field.cellIds.includes(next)),
      )!;
    expect(() => prepareFieldShapeEdit(config, tile, field.id, ['missing'])).toThrow(
      'nicht existieren',
    );
    const separated = validateFieldShapeSelection(config, tile, field.id, [...field.cellIds, far]);
    expect(separated.warnings.some((issue) => issue.code === 'field-connectivity')).toBe(true);
    expect(() => prepareFieldShapeEdit(config, tile, field.id, separated.ids)).not.toThrow();
    expect(() =>
      prepareFieldShapeEdit(config, tile, field.id, [
        ...field.cellIds,
        tile.fields[0]!.cellIds[0]!,
      ]),
    ).toThrow('Pentagon ist reserviert');
    expect(() =>
      prepareFieldShapeEdit(config, tile, field.id, [
        ...field.cellIds,
        tile.cells.find((cell) => cell.landscapeOnly)!.id,
      ]),
    ).toThrow('Landschaftsecken');
    const tiny = validateFieldShapeSelection(config, tile, 'new-tiny', [free[0]!]);
    expect(tiny.warnings.some((issue) => issue.code === 'minimum-area')).toBe(true);
    expect(() => prepareFieldShapeEdit(config, tile, 'new-tiny', tiny.ids)).not.toThrow();
    expect(() => prepareFieldShapeEdit(config, tile, 'center', tile.fields[0]!.cellIds)).toThrow(
      'Pentagon-Einstellungen',
    );
  });
  it('preserves manual objects except those on newly claimed cells', () => {
    const { config, tile } = fixture(),
      { field, added, removed } = editableEntry(tile),
      unrelated = freeInterior(tile).find((id) => id !== added)!;
    config.decoration.placements = [
      {
        id: 'new-ground',
        kind: 'rock',
        cellId: added,
        offset: { x: 0, y: 0 },
        scale: 1,
        rotation: 0,
      },
      {
        id: 'released-ground',
        kind: 'bush',
        cellId: removed,
        offset: { x: 0, y: 0 },
        scale: 1,
        rotation: 0,
      },
      {
        id: 'unrelated',
        kind: 'crystal',
        cellId: unrelated,
        offset: { x: 0, y: 0 },
        scale: 1,
        rotation: 0,
      },
    ];
    const before = structuredClone(config),
      draft = prepareFieldShapeEdit(config, tile, field.id, [
        ...field.cellIds.filter((id) => id !== removed),
        added,
      ]);
    expect(draft.decoration.placements).toEqual(config.decoration.placements.slice(1));
    expect(config).toEqual(before);
  });
  it('allows a new complete unowned mouth while an incomplete manual plan grows toward its requested count', () => {
    const { config } = fixture();
    config.paths.enabled = false;
    config.paths.fieldCount = 7;
    const tile = generateTile(config),
      entry = tile.entrances[0]!;
    expect(entry.fieldId).toBeNull();
    const interior = freeInterior(tile)[0]!;
    expect(validateFieldShapeSelection(config, tile, null, [interior]).ids).toEqual([interior]);
    const draft = prepareFieldShapeEdit(config, tile, 'first-entry', entry.footprintCellIds),
      edited = generateTile(draft);
    expect(draft.paths.fieldCount).toBe(7);
    expect(draft.paths.auto).toBe(false);
    expect(draft.paths.fields).toEqual([
      { id: 'first-entry', cellIds: entry.footprintCellIds, action: 'event', label: 'Spielfeld 1' },
    ]);
    expect(edited.fields).toHaveLength(2);
    expect(edited.entrances[0]!.fieldId).toBe('first-entry');
  });
  it('updates a complete board count by one for a new field and rejects more than24 visible fields', () => {
    const { config, tile } = fixture(),
      ids = freeConnectedField(tile),
      draft = prepareFieldShapeEdit(config, tile, 'new', ids),
      edited = generateTile(draft);
    expect(draft.paths.fieldCount).toBe(tile.fields.length + 1);
    expect(edited.fields).toHaveLength(tile.fields.length + 1);
    expect(edited.stats.connected).toBe(true);
    expect(draft.paths.fields.find((field) => field.id === 'new')).toEqual({
      id: 'new',
      cellIds: ids,
      action: 'event',
      label: `Spielfeld ${tile.fields.length}`,
    });
    const full = structuredClone(config);
    full.grid.divisions = 24;
    full.paths.fieldCount = 24;
    const fullTile = generateTile(full);
    expect(fullTile.fields).toHaveLength(24);
    expect(() => prepareFieldShapeEdit(full, fullTile, 'field-25', [])).toThrow('höchstens 24');
  });
  it('requires a selected portal to stay complete before the worker checks the full graph', () => {
    const { config, tile } = fixture(),
      map = new Map(tile.cells.map((cell) => [cell.id, cell]));
    let selection: { id: string; cells: string[] } | undefined;
    for (const portal of centralSideCells(tile.cells, tile.center.polygon)) {
      const owner = tile.fields.find((field) =>
        [...portal].some((id) => field.cellIds.includes(id)),
      )!;
      if (!owner) continue;
      for (const removed of portal) {
        const cells = owner.cellIds.filter((id) => id !== removed);
        if (
          portal.size > 1 &&
          isConnectedSelection(cells, tile.cells) &&
          fieldArea(cells, map) + 1e-10 >= MIN_FIELD_AREA
        ) {
          selection = { id: owner.id, cells };
          break;
        }
      }
      if (selection) break;
    }
    expect(selection).toBeDefined();
    expect(() => prepareFieldShapeEdit(config, tile, selection!.id, selection!.cells)).toThrow(
      'Pentagon-Anschluss vollständig',
    );
  });
});
