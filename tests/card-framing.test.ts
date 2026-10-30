import { expect, it } from 'vitest';
import { frontArtworkCrop } from '../src/cards/framing';

it('keeps a clear margin above the rear silhouette and fills the entire foreground edge', () => {
  const size = 128,
    pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 20; y < size; y++) {
    const half = Math.min(62, (y - 20) * 2 + 12);
    for (let x = 64 - half; x < 64 + half; x++) pixels[(y * size + x) * 4 + 3] = 255;
  }
  const crop = frontArtworkCrop(pixels, size);
  expect(crop.y).toBeLessThan(20);
  expect(crop.width).toBeGreaterThan(100);
  expect(crop.height / crop.width).toBeCloseTo(356 / 756, 1);
  for (let x = crop.x; x < crop.x + crop.width; x++) {
    expect(pixels[(crop.y * size + x) * 4 + 3]).toBe(0);
    expect(pixels[((crop.y + crop.height - 1) * size + x) * 4 + 3]).toBe(255);
  }
});
it('reports empty and unframeable captures instead of silently cutting their rear edge', () => {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  expect(() => frontArtworkCrop(pixels, 64)).toThrow('keine sichtbare');
  pixels[(5 * 64 + 32) * 4 + 3] = 255;
  expect(() => frontArtworkCrop(pixels, 64)).toThrow('hintere Kachelkante');
});
