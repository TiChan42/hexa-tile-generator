import { describe, expect, it } from 'vitest';
import {
  boundaryCells,
  defaultConfig,
  evaluateTileRules,
  generateTile,
  getExportRuleIssues,
  isConnectedSelection,
  polygonArea,
  prepareFieldShapeEdit,
  validateFieldShapeSelection,
} from '../src/core';
import type { GeneratedTile, TileConfig } from '../src/core';
import { buildTileSurfaces } from '../src/render/surfaces';
import { buildFieldBorders } from '../src/render/borders';

function fixture(): { config: TileConfig; tile: GeneratedTile } {
  const config = structuredClone(defaultConfig);
  config.decoration.enabled = false;
  return { config, tile: generateTile(config) };
}
function freeInterior(tile: GeneratedTile): string[] {
  const outside = new Set(
    Array.from({ length: 6 }, (_, side) => boundaryCells(tile.cells, side)).flatMap((cells) =>
      cells.map((cell) => cell.id),
    ),
  );
  return tile.cells
    .filter(
      (cell) =>
        !cell.fieldId &&
        !cell.landscapeOnly &&
        cell.surfacePolygons.length &&
        cell.centerPort === undefined &&
        !outside.has(cell.id),
    )
    .map((cell) => cell.id);
}
function disconnectedSelection(
  tile: GeneratedTile,
  island: boolean,
): { fieldId: string; cellIds: string[] } {
  const field = tile.fields.find((field) => !field.isCenter)!,
    own = new Set(field.cellIds),
    map = new Map(tile.cells.map((cell) => [cell.id, cell]));
  const id = freeInterior(tile).find((id) => {
    const neighbors = map.get(id)!.neighbors;
    if (neighbors.some((next) => own.has(next))) return false;
    return island
      ? neighbors.every((next) => !map.get(next)!.fieldId)
      : neighbors.some((next) => map.get(next)!.fieldId && map.get(next)!.fieldId !== field.id);
  });
  if (!id) throw new Error('Missing disconnected-selection fixture.');
  return { fieldId: field.id, cellIds: [...field.cellIds, id] };
}

