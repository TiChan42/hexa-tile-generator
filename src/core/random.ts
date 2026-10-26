/** Stateless domain-separated randomness: edits in one layer cannot shift another layer. */
export function hash32(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}
export function randomAt(seed: string, domain: string, ...keys: (string | number)[]): number {
  return hash32(JSON.stringify([seed, domain, ...keys])) / 4294967296;
}
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export function perlin(seed: string, x: number, y: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const grad = (gx: number, gy: number, dx: number, dy: number): number => {
    const angle = ((hash32(`${seed}:${gx}:${gy}`) & 7) * Math.PI) / 4;
    return Math.cos(angle) * dx + Math.sin(angle) * dy;
  };
  return lerp(
    lerp(grad(ix, iy, fx, fy), grad(ix + 1, iy, fx - 1, fy), fade(fx)),
    lerp(grad(ix, iy + 1, fx, fy - 1), grad(ix + 1, iy + 1, fx - 1, fy - 1), fade(fx)),
    fade(fy),
  );
}
export function fbm(
  seed: string,
  x: number,
  y: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
): number {
  let sum = 0,
    amplitude = 1,
    total = 0,
    frequency = 1;
  for (let i = 0; i < octaves; i++) {
    sum += perlin(`${seed}:height:${i}`, x * frequency + 19.13, y * frequency - 8.73) * amplitude;
    total += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return Math.max(0, Math.min(1, 0.5 + sum / total));
}
