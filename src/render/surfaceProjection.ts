import type * as THREE from 'three';
import { centroid, clipPolygon, polygonArea } from '../core/geometry';
import type { Point } from '../core/types';

interface SurfaceTriangle {
  boundary: Point[];
  origin: Point;
  height: number;
  slopeX: number;
  slopeY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
const BIN_SIZE = 0.0625;
const bin = (coordinate: number): number => Math.floor(coordinate / BIN_SIZE);

/** Index only upward-facing terrain triangles, keeping ribbon projection local. */
export class SurfaceProjection {
  private readonly bins = new Map<string, SurfaceTriangle[]>();
  readonly triangleCount: number;
  candidateChecks = 0;
  constructor(geometry: THREE.BufferGeometry) {
    const positions = geometry.getAttribute('position');
    let count = 0;
    for (let i = 0; i < positions.count; i += 3) {
      const a = { x: positions.getX(i), y: positions.getZ(i) },
        b = { x: positions.getX(i + 1), y: positions.getZ(i + 1) },
        c = { x: positions.getX(i + 2), y: positions.getZ(i + 2) };
      const det = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      // Vertical curtains have no projected area; downward faces are the closed underside.
      if (det >= -1e-12) continue;
      const height = positions.getY(i),
        db = positions.getY(i + 1) - height,
        dc = positions.getY(i + 2) - height;
      const triangle: SurfaceTriangle = {
        boundary: [a, c, b],
        origin: a,
        height,
        slopeX: (db * (c.y - a.y) - dc * (b.y - a.y)) / det,
        slopeY: ((b.x - a.x) * dc - (c.x - a.x) * db) / det,
        minX: Math.min(a.x, b.x, c.x),
        maxX: Math.max(a.x, b.x, c.x),
        minY: Math.min(a.y, b.y, c.y),
        maxY: Math.max(a.y, b.y, c.y),
      };
      count++;
      for (let x = bin(triangle.minX); x <= bin(triangle.maxX); x++)
        for (let y = bin(triangle.minY); y <= bin(triangle.maxY); y++) {
          const key = `${x},${y}`;
          let items = this.bins.get(key);
          if (!items) {
            items = [];
            this.bins.set(key, items);
          }
          items.push(triangle);
        }
    }
    this.triangleCount = count;
  }
  /** Clip each mask to real top faces, then interpolate that exact triangle's plane. */
  append(mask: Point[], lift: number, output: number[]): void {
    if (mask.length < 3) return;
    const minX = Math.min(...mask.map((p) => p.x)),
      maxX = Math.max(...mask.map((p) => p.x)),
      minY = Math.min(...mask.map((p) => p.y)),
      maxY = Math.max(...mask.map((p) => p.y));
    const candidates = new Set<SurfaceTriangle>();
    for (let x = bin(minX); x <= bin(maxX); x++)
      for (let y = bin(minY); y <= bin(maxY); y++)
        for (const triangle of this.bins.get(`${x},${y}`) ?? []) candidates.add(triangle);
    for (const triangle of candidates) {
      this.candidateChecks++;
      if (
        maxX < triangle.minX - 1e-8 ||
        minX > triangle.maxX + 1e-8 ||
        maxY < triangle.minY - 1e-8 ||
        minY > triangle.maxY + 1e-8
      )
        continue;
      const clipped = clipPolygon(mask, triangle.boundary);
      if (clipped.length < 3 || Math.abs(polygonArea(clipped)) < 1e-12) continue;
      const ordered = polygonArea(clipped) > 0 ? clipped : [...clipped].reverse(),
        center = centroid(ordered);
      ordered.forEach((a, i) => {
        const b = ordered[(i + 1) % ordered.length];
        if (!b) return;
        for (const point of [center, b, a]) {
          const height =
            triangle.height +
            (point.x - triangle.origin.x) * triangle.slopeX +
            (point.y - triangle.origin.y) * triangle.slopeY;
          output.push(point.x, height + lift, point.y);
        }
      });
    }
  }
}