describe('advisory gameplay rules and optional export gate', () => {
  it('keeps the normal automatic layout unchanged while the minimum is only an evaluation threshold', () => {
    const { config, tile } = fixture();
    config.rules.minFieldArea = 0.5;
    const high = generateTile(config),
      issues = evaluateTileRules(config, high);
    expect(high.cells).toEqual(tile.cells);
    expect(high.fields).toEqual(tile.fields);
    expect(high.connections).toEqual(tile.connections);
    expect(issues.filter((issue) => issue.code === 'minimum-area')).toHaveLength(
      tile.fields.length - 1,
    );
    expect(issues.every((issue) => issue.fieldId !== 'center')).toBe(true);
    expect(high.warnings).toEqual([...new Set(high.warnings)]);
    for (const issue of issues)
      expect(high.warnings.filter((message) => message === issue.message)).toHaveLength(1);
    expect(getExportRuleIssues(config, high)).toEqual(issues);
    config.rules.exportPolicy = 'warn';
    expect(getExportRuleIssues(config, high)).toEqual([]);
    expect(evaluateTileRules(config, high)).toEqual(issues);
  });
  it('accepts a one-cell edit, preserves it in generation and reports a configurable minimum warning', () => {
    const { config, tile } = fixture(),
      id = freeInterior(tile)[0]!,
      area = polygonArea(tile.cells.find((cell) => cell.id === id)!.polygon);
    const selection = validateFieldShapeSelection(config, tile, 'small', [id]);
    expect(selection.warnings).toEqual([
      expect.objectContaining({ code: 'minimum-area', fieldId: 'small' }),
    ]);
    const draft = prepareFieldShapeEdit(config, tile, 'small', [id]),
      edited = generateTile(draft);
    expect(edited.fields.find((field) => field.id === 'small')!.cellIds).toEqual([id]);
    expect(
      evaluateTileRules(draft, edited).some(
        (issue) => issue.code === 'minimum-area' && issue.fieldId === 'small',
      ),
    ).toBe(true);
    draft.rules.minFieldArea = area;
    expect(
      evaluateTileRules(draft, edited).some(
        (issue) => issue.code === 'minimum-area' && issue.fieldId === 'small',
      ),
    ).toBe(false);
    draft.rules.minFieldArea = 0;
    expect(validateFieldShapeSelection(draft, edited, 'small', [id]).warnings).toEqual([]);
  });
  it('preserves disconnected manual fields and independently applies local and global connectivity checks', () => {
    const { config, tile } = fixture(),
      selection = disconnectedSelection(tile, true),
      checked = validateFieldShapeSelection(config, tile, selection.fieldId, selection.cellIds);
    expect(checked.warnings.map((issue) => issue.code)).toEqual(['field-connectivity']);
    const draft = prepareFieldShapeEdit(config, tile, selection.fieldId, selection.cellIds),
      edited = generateTile(draft),
      field = edited.fields.find((field) => field.id === selection.fieldId)!;
    expect(field.cellIds).toEqual(selection.cellIds);
    expect(edited.stats.connected).toBe(false);
    expect(isConnectedSelection(field.cellIds, edited.cells)).toBe(false);
    expect(evaluateTileRules(draft, edited).map((issue) => issue.code)).toEqual([
      'field-connectivity',
      'path-connectivity',
    ]);
    draft.rules.requireFieldConnectivity = false;
    expect(evaluateTileRules(draft, edited).map((issue) => issue.code)).toEqual([
      'path-connectivity',
    ]);
    draft.rules.requirePathConnectivity = false;
    expect(evaluateTileRules(draft, edited)).toEqual([]);
    expect(getExportRuleIssues(draft, edited)).toEqual([]);
    draft.rules.requireFieldConnectivity = true;
    expect(evaluateTileRules(draft, edited).map((issue) => issue.code)).toEqual([
      'field-connectivity',
    ]);
  });
  it('distinguishes a split field from a globally connected path through another field', () => {
    const { config, tile } = fixture(),
      selection = disconnectedSelection(tile, false),
      draft = prepareFieldShapeEdit(config, tile, selection.fieldId, selection.cellIds),
      edited = generateTile(draft);
    expect(evaluateTileRules(draft, edited).map((issue) => issue.code)).toEqual([
      'field-connectivity',
    ]);
    draft.rules.requireFieldConnectivity = false;
    expect(getExportRuleIssues(draft, edited)).toEqual([]);
  });
  it('does not create phantom path problems when path generation is disabled', () => {
    const { config } = fixture();
    config.paths.enabled = false;
    const tile = generateTile(config);
    expect(tile.entrances.some((entrance) => entrance.fieldId === null)).toBe(true);
    expect(evaluateTileRules(config, tile)).toEqual([]);
    expect(getExportRuleIssues(config, tile)).toEqual([]);
  });
  it('does not turn a requested-count warning or an ordinary generator warning into an export blocker', () => {
    const { config, tile } = fixture();
    config.paths.fieldCount = 24;
    tile.warnings.push('Die gewünschte Feldzahl ist nicht erreichbar.');
    expect(getExportRuleIssues(config, tile)).toEqual([]);
    const changed = structuredClone(tile);
    changed.entrances[0]!.fieldId = null;
    expect(evaluateTileRules(config, changed).map((issue) => issue.code)).toEqual([
      'path-connectivity',
    ]);
    config.rules.requirePathConnectivity = false;
    expect(getExportRuleIssues(config, changed)).toEqual([]);
  });
  it('keeps true structural errors hard even with all gameplay checks disabled', () => {
    const { config, tile } = fixture();
    config.rules = {
      minFieldArea: 0,
      requireFieldConnectivity: false,
      requirePathConnectivity: false,
      exportPolicy: 'warn',
    };
    const field = tile.fields.find((field) => !field.isCenter)!,
      foreign = tile.fields.find((other) => !other.isCenter && other.id !== field.id)!;
    expect(() => validateFieldShapeSelection(config, tile, field.id, ['missing'])).toThrow(
      'nicht existieren',
    );
    expect(() =>
      validateFieldShapeSelection(config, tile, field.id, [...field.cellIds, foreign.cellIds[0]!]),
    ).toThrow('anderen sichtbaren Spielfeld');
    expect(() =>
      validateFieldShapeSelection(config, tile, field.id, [
        ...field.cellIds,
        tile.cells.find((cell) => cell.landscapeOnly)!.id,
      ]),
    ).toThrow('Landschaftsecken');
    const entrance = tile.entrances[0]!,
      owner = tile.fields.find((field) => field.id === entrance.fieldId)!;
    expect(() =>
      validateFieldShapeSelection(
        config,
        tile,
        owner.id,
        owner.cellIds.filter((id) => id !== entrance.cellIds[0]),
      ),
    ).toThrow('Eingangsmündung');
  });
  it('builds finite horizontal caps and vertical walls for tiny, separated fields with a zero minimum', () => {
    const { config } = fixture();
    config.paths.enabled = false;
    config.rules = {
      minFieldArea: 0,
      requireFieldConnectivity: false,
      requirePathConnectivity: false,
      exportPolicy: 'block',
    };
    const blank = generateTile(config),
      free = freeInterior(blank),
      cells = [...free].sort(
        (a, b) =>
          polygonArea(blank.cells.find((cell) => cell.id === a)!.polygon) -
          polygonArea(blank.cells.find((cell) => cell.id === b)!.polygon),
      );
    const first = cells[0]!,
      second = cells.find(
        (id) =>
          id !== first && !blank.cells.find((cell) => cell.id === first)!.neighbors.includes(id),
      )!;
    const draft = prepareFieldShapeEdit(config, blank, 'tiny-islands', [first, second]),
      tile = generateTile(draft),
      field = tile.fields.find((field) => field.id === 'tiny-islands')!;
    expect(field.cellIds).toHaveLength(2);
    expect(getExportRuleIssues(draft, tile)).toEqual([]);
    const surfaces = buildTileSurfaces(tile, draft),
      borders = buildFieldBorders(tile, surfaces.geometry);
    for (const geometry of [surfaces.geometry, borders.geometry])
      expect([...geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true);
    const normal = surfaces.geometry.getAttribute('normal');
    for (let i = 0; i < normal.count; i++)
      expect(
        Math.abs(normal.getY(i)) < 1e-6 ||
          (Math.abs(normal.getX(i)) < 1e-6 && Math.abs(normal.getZ(i)) < 1e-6),
      ).toBe(true);
    surfaces.geometry.dispose();
    borders.geometry.dispose();
  });
});
