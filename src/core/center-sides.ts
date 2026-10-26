import { centerPortals } from './geometry';
import type { CenterSide, Point, TileCell } from './types';

/** Complete corridor fragments of each centered portal; corner landscape is deliberately excluded. */
export function centralSideCells(cells: TileCell[], polygon: Point[]): Set<string>[] {
  return polygon.map(
    (_, index) =>
      new Set(
        cells
          .filter(
            (cell) =>
              cell.centerPort === index && !cell.landscapeOnly && cell.surfacePolygons.length,
          )
          .map((cell) => cell.id),
      ),
  );
}
/** Full side geometry remains available while ownership belongs only to its centered portal. */
export function describeCenterSides(
  cells: TileCell[],
  polygon: Point[],
  portalWidth = 0.45,
): CenterSide[] {
  const touching = centralSideCells(cells, polygon),
    map = new Map(cells.map((cell) => [cell.id, cell]));
  return centerPortals(polygon, portalWidth).portals.map(
    ({ index, start, end, portalStart, portalEnd }) => {
      const owners = new Set([...touching[index]!].map((id) => map.get(id)!.fieldId ?? null));
      return {
        index,
        start,
        end,
        portalStart,
        portalEnd,
        fieldId: owners.size === 1 ? [...owners][0]! : null,
      };
    },
  );
}
