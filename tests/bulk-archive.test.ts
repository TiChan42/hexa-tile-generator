import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { archiveBoardPath, archiveTilePath, PngArchiveWriter } from '../src/editor/bulkArchive';
import {
  loadBulkExportOptions,
  saveBulkExportOptions,
  BULK_EXPORT_STORAGE_KEY,
} from '../src/editor/bulkStorage';

describe('bulk PNG archives', () => {
  it('names and losslessly compresses vector SVGs alongside PNGs and models', async () => {
    expect(archiveTilePath(0, 'Moor', 'svg', false)).toBe('01-moor.svg');
    expect(archiveTilePath(0, 'Moor', 'svg', true)).toBe('01-moor/draufsicht.svg');
    expect(archiveBoardPath('svg')).toBe('gesamtfeld/draufsicht.svg');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">${'<path d="M0 0L1 0L1 1Z"/>'.repeat(1000)}</svg>`;
    const writer = new PngArchiveWriter();
    await writer.add('gesamtfeld/draufsicht.svg', new Blob([svg], { type: 'image/svg+xml' }));
    const archive = await writer.finish();
    expect(archive.size).toBeLessThan(svg.length / 4);
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(new TextDecoder().decode(files['gesamtfeld/draufsicht.svg'])).toBe(svg);
  });
  it('persists the format selection independently of series files and validates stored preferences', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    expect(loadBulkExportOptions(storage)).toEqual(['top']);
    saveBulkExportOptions(storage, ['svg', 'model']);
    expect(loadBulkExportOptions(storage)).toEqual(['svg', 'model']);
    saveBulkExportOptions(storage, []);
    expect(loadBulkExportOptions(storage)).toEqual([]);
    for (const bad of [
      '{',
      JSON.stringify({ version: 2, options: ['svg'] }),
      JSON.stringify({ version: 1, options: ['svg', 'svg'] }),
      JSON.stringify({ version: 1, options: ['pdf'] }),
    ]) {
      data.set(BULK_EXPORT_STORAGE_KEY, bad);
      expect(loadBulkExportOptions(storage)).toEqual(['top']);
    }
    expect(loadBulkExportOptions(null)).toEqual(['top']);
    expect(() =>
      saveBulkExportOptions(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        ['svg'],
      ),
    ).not.toThrow();
  });
  it('uses flat PNG names by default and separate tile folders for multiple views', () => {
    expect(archiveTilePath(0, 'Nebelmoor ÄÖÜ', 'top', false)).toBe('01-nebelmoor-aou.png');
    expect(archiveTilePath(1, '../', 'top', false)).toBe('02-kachel.png');
    expect(archiveTilePath(0, 'Moor', 'orbit', false)).toBe('01-moor-3d-ansicht.png');
    expect(archiveTilePath(0, 'Moor', 'perspective', false)).toBe('01-moor-perspektive.png');
    for (const [view, name] of [
      ['top', 'draufsicht'],
      ['orbit', '3d-ansicht'],
      ['perspective', 'perspektive'],
    ] as const)
      expect(archiveTilePath(0, 'Moor', view, true)).toBe(`01-moor/${name}.png`);
  });

  it('names individual and whole-board models alongside the overview images', async () => {
    expect(archiveTilePath(1, 'Moor', 'model', false)).toBe('02-moor.glb');
    expect(archiveTilePath(1, 'Moor', 'model', true)).toBe('02-moor/modell.glb');
    expect(archiveBoardPath('model')).toBe('gesamtfeld/modell.glb');
    expect(archiveBoardPath('top')).toBe('gesamtfeld/draufsicht.png');
    expect(archiveBoardPath('orbit')).toBe('gesamtfeld/3d-ansicht.png');
    expect(archiveBoardPath('perspective')).toBe('gesamtfeld/perspektive.png');
    const writer = new PngArchiveWriter();
    await writer.add(archiveBoardPath('model'), new Blob(['glTF']));
    const entries = unzipSync(new Uint8Array(await (await writer.finish()).arrayBuffer()));
    expect(new TextDecoder().decode(entries['gesamtfeld/modell.glb'])).toBe('glTF');
  });

  it('writes valid ZIPs containing the exact PNG payloads without recompression', async () => {
    const writer = new PngArchiveWriter();
    const bytes = new Uint8Array(1024 * 1024 * 9 + 7).fill(42);
    await writer.add('01-moor/draufsicht.png', new Blob([bytes]));
    await writer.add('01-moor/perspektive.png', new Blob([new Uint8Array([137, 80, 78, 71])]));
    const archive = await writer.finish();
    expect(archive.type).toBe('application/zip');
    const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(Object.keys(entries)).toEqual(['01-moor/draufsicht.png', '01-moor/perspektive.png']);
    expect(Buffer.from(entries['01-moor/draufsicht.png']!).equals(Buffer.from(bytes))).toBe(true);
    expect(entries['01-moor/perspektive.png']).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(await writer.finish()).toBe(archive);
    await expect(writer.add('late.png', new Blob())).rejects.toThrow(/abgeschlossen/);
    writer.abort();
  });

  it('supports empty files but rejects an empty export and writes nothing after cancellation', async () => {
    const writer = new PngArchiveWriter();
    await writer.add('empty.png', new Blob());
    expect(
      unzipSync(new Uint8Array(await (await writer.finish()).arrayBuffer()))['empty.png'],
    ).toHaveLength(0);
    await expect(new PngArchiveWriter().finish()).rejects.toThrow(/keine PNG/);
    const cancelled = new PngArchiveWriter();
    cancelled.abort();
    cancelled.abort();
    await expect(cancelled.add('cancelled.png', new Blob())).rejects.toThrow(/abgeschlossen/);
  });
});
