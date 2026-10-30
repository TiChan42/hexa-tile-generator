export interface ArtworkCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Keep the entire rear silhouette above an opaque foreground edge. */
export function frontArtworkCrop(pixels: Uint8ClampedArray, size: number): ArtworkCrop {
  const alpha = (x: number, y: number) => pixels[(y * size + x) * 4 + 3]!;
  let rear = size;
  for (let y = 0; y < size && rear === size; y++)
    for (let x = 0; x < size; x++)
      if (alpha(x, y) > 16) {
        rear = y;
        break;
      }
  if (rear === size) throw new Error('Die Kachelaufnahme enthält keine sichtbare Landschaft.');
  const top = Math.max(0, rear - Math.max(12, Math.round(size * 0.015)));
  for (let percent = 98; percent >= 20; percent -= 2) {
    const width = Math.floor((size * percent) / 100),
      height = Math.floor((width * 356) / 756);
    const x = Math.floor((size - width) / 2),
      bottom = top + height - 1;
    if (bottom >= size) continue;
    let opaque = true;
    for (let dx = 0; dx < width; dx++)
      if (alpha(x + dx, bottom) < 254) {
        opaque = false;
        break;
      }
    if (opaque) return { x, y: top, width, height };
  }
  throw new Error(
    'Die hintere Kachelkante konnte nicht zusammen mit einer gefüllten Vorderkante eingepasst werden.',
  );
}
