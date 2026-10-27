import { pointInPolygon, regularPolygon } from './geometry';
import { fbm, randomAt } from './random';
import { placementOffset, placementPoint } from './subgrid';
import { decorationClearsBorder } from './tile-border';
import { decorationScale } from './object-sizes';
import type { Decoration, DecorationKind, Point, TileCell, TileConfig } from './types';

export interface DecorationSlot {
  id: string;
  position: Point;
  offset: Point;
}
interface LocalSlot {
  id: string;
  position: Point;
}
const slotTemplates = new Map<string, LocalSlot[]>();

/** Positions only: forest distribution never constructs thousands of clipped subcell meshes. */
function localSlots(grid: TileConfig['grid']): LocalSlot[] {
  const key = `${grid.kind}:${grid.subDivisions}`;
  let slots = slotTemplates.get(key);
  if (slots) return slots;
  const count = grid.subDivisions;
  const radius = 1 / count;
  const step = 1.7 * radius;
  const boundary =
    grid.kind === 'hex'
      ? regularPolygon(6, 1)
      : [
          { x: -0.75 * 1.7, y: -Math.sqrt(3) * 1.7 * 0.25 },
          { x: 0.25 * 1.7, y: -Math.sqrt(3) * 1.7 * 0.25 },
          { x: 0.75 * 1.7, y: Math.sqrt(3) * 1.7 * 0.25 },
          { x: -0.25 * 1.7, y: Math.sqrt(3) * 1.7 * 0.25 },
        ];
  slots = [];
  for (let q = -2 * count; q <= 2 * count; q++) {
    for (let r = -2 * count; r <= 2 * count; r++) {
      const position =
        grid.kind === 'hex'
          ? { x: radius * 1.5 * q, y: radius * Math.sqrt(3) * (r + q / 2) }
          : { x: step * (q + r * 0.5), y: step * Math.sqrt(3) * 0.5 * r };
      if (pointInPolygon(position, boundary)) slots.push({ id: `slot:${q}:${r}`, position });
    }
  }
  slotTemplates.set(key, slots);
  return slots;
}

/** Shares the fine lattice with the editor; clipping uses point tests rather than polygon meshes. */
export function decorationSlots(cell: TileCell, grid: TileConfig['grid']): DecorationSlot[] {
  if (!cell.surfacePolygons.length) return [];
  return localSlots(grid).flatMap((slot) => {
    const position = {
      x: cell.center.x + slot.position.x / grid.divisions,
      y: cell.center.y + slot.position.y / grid.divisions,
    };
    if (!cell.surfacePolygons.some((polygon) => pointInPolygon(position, polygon))) return [];
    const offset = placementOffset(cell, position);
    if (Math.abs(offset.x) > 1 || Math.abs(offset.y) > 1) return [];
    return [{ id: slot.id, position, offset }];
  });
}

/** A smooth low-frequency field gives neighboring cells coherent dense groves and clearings. */
export function forestDensity(seed: string, point: Point): number {
  const noise = fbm(`${seed}:forest-groves-v3`, point.x * 3.2, point.y * 3.2, 3, 0.55, 2);
  const t = Math.max(0, Math.min(1, (noise - 0.28) / 0.42));
  return t * t * (3 - 2 * t);
}

/** Snap numerical lattice drift before a discontinuous region lookup across JS runtimes. */
export function forestSpeciesRegion(point: Point): Point {
  const coordinate = (value: number) => Math.floor(Number((value * 3).toFixed(10))) || 0;
  return { x: coordinate(point.x), y: coordinate(point.y) };
}

export function buildDecorations(
  config: TileConfig,
  cells: TileCell[],
  center: Point[],
): { decorations: Decoration[]; warnings: string[] } {
  const decorations: Decoration[] = [],
    warnings: string[] = [];
  if (!config.decoration.enabled) return { decorations, warnings };
  const map = new Map(cells.map((cell) => [cell.id, cell]));
  const cache = new Map<string, DecorationSlot[]>();
  const slotsFor = (cell: TileCell): DecorationSlot[] => {
    let slots = cache.get(cell.id);
    if (!slots) {
      slots = decorationSlots(cell, config.grid);
      cache.set(cell.id, slots);
    }
    return slots;
  };
  const occupied = new Set<string>();
  const manual: Decoration[] = [];
  for (const placement of config.decoration.placements) {
    const cell = map.get(placement.cellId);
    if (!cell || cell.fieldId || cell.reserved) {
      warnings.push(
        `Objekt „${placement.id}“ liegt außerhalb des Rasters oder auf einem reservierten Spielfeld.`,
      );
      continue;
    }
    const position = placementPoint(cell, placement.offset);
    if (!pointInPolygon(position, cell.polygon) || pointInPolygon(position, center)) {
      warnings.push(`Objekt „${placement.id}“ liegt außerhalb seines Rasterstücks.`);
      continue;
    }
    const nearest = slotsFor(cell).reduce<DecorationSlot | undefined>(
      (best, slot) =>
        !best ||
        Math.hypot(slot.position.x - position.x, slot.position.y - position.y) <
          Math.hypot(best.position.x - position.x, best.position.y - position.y)
          ? slot
          : best,
      undefined,
    );
    if (nearest) occupied.add(`${cell.id}|${nearest.id}`);
    const scale = decorationScale(config, placement.kind, placement.id, placement.scale);
    if (!decorationClearsBorder(config, position, scale, placement.rotation)) {
      warnings.push(
        `Objekt „${placement.id}“ ragt mit seiner Grundfläche in die reservierte Randzone und wird ausgeblendet.`,
      );
      continue;
    }
    manual.push({
      id: placement.id,
      kind: placement.kind,
      cellId: cell.id,
      position,
      height: cell.height,
      scale,
      rotation: placement.rotation,
    });
  }
  const species = config.decoration.species;
  for (const cell of cells) {
    if (cell.fieldId || cell.reserved || config.decoration.density === 0) continue;
    const probability = Math.min(
      1,
      config.decoration.density * (0.08 + 1.92 * forestDensity(config.seed, cell.center) ** 2),
    );
    const slots = [...slotsFor(cell)]
      .sort(
        (a, b) =>
          randomAt(config.seed, 'decor-slot-order-v3', cell.id, a.id) -
          randomAt(config.seed, 'decor-slot-order-v3', cell.id, b.id),
      )
      .slice(0, config.decoration.maxPerCell);
    const region = forestSpeciesRegion(cell.center);
    const dominant = Math.floor(
      randomAt(config.seed, 'forest-species-v3', region.x, region.y) * species.length,
    );
    for (const slot of slots) {
      if (
        occupied.has(`${cell.id}|${slot.id}`) ||
        randomAt(config.seed, 'decor-presence-v3', cell.id, slot.id) >= probability
      )
        continue;
      const rotation = randomAt(config.seed, 'decor-rotation-v3', cell.id, slot.id) * 360;
      const kind: DecorationKind =
        randomAt(config.seed, 'decor-mixed-v3', cell.id, slot.id) < 0.3
          ? species[
              Math.floor(randomAt(config.seed, 'decor-kind-v3', cell.id, slot.id) * species.length)
            ]!
          : species[dominant]!;
      const id = `decor:${cell.id}:${slot.id}`;
      const scale = decorationScale(config, kind, id);
      if (!decorationClearsBorder(config, slot.position, scale, rotation)) continue;
      decorations.push({
        id,
        kind,
        cellId: cell.id,
        position: slot.position,
        height: cell.height,
        scale,
        rotation,
      });
    }
  }
  return { decorations: [...decorations, ...manual], warnings };
}
