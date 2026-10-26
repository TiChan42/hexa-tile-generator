import type { VoxelModel } from '../voxels';

export type VoxelPoint = readonly [number, number, number];

/** Small code-native sculpting primitives; all results have stable numeric coordinate order. */
export class VoxelBuilder {
  private readonly occupied = new Map<string, [number, number, number, number]>();
  constructor(
    readonly id: string,
    readonly name: string,
    readonly size: VoxelModel['size'],
    readonly palette: string[],
  ) {}
  set(x: number, y: number, z: number, color: number): void {
    if (x < 0 || y < 0 || z < 0 || x >= this.size[0] || y >= this.size[1] || z >= this.size[2])
      return;
    this.occupied.set(`${x},${y},${z}`, [x, y, z, color]);
  }
  has(x: number, y: number, z: number): boolean {
    return this.occupied.has(`${x},${y},${z}`);
  }
  box(from: VoxelPoint, to: VoxelPoint, color: number): void {
    for (let x = from[0]; x <= to[0]; x++)
      for (let y = from[1]; y <= to[1]; y++)
        for (let z = from[2]; z <= to[2]; z++) this.set(x, y, z, color);
  }
  /** Axis-connected stair steps keep slender stems and branches attached by faces. */
  line(from: VoxelPoint, to: VoxelPoint, color: number, radius = 0): void {
    const current = [...from],
      steps = Math.max(1, ...to.map((value, i) => Math.abs(value - from[i]!))) * 3;
    const paint = (): void => {
      for (let dx = -radius; dx <= radius; dx++)
        for (let dy = -radius; dy <= radius; dy++)
          for (let dz = -radius; dz <= radius; dz++)
            if (dx * dx + dy * dy + dz * dz <= radius * radius)
              this.set(current[0]! + dx, current[1]! + dy, current[2]! + dz, color);
    };
    paint();
    for (let i = 1; i <= steps; i++) {
      const target = to.map((value, axis) =>
        Math.round(from[axis]! + ((value - from[axis]!) * i) / steps),
      );
      for (let axis = 0; axis < 3; axis++)
        while (current[axis] !== target[axis]) {
          current[axis]! += Math.sign(target[axis]! - current[axis]!);
          paint();
        }
    }
  }
  ellipsoid(
    center: VoxelPoint,
    radius: VoxelPoint,
    color: number | ((x: number, y: number, z: number) => number),
  ): void {
    const [cx, cy, cz] = center,
      [rx, ry, rz] = radius;
    for (
      let x = Math.max(0, Math.ceil(cx - rx));
      x <= Math.min(this.size[0] - 1, Math.floor(cx + rx));
      x++
    )
      for (
        let y = Math.max(0, Math.ceil(cy - ry));
        y <= Math.min(this.size[1] - 1, Math.floor(cy + ry));
        y++
      )
        for (
          let z = Math.max(0, Math.ceil(cz - rz));
          z <= Math.min(this.size[2] - 1, Math.floor(cz + rz));
          z++
        )
          if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1)
            this.set(x, y, z, typeof color === 'number' ? color : color(x, y, z));
  }
  finish(): VoxelModel {
    return {
      id: this.id,
      name: this.name,
      size: [...this.size],
      palette: [...this.palette],
      voxels: [...this.occupied.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]),
    };
  }
}
