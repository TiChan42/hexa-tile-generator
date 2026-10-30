import type { GeneratedTile, TileConfig } from '../core/types';
import { isResource } from '../core/resources';

/** Picking remains valid while only colors, actions, labels or decorations are changing. */
export function interactionKey(config: TileConfig): string {
  return JSON.stringify([
    config.seed,
    [config.grid.kind, config.grid.divisions, config.grid.subDivisions],
    config.terrain.noise,
    config.center,
    [
      config.terrain.scale,
      config.terrain.octaves,
      config.terrain.persistence,
      config.terrain.lacunarity,
      config.terrain.elevation,
      config.terrain.terraces,
    ],
    [
      config.paths.enabled,
      config.paths.auto,
      config.paths.enabledSides,
      config.paths.loop,
      config.paths.fieldCount,
      config.paths.heightMode,
      config.paths.fields
        .filter(
          (field) =>
            field.cellIds.length > 0 ||
            field.heightOffset !== undefined ||
            field.heightMode !== undefined,
        )
        .map((field) => [
          field.id,
          field.cellIds,
          field.heightOffset ?? 0,
          field.heightMode ?? null,
        ]),
    ],
  ]);
}

/** Height edits can continue while picking waits for the new surface elevations. */
export function fieldEditingKey(config: TileConfig): string {
  return interactionKey({
    ...config,
    paths: {
      ...config.paths,
      heightMode: 'flat',
      fields: config.paths.fields.map((field) => ({
        ...field,
        heightMode: undefined,
        heightOffset: undefined,
      })),
    },
  });
}

/** Controlled field inputs reflect the latest edits immediately, including during a worker run. */
export function presentFieldEdits(tile: GeneratedTile, config: TileConfig): GeneratedTile {
  const edits = new Map(config.paths.fields.map((field) => [field.id, field]));
  let changed = false;
  const fields = tile.fields.map((field) => {
    const edit = edits.get(field.id);
    if (!edit) return field;
    const color = edit.color ?? field.color,
      label = edit.label ?? field.label,
      action = edit.action,
      resourceAmount = isResource(action) ? (edit.resourceAmount ?? 1) : undefined;
    if (
      color === field.color &&
      label === field.label &&
      action === field.action &&
      resourceAmount === field.resourceAmount
    )
      return field;
    changed = true;
    const result = { ...field, color, label, action };
    if (resourceAmount === undefined) delete result.resourceAmount;
    else result.resourceAmount = resourceAmount;
    return result;
  });
  if (!changed) return tile;
  const colors = new Map(fields.map((field) => [field.id, field.color]));
  return {
    ...tile,
    fields,
    cells: tile.cells.map((cell) => {
      const color = cell.fieldId ? colors.get(cell.fieldId) : undefined;
      return color && color !== cell.color ? { ...cell, color } : cell;
    }),
  };
}
