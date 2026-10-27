import { centroid, pointInPolygon, polygonArea } from '../core/geometry';
import type { Point } from '../core/types';
import { exposedWalls } from './walls';

interface Candidate extends Point {
  half: number;
  clearance: number;
  upper: number;
}

/** A deterministic maximum queue for the bounded interior-clearance search. */
class Candidates {
  private values: Candidate[] = [];
  get size(): number {
    return this.values.length;
  }
  push(value: Candidate): void {
    let index = this.values.push(value) - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.values[parent]!.upper >= value.upper) break;
      this.values[index] = this.values[parent]!;
      index = parent;
    }
    this.values[index] = value;
  }
  pop(): Candidate {
    const first = this.values[0]!,
      last = this.values.pop()!;
    if (!this.values.length) return first;
    let index = 0;
    while (index * 2 + 1 < this.values.length) {
      let child = index * 2 + 1;
      if (
        child + 1 < this.values.length &&
        this.values[child + 1]!.upper > this.values[child]!.upper
      )
        child++;
      if (last.upper >= this.values[child]!.upper) break;
      this.values[index] = this.values[child]!;
      index = child;
    }
    this.values[index] = last;
    return first;
  }
}

/** Find the broadest interior of a polygon union, including holes and detached pieces.
 * Internal raster edges cancel before measuring clearance. The branch bound follows
 * the distance function's Lipschitz bound, so a narrow arm cannot steal the badge
 * simply because it lies closer to the field's area centroid.
 */
export function widestSymbolAnchor(
  polygons: Point[][],
  preferred: Point,
): { point: Point; clearance: number } {
  const visible = polygons.filter(
    (polygon) => polygon.length >= 3 && Math.abs(polygonArea(polygon)) > 1e-14,
  );
  const edges = exposedWalls([{ polygons: visible, height: 1 }], 0);
  if (!edges.length) return { point: { ...preferred }, clearance: 0 };
  const measure = (point: Point): number => {
    let squared = Infinity;
    for (const { a, b } of edges) {
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length = dx * dx + dy * dy,
        t = length
          ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
          : 0;
      squared = Math.min(squared, (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2);
    }
    return (
      Math.sqrt(squared) * (visible.some((polygon) => pointInPolygon(point, polygon)) ? 1 : -1)
    );
  };
  const distance = (point: Point) => (point.x - preferred.x) ** 2 + (point.y - preferred.y) ** 2;
  let point = { ...preferred },
    clearance = measure(point);
  const accept = (candidate: Point, value = measure(candidate)) => {
    const delta = distance(candidate) - distance(point);
    if (
      value > clearance + 1e-10 ||
      (Math.abs(value - clearance) <= 1e-10 &&
        (delta < -1e-12 ||
          (Math.abs(delta) <= 1e-12 &&
            (candidate.x < point.x || (candidate.x === point.x && candidate.y < point.y)))))
    ) {
      point = { x: candidate.x, y: candidate.y };
      clearance = value;
    }
  };
  visible.forEach((polygon) => accept(centroid(polygon)));
  const vertices = visible.flat(),
    minX = Math.min(...vertices.map((p) => p.x)),
    maxX = Math.max(...vertices.map((p) => p.x)),
    minY = Math.min(...vertices.map((p) => p.y)),
    maxY = Math.max(...vertices.map((p) => p.y)),
    span = Math.max(maxX - minX, maxY - minY),
    precision = Math.max(1e-6, Math.min(0.0005, span / 256));
  const queue = new Candidates();
  const add = (x: number, y: number, half: number) => {
    const clearance = measure({ x, y });
    queue.push({ x, y, half, clearance, upper: clearance + half * Math.SQRT2 });
  };
  add((minX + maxX) / 2, (minY + maxY) / 2, span / 2);
  while (queue.size) {
    const candidate = queue.pop();
    accept(candidate, candidate.clearance);
    if (candidate.upper - clearance <= precision) continue;
    const half = candidate.half / 2;
    add(candidate.x - half, candidate.y - half, half);
    add(candidate.x + half, candidate.y - half, half);
    add(candidate.x - half, candidate.y + half, half);
    add(candidate.x + half, candidate.y + half, half);
  }
  return { point, clearance: Math.max(0, clearance) };
}
