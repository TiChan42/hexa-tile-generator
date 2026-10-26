import { centroid, clipPolygon, polygonArea, regularPolygon } from './geometry';
import type { Point, TileCell, TileConfig } from './types';

export interface SubgridCell {
  id: string;
  polygon: Point[];
  center: Point;
  /** Cell-local coordinates, suitable for DecorationPlacement.offset. */
  offset: Point;
}

function placementExtent(cell: TileCell): Point {
  return {
    x: Math.max(...cell.polygon.map((point) => Math.abs(point.x - cell.center.x))),
    y: Math.max(...cell.polygon.map((point) => Math.abs(point.y - cell.center.y))),
  };
}

/** Asymmetric clipped cells still map their entire area into local coordinates [-1, 1]. */
export function placementPoint(cell: TileCell, offset: Point): Point {
  const extent = placementExtent(cell);
  return { x: cell.center.x + offset.x * extent.x, y: cell.center.y + offset.y * extent.y };
}

export function placementOffset(cell: TileCell, point: Point): Point {
  const extent = placementExtent(cell);
  // Boundary lattice points can round to 1 + a few ULPs after translation and division.
  // Only geometry-epsilon overshoot is corrected; actual outside positions stay invalid.
  const local = (value: number): number =>
    Math.abs(value) > 1 && Math.abs(value) <= 1 + 1e-9 ? Math.sign(value) : value;
  return {
    x: local((point.x - cell.center.x) / extent.x),
    y: local((point.y - cell.center.y) / extent.y),
  };
}

/** Fine raster uses exactly the same lattice and clipping rules as its parent raster. */
export function buildSubgrid(cell: TileCell, grid: TileConfig['grid']): SubgridCell[] {
  if (!cell.surfacePolygons.length) return [];
  const cells: SubgridCell[] = [],
    radius = 1 / grid.divisions / grid.subDivisions;
  const step = radius * 1.7,
    extent = placementExtent(cell);
  const bounds = {
    minX: Math.min(...cell.polygon.map((point) => point.x)) - cell.center.x,
    maxX: Math.max(...cell.polygon.map((point) => point.x)) - cell.center.x,
    minY: Math.min(...cell.polygon.map((point) => point.y)) - cell.center.y,
    maxY: Math.max(...cell.polygon.map((point) => point.y)) - cell.center.y,
  };
  const template =
    grid.kind === 'hex'
      ? regularPolygon(6, radius)
      : [
          { x: -0.75 * step, y: -Math.sqrt(3) * step * 0.25 },
          { x: 0.25 * step, y: -Math.sqrt(3) * step * 0.25 },
          { x: 0.75 * step, y: Math.sqrt(3) * step * 0.25 },
          { x: -0.25 * step, y: Math.sqrt(3) * step * 0.25 },
        ];
  const addCell = (q: number, r: number): void => {
    const origin =
      grid.kind === 'hex'
        ? {
            x: cell.center.x + radius * 1.5 * q,
            y: cell.center.y + radius * Math.sqrt(3) * (r + q / 2),
          }
        : {
            x: cell.center.x + step * (q + r * 0.5),
            y: cell.center.y + step * Math.sqrt(3) * 0.5 * r,
          };
    const raw = template.map((point) => ({ x: point.x + origin.x, y: point.y + origin.y }));
    cell.surfacePolygons.forEach((surface, piece) => {
      const polygon = clipPolygon(raw, surface);
      if (polygon.length < 3 || polygonArea(polygon) < 1e-12) return;
      const center = centroid(polygon);
      cells.push({
        id: `${cell.id}:sub:${q}:${r}:${piece}`,
        polygon,
        center,
        offset: {
          x: (center.x - cell.center.x) / extent.x,
          y: (center.y - cell.center.y) / extent.y,
        },
      });
    });
  };
  // Invert lattice coordinates against the expanded parent bbox, avoiding empty outer rings.
  if (grid.kind === 'hex') {
    const dy = radius * Math.sqrt(3),
      halfHeight = dy / 2;
    for (
      let q = Math.ceil((bounds.minX - radius) / (1.5 * radius));
      q <= Math.floor((bounds.maxX + radius) / (1.5 * radius));
      q++
    ) {
      for (
        let r = Math.ceil((bounds.minY - halfHeight) / dy - q / 2);
        r <= Math.floor((bounds.maxY + halfHeight) / dy - q / 2);
        r++
      )
        addCell(q, r);
    }
  } else {
    const dy = (step * Math.sqrt(3)) / 2,
      halfHeight = dy / 2;
    for (
      let r = Math.ceil((bounds.minY - halfHeight) / dy);
      r <= Math.floor((bounds.maxY + halfHeight) / dy);
      r++
    ) {
      for (
        let q = Math.ceil((bounds.minX - 0.75 * step) / step - r / 2);
        q <= Math.floor((bounds.maxX + 0.75 * step) / step - r / 2);
        q++
      )
        addCell(q, r);
    }
  }
  return cells;
}
