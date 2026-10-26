import { isConnectedSelection } from './geometry';
import { fieldArea } from './fields';
import type { GeneratedTile, TileCell, TileConfig } from './types';

export interface RuleIssue {
  code: 'minimum-area' | 'field-connectivity' | 'path-connectivity';
  fieldId?: string;
  message: string;
}
const areaText = (value: number): string =>
  Number(value.toPrecision(4)).toString().replace('.', ',');
function fieldIssues(
  config: TileConfig,
  cells: TileCell[],
  map: Map<string, TileCell>,
  ids: readonly string[],
  label: string,
  fieldId?: string,
): RuleIssue[] {
  const issues: RuleIssue[] = [],
    identity = fieldId === undefined ? {} : { fieldId };
  const area = fieldArea(
    ids.filter((id) => map.has(id)),
    map,
  );
  if (area + 1e-10 < config.rules.minFieldArea)
    issues.push({
      code: 'minimum-area',
      ...identity,
      message: `Spielfeld „${label}“ hat ${areaText(area)} Grundfläche; eingestellt sind mindestens ${areaText(config.rules.minFieldArea)}.`,
    });
  if (config.rules.requireFieldConnectivity && !isConnectedSelection([...ids], cells))
    issues.push({
      code: 'field-connectivity',
      ...identity,
      message: `Die Rasterstücke von Spielfeld „${label}“ sind nicht zusammenhängend.`,
    });
  return issues;
}

/** Advisory checks for a structurally valid live selection; these never prevent editing. */
export function evaluateFieldShapeRules(
  config: TileConfig,
  tile: GeneratedTile,
  fieldId: string | null,
  cellIds: readonly string[],
): RuleIssue[] {
  const field = tile.fields.find((field) => field.id === fieldId);
  return fieldIssues(
    config,
    tile.cells,
    new Map(tile.cells.map((cell) => [cell.id, cell])),
    cellIds,
    field?.label || 'Neues Spielfeld',
    fieldId ?? undefined,
  );
}

function pathConnected(tile: GeneratedTile, map: Map<string, TileCell>): boolean {
  const owners = new Map<string, string>();
  for (const field of tile.fields)
    for (const id of field.cellIds) {
      if (!map.has(id)) return false;
      owners.set(id, field.id);
    }
  const center = tile.fields.find((field) => field.isCenter);
  if (!center?.cellIds.length) return false;
  const reached = new Set(center.cellIds),
    queue = [...center.cellIds];
  for (let i = 0; i < queue.length; i++)
    for (const id of map.get(queue[i]!)!.neighbors)
      if (owners.has(id) && !reached.has(id)) {
        reached.add(id);
        queue.push(id);
      }
  if ([...owners.keys()].some((id) => !reached.has(id))) return false;
  for (let side = 0; side < 6; side++) {
    const entrance = tile.entrances.find((entry) => entry.side === side);
    if (!entrance?.cellIds.length || entrance.cellIds.some((id) => !reached.has(id))) return false;
    const ids = new Set(entrance.cellIds.map((id) => owners.get(id)));
    if (ids.size !== 1 || ids.has(undefined) || [...ids][0] !== entrance.fieldId) return false;
  }
  return true;
}

/** Pure post-generation rule evaluation; center geometry and structural ownership are separate. */
export function evaluateTileRules(config: TileConfig, tile: GeneratedTile): RuleIssue[] {
  const map = new Map(tile.cells.map((cell) => [cell.id, cell])),
    issues: RuleIssue[] = [];
  for (const field of tile.fields)
    if (!field.isCenter)
      issues.push(
        ...fieldIssues(config, tile.cells, map, field.cellIds, field.label || field.id, field.id),
      );
  if (config.paths.enabled && config.rules.requirePathConnectivity && !pathConnected(tile, map))
    issues.push({
      code: 'path-connectivity',
      message:
        'Das Wegenetz ist nicht vollständig verbunden: Nicht alle Feldteile und sechs Außeneingänge sind über Spielfelder mit dem Pentagon erreichbar.',
    });
  return issues;
}

/** Only configured gameplay checks can block export; ordinary layout warnings remain advisory. */
export function getExportRuleIssues(config: TileConfig, tile: GeneratedTile): RuleIssue[] {
  return config.rules.exportPolicy === 'block' ? evaluateTileRules(config, tile) : [];
}
