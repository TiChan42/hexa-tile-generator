import { boundaryCells } from './geometry';
import { centralSideCells } from './center-sides';
import { evaluateFieldShapeRules } from './rules';
import type { RuleIssue } from './rules';
import type { FieldEdit, GameField, GeneratedTile, TileConfig } from './types';

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
  return draft;
}
