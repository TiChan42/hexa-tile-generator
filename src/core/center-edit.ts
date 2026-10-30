import { preserveChangedFieldColors } from './preserve-colors';
import { createCenterPolygon } from './center';
import { centralSideCells } from './center-sides';
import { generateTile } from './generate';
import { buildGrid, buildUntouchedGrid, clipPolygon, polygonArea } from './geometry';
import type { FieldEdit, GeneratedTile, TileCell, TileConfig } from './types';

const AREA_EPS = 1e-12;

function rasterId(cell: TileCell): string {
  return cell.rasterId ?? cell.id;
}

function rasterBuckets(cells: TileCell[]): Map<string, TileCell[]> {
  const result = new Map<string, TileCell[]>();
  for (const cell of cells) {
    const key = rasterId(cell),
      bucket = result.get(key);
    if (bucket) bucket.push(cell);
    else result.set(key, [cell]);
  }
  return result;
}

/** A preview may be older than pending center controls, but never older than its source raster. */
function assertSameRaster(previous: Map<string, TileCell[]>, next: Map<string, TileCell[]>): void {
  const matches =
    previous.size === next.size &&
    [...previous].every(([id, cells]) => {
      const candidate = next.get(id)?.[0];
      if (!candidate) return false;
      const a = cells[0]!.rasterCenter ?? cells[0]!.center,
        b = candidate.rasterCenter ?? candidate.center;
      return Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;
    });
  if (!matches)
    throw new Error(
      'Das sichtbare Raster ist noch nicht aktuell. Warte auf die Rastervorschau, bevor du das Pentagon änderst.',
    );
}

/** Real convex surface overlap; candidate pairs always belong to the same untouched raster cell. */
function surfaceOverlap(first: TileCell, second: TileCell): number {
  let area = 0;
  for (const a of first.surfacePolygons)
    for (const b of second.surfacePolygons) area += polygonArea(clipPolygon(a, b));
  return area;
}

function bestOwner(scores: Map<string, number>): string | undefined {
  let owner: string | undefined,
    largest = AREA_EPS;
  // Stable source-cell order provides a tie break without locale-dependent sorting.
  for (const [id, area] of scores)
    if (area > largest) {
      owner = id;
      largest = area;
    }
  return owner;
}

/**
 * Change only the center cut of the visible board. Auto routes are materialized before the cut,
 * so changing a pentagon never silently replaces a user's surrounding fields or saved objects.
 */
export function prepareCenterEdit(
  config: TileConfig,
  tile: GeneratedTile,
  nextCenter: TileConfig['center'],
): TileConfig {
  const draft = structuredClone(config);
  draft.center = structuredClone(nextCenter);
  if (config.editing.regeneratePathsOnCenterChange) {
    draft.paths.fields = [];
    draft.paths.auto = true;
    draft.decoration.density = draft.decoration.sourceDensity ?? draft.decoration.density;
    draft.decoration.placements = [];
    return draft;
  }

  // The visible pieces are authoritative, including while config.center is ahead of a preview.
  assertSameRaster(rasterBuckets(tile.cells), rasterBuckets(buildUntouchedGrid(config.grid)));
  // Hiding the path layer must not discard its saved shapes or automatic layout. Materialize
  // that layer from its current configuration before cutting it; decoration stays untouched.
  const sourceTile = config.paths.enabled
    ? tile
    : generateTile({
        ...config,
        paths: { ...config.paths, enabled: true },
        decoration: { ...config.decoration, enabled: false },
      });
  const oldBuckets = rasterBuckets(sourceTile.cells);
  const polygon = createCenterPolygon(config.seed, nextCenter),
    cells = buildGrid(config.grid, polygon, {
      portalWidth: nextCenter.portalWidth,
      legacy: config.legacyLayout,
    });

  const normalFields = sourceTile.fields.filter((field) => !field.isCenter),
    oldOwners = new Map(
      normalFields.flatMap((field) => field.cellIds.map((id) => [id, field.id] as const)),
    ),
    owners = new Map<string, string>(),
    overlaps = new Map<string, Map<string, number>>();
  for (const cell of cells) {
    if (!cell.surfacePolygons.length || cell.landscapeOnly) continue;
    const scores = new Map<string, number>();
    for (const previous of oldBuckets.get(rasterId(cell))!) {
      const owner = oldOwners.get(previous.id);
      if (!owner) continue;
      const area = surfaceOverlap(cell, previous);
      if (area > AREA_EPS) scores.set(owner, (scores.get(owner) ?? 0) + area);
    }
    overlaps.set(cell.id, scores);
    const owner = bestOwner(scores);
    if (owner) owners.set(cell.id, owner);
  }

  // A portal is an atomic local region. It may inherit one old owner, or remain landscape.
  // New corner guards and hidden center pieces are never candidates for gameplay ownership.
  for (const portal of centralSideCells(cells, polygon)) {
    const scores = new Map<string, number>();
    for (const id of portal)
      for (const [owner, area] of overlaps.get(id) ?? [])
        scores.set(owner, (scores.get(owner) ?? 0) + area);
    const owner = bestOwner(scores);
    for (const id of portal) {
      if (owner) owners.set(id, owner);
      else owners.delete(id);
    }
  }

  const assigned = new Map<string, Set<string>>(normalFields.map((field) => [field.id, new Set()]));
  for (const [id, owner] of owners) assigned.get(owner)!.add(id);
  const edits = new Map(config.paths.fields.map((edit) => [edit.id, edit])),
    snapshot: FieldEdit[] = normalFields.map((field) => {
      const ids = assigned.get(field.id)!;
      if (!ids.size)
        throw new Error(
          `Das Pentagon würde Spielfeld „${field.label}“ vollständig verdrängen. Verschiebe oder verkleinere es.`,
        );
      // Preserve existing order when no fragments changed; append only new local pieces.
      const cellIds = field.cellIds.filter((id) => ids.delete(id)),
        edit = edits.get(field.id);
      const resourceAmount = edit ? edit.resourceAmount : field.resourceAmount;
      cellIds.push(...ids);
      return {
        ...(edit ?? {}),
        id: field.id,
        cellIds,
        action: edit?.action ?? field.action,
        ...(resourceAmount !== undefined ? { resourceAmount } : {}),
        label: edit?.label ?? field.label,
      };
    });
  const centerEdit = edits.get('center');
  draft.paths.fields = centerEdit
    ? [structuredClone(centerEdit), ...structuredClone(snapshot)]
    : structuredClone(snapshot);
  draft.paths.auto = false;
  return preserveChangedFieldColors(draft, sourceTile);
}
