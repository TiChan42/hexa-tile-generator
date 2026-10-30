import { boundaryCells, buildEntranceFootprints, centroid, polygonArea } from './geometry';
import { centralSideCells, describeCenterSides } from './center-sides';
import { fieldAnchor, fieldArea } from './fields';
import { buildAutoTopology } from './topology';
import { buildConnections } from './connections';
import { applyFieldElevation, terracedSymbolAnchor } from './field-elevation';
import type { FieldCluster } from './fields';
import { randomAt } from './random';
import { initialFieldAction, isResource, rollResourceAmount } from './resources';
import { ensurePathTerrainContrast, sampleGradient } from './color';
import type {
  CenterSide,
  Entrance,
  FieldConnection,
  GameField,
  Point,
  TileCell,
  TileConfig,
} from './types';

export function buildPaths(
  config: TileConfig,
  cells: TileCell[],
  centerPolygon: Point[],
): {
  fields: GameField[];
  entrances: Entrance[];
  warnings: string[];
  connected: boolean;
  centerHeight: number;
  centerSides: CenterSide[];
  connections: FieldConnection[];
} {
  const map = new Map(cells.map((cell) => [cell.id, cell])),
    warnings: string[] = [];
  const inside = cells.filter((cell) => cell.surfacePolygons.length === 0),
    centerSet = new Set(inside.map((cell) => cell.id));
  const touching = centralSideCells(cells, centerPolygon);
  const centerEdit = config.paths.fields.find((field) => field.id === 'center');
  const centerLevels = applyFieldElevation(
    [...centerSet],
    map,
    centroid(centerPolygon),
    centerEdit?.heightMode ?? config.paths.heightMode,
    centerEdit?.heightOffset ?? 0,
    true,
  );
  let centerAnchor = centroid(centerPolygon);
  if ((centerEdit?.heightMode ?? config.paths.heightMode) === 'terraced') {
    const symbol = terracedSymbolAnchor([...centerSet], map, centerAnchor, true);
    centerAnchor = symbol.point;
    centerLevels.symbolHeight = symbol.height;
  }
  const centerHeight = centerLevels.height;
  const fields: GameField[] = [
    {
      id: 'center',
      cellIds: [...centerSet],
      center: centerAnchor,
      ...centerLevels,
      color:
        centerEdit?.color ??
        ensurePathTerrainContrast(
          '#e6c777',
          touching.flatMap((side) => [...side].map((id) => map.get(id)!.color)),
        ),
      action: centerEdit?.action ?? 'event',
      ...(centerEdit?.resourceAmount !== undefined && isResource(centerEdit.action)
        ? { resourceAmount: centerEdit.resourceAmount }
        : {}),
      label: centerEdit?.label ?? 'Zentrum',
      isCenter: true,
      polygon: centerPolygon,
      area: polygonArea(centerPolygon),
    },
  ];
  const entrances: Entrance[] = buildEntranceFootprints(config.grid).map((entry) => ({
    side: entry.side,
    cellIds: entry.mouthIds,
    footprintCellIds: entry.cellIds,
    center: entry.center,
    widthCells: entry.widthCells,
    fieldId: null,
  }));
  const clusters: FieldCluster[] = [],
    occupied = new Map<string, string>();
  const manual = config.paths.enabled
    ? config.paths.fields.filter((field) => field.cellIds.length > 0 && field.id !== 'center')
    : [];
  const seenManualIds = new Set<string>();
  for (const edit of manual) {
    if (seenManualIds.has(edit.id)) {
      warnings.push(
        `Spielfeld-ID „${edit.id}“ ist mehrfach vorhanden; der spätere Eintrag wurde ignoriert.`,
      );
      continue;
    }
    seenManualIds.add(edit.id);
    const ids = [...new Set(edit.cellIds)],
      owned = new Set(ids);
    if (ids.some((id) => !map.has(id) || occupied.has(id))) {
      warnings.push(
        `Spielfeld „${edit.label ?? edit.id}“ wurde ignoriert: Rasterstücke müssen existieren und dürfen sich nicht überlappen.`,
      );
      continue;
    }
    if (ids.some((id) => !map.get(id)!.surfacePolygons.length)) {
      warnings.push(
        `Spielfeld „${edit.label ?? edit.id}“ enthält vollständig reservierte Zentrumstücke.`,
      );
      continue;
    }
    if (ids.some((id) => map.get(id)!.landscapeOnly)) {
      warnings.push(
        `Spielfeld „${edit.label ?? edit.id}“ wurde ignoriert: Die Landschaft an den Pentagonecken ist für Wege gesperrt.`,
      );
      continue;
    }
    const invalidEdge = Array.from({ length: 6 }, (_, side) => side).some((side) => {
      const boundary = boundaryCells(cells, side),
        contact = boundary.filter((cell) => owned.has(cell.id));
      if (!contact.length) return false;
      const entrance = entrances.find((entry) => entry.side === side);
      return (
        !entrance ||
        !entrance.cellIds.every((id) => owned.has(id)) ||
        contact.some((cell) => !entrance.cellIds.includes(cell.id))
      );
    });
    if (invalidEdge) {
      warnings.push(
        `Spielfeld „${edit.label ?? edit.id}“ wurde ignoriert: Jede Randseite darf nur ein Spielfeld an ihrer vollständigen mittigen Eingangsmündung besitzen.`,
      );
      continue;
    }
    if (
      touching.some(
        (side) => [...side].some((id) => owned.has(id)) && [...side].some((id) => !owned.has(id)),
      )
    ) {
      warnings.push(
        `Spielfeld „${edit.label ?? edit.id}“ wurde ignoriert: Ein Pentagonportal muss vollständig demselben Spielfeld oder keinem Spielfeld gehören.`,
      );
      continue;
    }
    clusters.push({ id: edit.id, ids: owned, locked: true });
    ids.forEach((id) => occupied.set(id, edit.id));
  }
  if (config.paths.enabled && config.paths.auto) {
    const generated = buildAutoTopology(config, cells, entrances, centerPolygon, clusters);
    clusters.splice(0, clusters.length, ...generated.clusters);
    warnings.push(...generated.warnings);
  }
  const terrainColorByCell = new Map(cells.map((cell) => [cell.id, cell.color]));
  const fieldCellIds = new Set([...centerSet, ...clusters.flatMap((group) => [...group.ids])]);
  const landscapeColors = (group: FieldCluster): string[] => {
    const adjacent = [...new Set([...group.ids].flatMap((id) => map.get(id)!.neighbors))]
      .filter((id) => !fieldCellIds.has(id))
      .map((id) => terrainColorByCell.get(id)!);
    if (adjacent.length) return adjacent;
    const anchor = fieldAnchor(group.ids, map);
    return cells
      .filter((cell) => cell.surfacePolygons.length > 0)
      .map((cell) => ({
        cell,
        distance: Math.hypot(cell.center.x - anchor.x, cell.center.y - anchor.y),
      }))
      .sort((a, b) => a.distance - b.distance || (a.cell.id < b.cell.id ? -1 : 1))
      .slice(0, 8)
      .map(({ cell }) => terrainColorByCell.get(cell.id)!);
  };
  for (const group of clusters) {
    const ids = [...group.ids],
      edit = config.paths.fields.find(
        (field) =>
          field.id === group.id &&
          (group.locked ? field.cellIds.length > 0 : field.cellIds.length === 0),
      );
    let anchor = fieldAnchor(ids, map);
    const levels = applyFieldElevation(
      ids,
      map,
      anchor,
      edit?.heightMode ?? config.paths.heightMode,
      edit?.heightOffset ?? 0,
    );
    if ((edit?.heightMode ?? config.paths.heightMode) === 'terraced') {
      const symbol = terracedSymbolAnchor(ids, map, anchor);
      anchor = symbol.point;
      levels.symbolHeight = symbol.height;
    }
    const sampledColor = sampleGradient(
      config.paths.gradient,
      randomAt(config.seed, 'field-color', group.id),
    );
    const color = edit?.color ?? ensurePathTerrainContrast(sampledColor, landscapeColors(group));
    const actions = ['rotate', 'shift', 'event', 'shop', 'scrap', 'jump'] as const;
    const action =
      edit?.action ??
      (config.actionRecipe === 16
        ? actions[Math.floor(randomAt(config.seed, 'field-action', group.id) * actions.length)]!
        : initialFieldAction(config.seed, group.id, config.actions.biome, config.actionRecipe));
    const field: GameField = {
      id: group.id,
      cellIds: ids,
      center: anchor,
      ...levels,
      color,
      action,
      ...(isResource(action) &&
      (edit?.resourceAmount !== undefined || (!edit && config.actionRecipe !== 16))
        ? { resourceAmount: edit?.resourceAmount ?? rollResourceAmount(config.seed, 0, group.id) }
        : {}),
      label: edit?.label ?? `Spielfeld ${fields.length}`,
      isCenter: false,
      area: fieldArea(ids, map),
    };
    fields.push(field);
    ids.forEach((id) => {
      const cell = map.get(id)!;
      cell.fieldId = field.id;
      cell.color = color;
    });
  }
  inside.forEach((cell) => {
    cell.fieldId = 'center';
    cell.color = fields[0]!.color;
  });
  const reached = new Set(centerSet),
    queue = [...centerSet];
  for (let i = 0; i < queue.length; i++)
    for (const next of map.get(queue[i]!)!.neighbors)
      if (map.get(next)!.fieldId && !reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
  const connected =
    fields.every((field) => field.cellIds.every((id) => reached.has(id))) &&
    (!config.paths.enabled ||
      entrances.every((entrance) => entrance.cellIds.every((id) => reached.has(id))));
  if (centerEdit?.cellIds.length)
    warnings.push(
      'Die Form des Zentrums ist fest reserviert; manuelle Zentrum-Rasterstücke werden ignoriert.',
    );
  for (const entrance of entrances) {
    const owners = new Set(entrance.cellIds.map((id) => map.get(id)!.fieldId ?? null));
    entrance.fieldId = owners.size === 1 ? [...owners][0]! : null;
    if (entrance.fieldId === null)
      warnings.push(`Außeneingang ${entrance.side + 1} braucht genau ein Spielfeld als Besitzer.`);
  }
  if (config.paths.enabled && !config.paths.auto && fields.length !== config.paths.fieldCount)
    warnings.push(
      `Gewünscht sind ${config.paths.fieldCount} Felder; die manuelle Belegung enthält ${fields.length}.`,
    );
  return {
    fields,
    entrances,
    warnings,
    connected,
    centerHeight,
    centerSides: describeCenterSides(cells, centerPolygon, config.center.portalWidth),
    connections: buildConnections(fields, cells),
  };
}
