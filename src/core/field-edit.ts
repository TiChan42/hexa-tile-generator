import { preserveChangedFieldColors } from './preserve-colors';
import { boundaryCells, isConnectedSelection } from './geometry';
import { centralSideCells } from './center-sides';
import { evaluateFieldShapeRules } from './rules';
import type { RuleIssue } from './rules';
import type { FieldEdit, GameField, GeneratedTile, TileConfig } from './types';

export type FieldShapeAxis = 'horizontal' | 'vertical';

interface RasterGroup {
  key: string;
  cells: GeneratedTile['cells'];
  coordinate: number;
}

/** Add or remove one connected raster band while respecting fixed mouths and center portals. */
export function adjustFieldShapeLine(
  tile: GeneratedTile,
  cellIds: readonly string[],
  axis: FieldShapeAxis,
  direction: -1 | 1,
  fieldId: string | null,
): string[] {
  const selected = new Set(cellIds),
    cellsById = new Map(tile.cells.map((cell) => [cell.id, cell]));
  if (!selected.size || [...selected].some((id) => !cellsById.has(id))) return [...cellIds];

  const grouped = new Map<string, GeneratedTile['cells']>();
  for (const cell of tile.cells) {
    const key = cell.rasterId ?? cell.id,
      group = grouped.get(key) ?? [];
    group.push(cell);
    grouped.set(key, group);
  }
  const coordinate = (cell: GeneratedTile['cells'][number]) =>
    axis === 'horizontal'
      ? (cell.rasterCenter ?? cell.center).y
      : (cell.rasterCenter ?? cell.center).x;
  const groups: RasterGroup[] = [...grouped].map(([key, members]) => ({
    key,
    cells: members,
    coordinate: coordinate(members[0]!),
  }));
  const selectedGroups = groups.filter((group) =>
    group.cells.some((cell) => selected.has(cell.id)),
  );
  if (!selectedGroups.length) return [...cellIds];

  const min = Math.min(...selectedGroups.map((group) => group.coordinate));
  const max = Math.max(...selectedGroups.map((group) => group.coordinate));
  const selectedIds = [...selected];
  const protectedCell = (cell: GeneratedTile['cells'][number]) =>
    cell.entranceSide !== undefined || cell.centerPort !== undefined || cell.landscapeOnly === true;

  if (direction < 0) {
    const lineFor = (side: -1 | 1) => {
      const edge = side < 0 ? min : max;
      return selectedGroups.filter((group) => Math.abs(group.coordinate - edge) < 1e-8);
    };
    const removable = (side: -1 | 1) => {
      const line = lineFor(side);
      if (!line.length || line.some((group) => group.cells.some(protectedCell))) return null;
      const removed = new Set(line.flatMap((group) => group.cells.map((cell) => cell.id)));
      const next = selectedIds.filter((id) => !removed.has(id));
      return next.length && isConnectedSelection(next, tile.cells) ? { line, next } : null;
    };
    const negative = removable(-1),
      positive = removable(1);
    if (!negative && !positive) return selectedIds;
    if (!negative) return positive!.next;
    if (!positive) return negative.next;
    return negative.line.length <= positive.line.length ? negative.next : positive.next;
  }

  const available = groups.filter(
    (group) =>
      !group.cells.some((cell) => selected.has(cell.id)) &&
      group.cells.every(
        (cell) =>
          cell.surfacePolygons.length > 0 &&
          !protectedCell(cell) &&
          (!cell.fieldId || cell.fieldId === fieldId),
      ) &&
      group.cells.some((cell) => cell.neighbors.some((id) => selected.has(id))),
  );
  const sideFor = (group: RasterGroup): -1 | 0 | 1 =>
    group.coordinate < min - 1e-8 ? -1 : group.coordinate > max + 1e-8 ? 1 : 0;
  const negative = available.filter((group) => sideFor(group) === -1),
    positive = available.filter((group) => sideFor(group) === 1);
  if (!negative.length && !positive.length) return selectedIds;

  const selectedMidpoint = (min + max) / 2,
    negativeWeight = selectedGroups.filter((group) => group.coordinate < selectedMidpoint).length,
    positiveWeight = selectedGroups.filter((group) => group.coordinate > selectedMidpoint).length;
  const side: -1 | 1 = !negative.length
    ? 1
    : !positive.length
      ? -1
      : negativeWeight <= positiveWeight
        ? -1
        : 1;
  const candidates = side < 0 ? negative : positive,
    extension = Math.min(
      ...candidates.map((group) => (side < 0 ? min - group.coordinate : group.coordinate - max)),
    ),
    line = candidates.filter(
      (group) =>
        Math.abs((side < 0 ? min - group.coordinate : group.coordinate - max) - extension) < 1e-8,
    );
  const next = new Set(selectedIds);
  line.forEach((group) => group.cells.forEach((cell) => next.add(cell.id)));
  const result = [...next];
  return isConnectedSelection(result, tile.cells) ? result : selectedIds;
}

