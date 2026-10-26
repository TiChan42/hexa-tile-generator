import type * as THREE from 'three';
import { polygonArea } from '../core/geometry';
import type { GameField, GeneratedTile } from '../core/types';
import { buildFieldBorders } from './borders';

export const SELECTION_FALLBACK_COLOR = '#ff00ff';

/** Average visible free ground in sRGB, then use the opposite hue at full saturation. */
export function landscapeSelectionColor(tile: GeneratedTile): string {
  let red = 0,
    green = 0,
    blue = 0,
    total = 0;
  for (const cell of tile.cells) {
    if (cell.fieldId || !/^#[0-9a-f]{6}$/i.test(cell.color)) continue;
    const area = cell.surfacePolygons.reduce(
      (sum, polygon) => sum + Math.abs(polygonArea(polygon)),
      0,
    );
    if (area <= 1e-12) continue;
    red += (parseInt(cell.color.slice(1, 3), 16) / 255) * area;
    green += (parseInt(cell.color.slice(3, 5), 16) / 255) * area;
    blue += (parseInt(cell.color.slice(5, 7), 16) / 255) * area;
    total += area;
  }
  if (total <= 1e-12) return SELECTION_FALLBACK_COLOR;
  red /= total;
  green /= total;
  blue /= total;
  const maximum = Math.max(red, green, blue),
    minimum = Math.min(red, green, blue),
    chroma = maximum - minimum;
  // A hue from nearly neutral ground is unstable and does not describe the landscape usefully.
  if (chroma < 0.01) return SELECTION_FALLBACK_COLOR;
  const hue =
    maximum === red
      ? (green - blue) / chroma
      : maximum === green
        ? (blue - red) / chroma + 2
        : (red - green) / chroma + 4;
  const opposite = (((hue + 9) % 6) + 6) % 6;
  const secondary = 1 - Math.abs((opposite % 2) - 1);
  const channels =
    opposite < 1
      ? [1, secondary, 0]
      : opposite < 2
        ? [secondary, 1, 0]
        : opposite < 3
          ? [0, 1, secondary]
          : opposite < 4
            ? [0, secondary, 1]
            : opposite < 5
              ? [secondary, 0, 1]
              : [1, 0, secondary];
  return `#${channels
    .map((value) =>
      Math.round(value * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Selection and color changes are independent of orbit frames and label-only updates. */
export function selectionOutlineKey(
  ids: readonly string[],
  fieldId: string | undefined,
  geometryRevision: number,
  color = '',
): string {
  return JSON.stringify([geometryRevision, [...new Set(ids)].sort(), fieldId ?? null, color]);
}

/** Draft cells form one logical union, including disconnected parts, without altering saved fields. */
export function selectionSurfaceTile(
  tile: GeneratedTile,
  ids: readonly string[],
  fieldId?: string,
): GeneratedTile {
  if (!ids.length) return { ...tile, fields: tile.fields.filter((field) => field.id === fieldId) };
  const selected = new Set(ids),
    cells = tile.cells
      .filter((cell) => selected.has(cell.id) && cell.surfacePolygons.length)
      .map((cell) => ({ ...cell, fieldId: '\0draft-selection' }));
  if (!cells.length) return { ...tile, fields: [] };
  const heights = cells.map((cell) => cell.height);
  const field: GameField = {
    id: '\0draft-selection',
    cellIds: cells.map((cell) => cell.id),
    center: cells[0]!.center,
    height: Math.min(...heights),
    maxHeight: Math.max(...heights),
    symbolHeight: cells[0]!.height,
    color: '#ffffff',
    action: 'none',
    label: '',
    isCenter: false,
    area: cells.reduce(
      (sum, cell) =>
        sum +
        cell.surfacePolygons.reduce((area, polygon) => area + Math.abs(polygonArea(polygon)), 0),
      0,
    ),
  };
  return { ...tile, cells, fields: [field] };
}

/** Only the whole exterior is colored; no filled caps or internal raster lines are produced. */
export function buildSelectionOutline(
  tile: GeneratedTile,
  ids: readonly string[],
  fieldId?: string,
  terrain?: THREE.BufferGeometry,
): ReturnType<typeof buildFieldBorders> {
  return buildFieldBorders(selectionSurfaceTile(tile, ids, fieldId), terrain);
}
