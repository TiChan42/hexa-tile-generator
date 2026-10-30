import { crc32 } from 'node:zlib';
import { z } from 'zod';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PNG_BYTES = 72 * 1024 * 1024;
const validDepths: Record<number, readonly number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};
const dataUrl = z
  .string()
  .startsWith('data:image/png;base64,')
  .max(Math.ceil(MAX_PNG_BYTES / 3) * 4 + 22);

/** Checks the whole chunk envelope; pixel data remains an opaque browser-produced PNG. */
export function decodePng(value: unknown, size: number, height = size): Buffer {
  const parsed = dataUrl.parse(value);
  const encoded = parsed.slice(22);
  if (!encoded.length || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new Error('Ungültige PNG-Base64-Daten.');
  const png = Buffer.from(encoded, 'base64');
  if (png.length < 57 || png.length > MAX_PNG_BYTES || !png.subarray(0, 8).equals(signature))
    throw new Error('Ungültige PNG-Datei.');
  let offset = 8;
  let hasHeader = false;
  let hasImage = false;
  let hasEnd = false;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    if (offset + 12 + length > png.length) throw new Error('Abgeschnittene PNG-Datei.');
    const type = png.toString('latin1', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2]?.toUpperCase())
      throw new Error('Ungültiger PNG-Chunktyp.');
    if (
      crc32(png.subarray(offset + 4, offset + 8 + length)) !== png.readUInt32BE(offset + 8 + length)
    )
      throw new Error('PNG-Prüfsumme stimmt nicht.');
    if (/^[A-Z]/.test(type) && !['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type))
      throw new Error('Unbekannter kritischer PNG-Chunk.');
    if (!hasHeader) {
      if (
        type !== 'IHDR' ||
        length !== 13 ||
        png.readUInt32BE(offset + 8) !== size ||
        png.readUInt32BE(offset + 12) !== height
      ) {
        throw new Error('PNG-Abmessungen stimmen nicht mit der Konfiguration überein.');
      }
      const bitDepth = png[offset + 16] ?? 0;
      const colorType = png[offset + 17] ?? -1;
      if (
        !validDepths[colorType]?.includes(bitDepth) ||
        png[offset + 18] !== 0 ||
        png[offset + 19] !== 0 ||
        (png[offset + 20] ?? 2) > 1
      )
        throw new Error('Ungültiges PNG-Bildformat.');
      hasHeader = true;
    } else if (type === 'IHDR') throw new Error('Doppelter PNG-Bildkopf.');
    if (type === 'IDAT' && length > 0) hasImage = true;
    offset += length + 12;
    if (type === 'IEND') {
      if (length !== 0 || offset !== png.length) throw new Error('Ungültiges PNG-Ende.');
      hasEnd = true;
      break;
    }
  }
  if (!hasHeader || !hasImage || !hasEnd) throw new Error('Unvollständige PNG-Datei.');
  return png;
}
