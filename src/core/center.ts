import { regularPolygon } from './geometry';
import { randomAt } from './random';
import type { Point } from './types';

export interface CenterOptions {
  shape: 'regular' | 'organic';
  scale: number;
  rotation: number;
  irregularity: number;
  offset?: Point;
}

/** Seeded convex five-sided center; limited perturbations preserve a clear pentagon. */
export function createCenterPolygon(seed: string, options: CenterOptions): Point[] {
  const radius = (0.2 / (2 * Math.sin(Math.PI / 5))) * options.scale;
  const angle = -Math.PI / 2 + (options.rotation * Math.PI) / 180;
  const polygon =
    options.shape === 'regular' || options.irregularity === 0
      ? regularPolygon(5, radius, angle)
      : Array.from({ length: 5 }, (_, i) => {
          const rotation =
            angle +
            (i * Math.PI * 2) / 5 +
            (randomAt(seed, 'pentagon-angle', i) - 0.5) * options.irregularity * 0.25;
          const length =
            radius * (1 - options.irregularity * randomAt(seed, 'pentagon-radius', i) * 0.55);
          return { x: Math.cos(rotation) * length, y: Math.sin(rotation) * length };
        });
  const offset = options.offset ?? { x: 0, y: 0 };
  return polygon.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y }));
}