/** Check a draft selection without cloning a project or changing the generated board. */
export function validateFieldShapeSelection(
  config: TileConfig,
  tile: GeneratedTile,
  fieldId: string | null,
  cellIds: string[],
): { original: GameField | undefined; ids: string[]; nextCount: number; warnings: RuleIssue[] } {
  if (fieldId !== null && (!fieldId.trim() || fieldId.length > 100))
    throw new Error('Das Spielfeld benötigt eine gültige, eindeutige Feld-ID.');
  const original = tile.fields.find((field) => field.id === fieldId);
  if (fieldId === 'center' || original?.isCenter)
    throw new Error('Die Form des Pentagons wird über die Pentagon-Einstellungen bearbeitet.');
  const nextCount = original
    ? config.paths.fieldCount
    : Math.max(config.paths.fieldCount, tile.fields.length + 1);
  if (nextCount > 24)
    throw new Error(
      'Eine Kachel kann höchstens 24 Spielfelder einschließlich des Pentagons enthalten.',
    );
  const ids = [...new Set(cellIds)],
    selected = new Set(ids),
    cells = new Map(tile.cells.map((cell) => [cell.id, cell]));
  if (!ids.length) throw new Error('Wähle mindestens eine Rasterzelle für das Spielfeld aus.');
  if (ids.some((id) => !cells.has(id)))
    throw new Error('Die Auswahl enthält Rasterzellen, die in dieser Kachel nicht existieren.');
  if (ids.some((id) => !cells.get(id)!.surfacePolygons.length))
    throw new Error('Das Pentagon ist reserviert. Wähle Rasterstücke außerhalb seiner Fläche.');
  if (ids.some((id) => cells.get(id)!.landscapeOnly))
    throw new Error('Die Landschaftsecken am Pentagon dürfen nicht zu einem Spielfeld gehören.');
  if (
    tile.fields.some(
      (field) => field.id !== fieldId && field.cellIds.some((id) => selected.has(id)),
    )
  )
    throw new Error(
      'Die Auswahl gehört teilweise zu einem anderen sichtbaren Spielfeld. Dessen Form bleibt erhalten.',
    );
  for (const entrance of tile.entrances)
    if (
      fieldId !== null &&
      entrance.fieldId === fieldId &&
      !entrance.cellIds.every((id) => selected.has(id))
    )
      throw new Error(
        `Die feste Eingangsmündung an Seite ${entrance.side + 1} muss vollständig erhalten bleiben.`,
      );
  for (let side = 0; side < 6; side++) {
    const boundary = boundaryCells(tile.cells, side),
      contact = boundary.filter((cell) => selected.has(cell.id));
    if (!contact.length) continue;
    const entrance = tile.entrances.find((entry) => entry.side === side);
    if (!entrance)
      throw new Error(`Die Außenkante an Seite ${side + 1} besitzt keinen aktiven Eingang.`);
    if (
      (entrance.fieldId && entrance.fieldId !== fieldId) ||
      tile.fields.some(
        (field) => field.id !== fieldId && boundary.some((cell) => field.cellIds.includes(cell.id)),
      )
    )
      throw new Error(
        `Die Außenkante an Seite ${side + 1} gehört bereits einem anderen Spielfeld.`,
      );
    if (!entrance.cellIds.every((id) => selected.has(id)))
      throw new Error(
        `Die feste Eingangsmündung an Seite ${side + 1} muss vollständig belegt werden.`,
      );
    if (contact.some((cell) => !entrance.cellIds.includes(cell.id)))
      throw new Error(
        `Nur die mittigen Mündungszellen dürfen die Außenkante an Seite ${side + 1} berühren.`,
      );
  }
  if (
    centralSideCells(tile.cells, tile.center.polygon).some(
      (portal) =>
        [...portal].some((id) => selected.has(id)) && [...portal].some((id) => !selected.has(id)),
    )
  )
    throw new Error(
      'Übernimm einen mittigen Pentagon-Anschluss vollständig oder lasse ihn frei. Die Landschaftsecken bleiben erhalten.',
    );
  return {
    original,
    ids,
    nextCount,
    warnings: evaluateFieldShapeRules(config, tile, fieldId, ids),
  };
}

/** Materialize the visible board before changing one normal field; never regenerate its neighbors. */
export function prepareFieldShapeEdit(
  config: TileConfig,
  tile: GeneratedTile,
  fieldId: string,
  cellIds: string[],
): TileConfig {
  const { original, ids, nextCount } = validateFieldShapeSelection(config, tile, fieldId, cellIds);
  const draft = structuredClone(config),
    edits = new Map(config.paths.fields.map((field) => [field.id, field]));
  const snapshot: FieldEdit[] = tile.fields
    .filter((field) => !field.isCenter)
    .map((field) => ({
      ...(edits.get(field.id) ?? {}),
      id: field.id,
      cellIds: [...field.cellIds],
      action: field.action,
      label: field.label,
    }));
  if (original) snapshot.find((field) => field.id === fieldId)!.cellIds = ids;
  else
    snapshot.push({
      ...(edits.get(fieldId) ?? {}),
      id: fieldId,
      cellIds: ids,
      action: 'event',
      label: `Spielfeld ${tile.fields.length}`,
    });
  const centerEdit = edits.get('center');
  draft.paths.fields = centerEdit
    ? [structuredClone(centerEdit), ...structuredClone(snapshot)]
    : structuredClone(snapshot);
  draft.paths.enabled = true;
  draft.paths.auto = false;
  draft.paths.fieldCount = nextCount;
  const prior = new Set(original?.cellIds ?? []),
    claimed = new Set(ids.filter((id) => !prior.has(id)));
  draft.decoration.placements = draft.decoration.placements.filter(
    (placement) => !claimed.has(placement.cellId),
  );
  return preserveChangedFieldColors(draft, tile);
}
