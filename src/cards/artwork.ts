import * as THREE from 'three';
import { disposeExportContent } from '../render/modelExport';
import { frontArtworkCrop } from './framing';
import { TileRenderer } from '../render/TileRenderer';
import { cardFrontScene, cardBackScene, CARD_LANDSCAPE_VERSION } from './landscape';
import type { EventProject } from '../core/events';

const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();
let instance: TileRenderer | undefined;
let container: HTMLDivElement | undefined;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
function release() {
  instance?.dispose();
  instance = undefined;
  container?.remove();
  container = undefined;
}
function renderer() {
  if (instance) return instance;
  container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText =
    'position:fixed;left:-2000px;top:0;width:512px;height:512px;pointer-events:none';
  document.body.appendChild(container);
  try {
    instance = new TileRenderer(container);
  } catch (error) {
    release();
    throw error;
  }
  return instance;
}
async function render(seed: string, cardId: string): Promise<string> {
  if (releaseTimer) clearTimeout(releaseTimer);
  const { config, tile } = cardFrontScene(seed, cardId);
  const view = renderer();
  try {
    view.update(tile, config);
    const blob = await view.exportPng(1536, true, config.camera);
    const bitmap = await createImageBitmap(blob);
    const source = document.createElement('canvas');
    source.width = source.height = 1536;
    const context = source.getContext('2d');
    if (!context) {
      bitmap.close();
      throw new Error('Die 3D-Kartenaufnahme konnte nicht erstellt werden.');
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const crop = frontArtworkCrop(context.getImageData(0, 0, 1536, 1536).data, 1536);
    const canvas = document.createElement('canvas');
    canvas.width = 1512;
    canvas.height = 712;
    const output = canvas.getContext('2d');
    if (!output) throw new Error('Die 3D-Kartenaufnahme konnte nicht erstellt werden.');
    output.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, 1512, 712);
    const image = canvas.toDataURL('image/png');
    source.width = source.height = canvas.width = canvas.height = 0;
    return image;
  } finally {
    releaseTimer = setTimeout(release, 15000);
  }
}
/** Reproducible scene recipe; the session cache never enters project JSON or browser storage. */
export function frontArtwork(seed: string, cardId: string): Promise<string> {
  const key = JSON.stringify([CARD_LANDSCAPE_VERSION, seed, cardId]);
  const existing = cache.get(key);
  if (existing) return existing;
  const task = queue.then(() => render(seed, cardId));
  queue = task.catch(() => undefined);
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(key, task);
  void task.catch(() => cache.delete(key));
  return task;
}
export async function projectArtwork(
  project: EventProject,
  progress?: (done: number, total: number) => void,
) {
  const images: Record<string, string> = {};
  for (const [index, card] of project.cards.entries()) {
    images[card.id] = await frontArtwork(project.generator.seed, card.id);
    progress?.(index + 1, project.cards.length);
  }
  return images;
}

const backCache = new Map<string, Promise<string>>();
async function renderBack(seed: string, revision: number): Promise<string> {
  if (releaseTimer) clearTimeout(releaseTimer);
  const view = renderer(),
    board = new THREE.Group();
  try {
    for (let column = 0; column < 4; column++)
      for (let row = 0; row < 5; row++) {
        const { config, tile } = cardBackScene(seed, revision, column, row);
        view.update(tile, config);
        board.add(
          view.snapshotForExport(
            column * 1.5,
            row * Math.sqrt(3) + ((column % 2) * Math.sqrt(3)) / 2,
          ),
        );
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    const blob = await view.exportBoardPng(board, 1536, true, {
      mode: 'top',
      azimuth: 0,
      elevation: 90,
      fov: 0,
      zoom: 1,
    });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = 1512;
    canvas.height = 2112;
    const output = canvas.getContext('2d');
    if (!output) {
      bitmap.close();
      throw new Error('Die Kartenrückseite konnte nicht aufgenommen werden.');
    }
    output.fillStyle = '#748963';
    output.fillRect(0, 0, canvas.width, canvas.height);
    const width = 1536 * 0.46,
      height = (width * 1056) / 756;
    output.drawImage(
      bitmap,
      (1536 - width) / 2,
      (1536 - height) / 2,
      width,
      height,
      0,
      0,
      1512,
      2112,
    );
    bitmap.close();
    const image = canvas.toDataURL('image/png');
    canvas.width = canvas.height = 0;
    return image;
  } finally {
    disposeExportContent(board);
    releaseTimer = setTimeout(release, 15000);
  }
}
export function backArtwork(seed: string, revision: number): Promise<string> {
  const key = JSON.stringify([CARD_LANDSCAPE_VERSION, seed, revision]);
  const existing = backCache.get(key);
  if (existing) return existing;
  const task = queue.then(() => renderBack(seed, revision));
  queue = task.catch(() => undefined);
  if (backCache.size >= 4) backCache.delete(backCache.keys().next().value!);
  backCache.set(key, task);
  void task.catch(() => backCache.delete(key));
  return task;
}
