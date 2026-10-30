import { strToU8, zipSync } from 'fflate';
import type { EventProject } from '../core/events';
import { frontArtwork, backArtwork } from './artwork';
import { eventCardSvg, eventPrintHtml, eventRulesText } from './svg';
export async function cardPng(svg: string, scale = 2): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 756 * scale;
    canvas.height = 1056 * scale;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG-Export ist in diesem Browser nicht verfügbar.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((accept, reject) =>
      canvas.toBlob(
        (value) => (value ? accept(value) : reject(new Error('PNG-Export fehlgeschlagen.'))),
        'image/png',
      ),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    canvas.width = canvas.height = 0;
    return bytes;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function eventCardArchive(
  project: EventProject,
  includePng: boolean,
  progress: (done: number, total: number) => void,
): Promise<Blob> {
  if (!project.cards.length) throw new Error('Das Kartenset ist leer.');
  const snapshot = structuredClone(project);
  const files: Record<string, Uint8Array> = {
    'project.json': strToU8(JSON.stringify(snapshot, null, 2)),
    'regelhinweise.txt': strToU8(eventRulesText(snapshot)),
  };
  const artwork: Record<string, string> = {};
  for (const [index, card] of snapshot.cards.entries()) {
    const name = `${String(index + 1).padStart(3, '0')}-${card.id}`;
    artwork[card.id] = await frontArtwork(snapshot.generator.seed, card.id);
    const svg = eventCardSvg(
      card,
      snapshot.design,
      'front',
      snapshot.generator.seed,
      artwork[card.id],
    );
    files[`vorderseiten/${name}.svg`] = strToU8(svg);
    if (includePng) files[`vorderseiten/${name}.png`] = await cardPng(svg);
    progress(index + 1, snapshot.cards.length + 1);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  const backImage = await backArtwork(snapshot.generator.seed, snapshot.design.backRevision);
  files['druckbogen.html'] = strToU8(eventPrintHtml(snapshot, artwork, backImage));
  const back = eventCardSvg(
    snapshot.cards[0]!,
    snapshot.design,
    'back',
    snapshot.generator.seed,
    undefined,
    backImage,
  );
  files['rueckseite.svg'] = strToU8(back);
  if (includePng) files['rueckseite.png'] = await cardPng(back);
  progress(snapshot.cards.length + 1, snapshot.cards.length + 1);
  return new Blob([zipSync(files, { level: 6 }) as Uint8Array<ArrayBuffer>], {
    type: 'application/zip',
  });
}
export function saveCardDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
