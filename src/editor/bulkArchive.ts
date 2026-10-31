import { Zip, ZipPassThrough, ZipDeflate } from 'fflate';

export type BulkExportView = 'top' | 'orbit' | 'perspective';
export const BULK_EXPORT_OPTIONS = ['top', 'orbit', 'perspective', 'svg', 'model'] as const;
export type BulkExportOption = (typeof BULK_EXPORT_OPTIONS)[number];

const VIEW_FILES: Record<BulkExportView, string> = {
  top: 'draufsicht.png',
  orbit: '3d-ansicht.png',
  perspective: 'perspektive.png',
};

export function archiveTilePath(
  tileIndex: number,
  tileName: string,
  view: BulkExportOption,
  multipleViews: boolean,
): string {
  const sequence = String(tileIndex + 1).padStart(2, '0');
  const slug =
    tileName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'kachel';
  const directory = `${sequence}-${slug}`;
  if (view === 'model') return multipleViews ? `${directory}/modell.glb` : `${directory}.glb`;
  if (view === 'svg') return multipleViews ? `${directory}/draufsicht.svg` : `${directory}.svg`;
  if (multipleViews) return `${directory}/${VIEW_FILES[view]}`;
  const suffix = view === 'top' ? '' : `-${VIEW_FILES[view]!.replace('.png', '')}`;
  return `${directory}${suffix}.png`;
}

export function archiveBoardPath(option: BulkExportOption): string {
  return option === 'model'
    ? 'gesamtfeld/modell.glb'
    : option === 'svg'
      ? 'gesamtfeld/draufsicht.svg'
      : `gesamtfeld/${VIEW_FILES[option]}`;
}

/** Stream binary payloads unchanged; compress SVG text while keeping bounded input chunks. */
export class PngArchiveWriter {
  private readonly chunks: BlobPart[] = [];
  private readonly archive: Zip;
  private readonly result: Promise<Blob>;
  private resolveArchive: (blob: Blob) => void = () => undefined;
  private rejectArchive: (error: Error) => void = () => undefined;
  private archiveError: Error | null = null;
  private entryCount = 0;
  private ended = false;

  constructor() {
    this.result = new Promise<Blob>((resolve, reject) => {
      this.resolveArchive = resolve;
      this.rejectArchive = reject;
    });
    this.archive = new Zip((error, data, final) => {
      if (error) {
        this.archiveError = error;
        if (this.ended) this.rejectArchive(error);
        return;
      }
      if (data.length) this.chunks.push(data as BlobPart);
      if (final) this.resolveArchive(new Blob(this.chunks, { type: 'application/zip' }));
    });
  }

  async add(path: string, blob: Blob): Promise<void> {
    if (this.ended) throw new Error('Das ZIP wurde bereits abgeschlossen.');
    if (this.archiveError) throw this.archiveError;
    const file = path.endsWith('.svg')
      ? new ZipDeflate(path, { level: 6 })
      : new ZipPassThrough(path);
    file.mtime = new Date('1980-01-01T00:00:00.000Z');
    this.archive.add(file);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunkSize = 1024 * 1024;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, bytes.length);
      file.push(bytes.subarray(offset, end), end === bytes.length);
      if (end < bytes.length && end % (chunkSize * 8) === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (!bytes.length) file.push(bytes, true);
    this.entryCount++;
    if (this.archiveError) throw this.archiveError;
  }

  finish(): Promise<Blob> {
    if (this.ended) return this.result;
    this.ended = true;
    if (!this.entryCount) {
      this.archive.terminate();
      this.rejectArchive(new Error('Der ZIP-Export enthält keine PNG-, SVG- oder GLB-Dateien.'));
      return this.result;
    }
    this.archive.end();
    return this.result;
  }

  abort(): void {
    if (this.ended) return;
    this.ended = true;
    this.archive.terminate();
  }
}
