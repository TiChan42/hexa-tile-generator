import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { CARD_LANDSCAPE_VERSION } from '../src/cards/landscape.js';
import { decodePng } from './png.js';
import {
  cardDesignSchema,
  eventCardSchema,
  eventGeneratorSchema,
  eventProjectSchema,
  createEventProject,
  generateEventCards,
} from '../src/core/events/index.js';
import { eventCardSvg, eventPrintHtml, eventRulesText } from '../src/cards/svg.js';

export class CardApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
interface CardResponse {
  status: number;
  value: unknown;
  contentType?: string;
}
interface CardManifest {
  id: string;
  name: string;
  cards: number;
  generatorVersion: string;
  path: string;
  projectUrl: string;
  printUrl: string;
}
const renderRequest = z
  .object({
    version: z.literal(1),
    card: eventCardSchema,
    design: cardDesignSchema,
    side: z.enum(['front', 'back']),
    landscapeSeed: z.string().min(1).max(128).optional(),
    backImage: z
      .string()
      .startsWith('data:image/png;base64,')
      .max(20 * 1024 * 1024)
      .optional(),
    frontImage: z
      .string()
      .startsWith('data:image/png;base64,')
      .max(8 * 1024 * 1024)
      .optional(),
  })
  .strict();
const generateRequest = z
  .object({ version: z.literal(1), generator: eventGeneratorSchema })
  .strict();
const illustratedProjectSchema = z
  .object({
    project: eventProjectSchema,
    backImage: z
      .string()
      .startsWith('data:image/png;base64,')
      .max(20 * 1024 * 1024)
      .optional(),
    artwork: z.record(
      z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
      z
        .string()
        .startsWith('data:image/png;base64,')
        .max(8 * 1024 * 1024),
    ),
  })
  .strict();
function readProject(value: unknown) {
  const plain = eventProjectSchema.safeParse(value);
  if (plain.success)
    return {
      project: plain.data,
      artwork: {} as Record<string, string>,
      backImage: undefined as string | undefined,
    };
  const result = illustratedProjectSchema.parse(value);
  const ids = new Set(result.project.cards.map((card) => card.id));
  if (
    Object.keys(result.artwork).length !== ids.size ||
    Object.keys(result.artwork).some((id) => !ids.has(id))
  )
    throw new CardApiError(400, 'Jede Karte benötigt genau eine zugehörige 3D-Aufnahme.');
  if (result.backImage) decodePng(result.backImage, 1512, 2112);
  for (const image of Object.values(result.artwork)) decodePng(image, 1512, 712);
  return result;
}
const projectId = /^deck-[a-f\d]{24}$/;
async function saveProject(
  root: string,
  value: unknown,
): Promise<CardManifest & { existing: boolean }> {
  const { project, artwork, backImage } = readProject(value);
  if (!project.cards.length)
    throw new CardApiError(400, 'Zum Speichern wird mindestens eine Karte benötigt.');
  const json = `${JSON.stringify(project, null, 2)}\n`;
  const id = `deck-${createHash('sha256')
    .update(json)
    .update(`card-render-v${CARD_LANDSCAPE_VERSION}`)
    .update(JSON.stringify(artwork))
    .update(backImage ?? '')
    .digest('hex')
    .slice(0, 24)}`;
  const directory = join(root, 'working', 'cards'),
    target = join(directory, id),
    staging = join(directory, `.staging-${randomUUID()}`);
  const manifest: CardManifest = {
    id,
    name: project.name,
    cards: project.cards.length,
    generatorVersion: project.generatorVersion,
    path: `working/cards/${id}`,
    projectUrl: `/api/card-projects/${id}`,
    printUrl: `/api/card-projects/${id}/print.html`,
  };
  // Render before writing anything: text overflow must not leave a partial project.
  const fronts = project.cards.map((card) => ({
    id: card.id,
    svg: eventCardSvg(card, project.design, 'front', project.generator.seed, artwork[card.id]),
  }));
  const back = eventCardSvg(
    project.cards[0]!,
    project.design,
    'back',
    project.generator.seed,
    undefined,
    backImage,
  );
  const printable = eventPrintHtml(project, artwork, backImage);
  await mkdir(join(staging, 'fronts'), { recursive: true });
  try {
    await writeFile(join(staging, 'project.json'), json, { flag: 'wx' });
    await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest), { flag: 'wx' });
    await writeFile(join(staging, 'back.svg'), back, { flag: 'wx' });
    await writeFile(join(staging, 'print.html'), printable, { flag: 'wx' });
    await writeFile(join(staging, 'rules.txt'), eventRulesText(project), { flag: 'wx' });
    for (const front of fronts)
      await writeFile(join(staging, 'fronts', `${front.id}.svg`), front.svg, { flag: 'wx' });
    try {
      await rename(staging, target);
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? ''))
        throw error;
      return { ...manifest, existing: true };
    }
    return { ...manifest, existing: false };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
export async function eventCardApi(
  root: string,
  pathname: string,
  method: string,
  body?: unknown,
): Promise<CardResponse> {
  if (pathname === '/api/cards/default') {
    if (method !== 'GET') throw new CardApiError(405, 'Methode nicht erlaubt.');
    return { status: 200, value: createEventProject() };
  }
  if (pathname === '/api/cards/schema') {
    if (method !== 'GET') throw new CardApiError(405, 'Methode nicht erlaubt.');
    return {
      status: 200,
      value: {
        version: 1,
        project: z.toJSONSchema(eventProjectSchema),
        generator: z.toJSONSchema(eventGeneratorSchema),
        render: z.toJSONSchema(renderRequest),
      },
    };
  }
  if (pathname === '/api/cards/generate') {
    if (method !== 'POST') throw new CardApiError(405, 'Methode nicht erlaubt.');
    const request = generateRequest.parse(body);
    return { status: 200, value: { version: 1, cards: generateEventCards(request.generator) } };
  }
  if (pathname === '/api/cards/render') {
    if (method !== 'POST') throw new CardApiError(405, 'Methode nicht erlaubt.');
    const { card, design, side, landscapeSeed, frontImage, backImage } = renderRequest.parse(body);
    if (frontImage) decodePng(frontImage, 1512, 712);
    if (backImage) decodePng(backImage, 1512, 2112);
    return {
      status: 200,
      value: eventCardSvg(card, design, side, landscapeSeed, frontImage, backImage),
      contentType: 'image/svg+xml; charset=utf-8',
    };
  }
  if (pathname === '/api/cards/print') {
    if (method !== 'POST') throw new CardApiError(405, 'Methode nicht erlaubt.');
    const { project, artwork, backImage } = readProject(body);
    if (!project.cards.length)
      throw new CardApiError(400, 'Zum Drucken wird mindestens eine Karte benötigt.');
    return {
      status: 200,
      value: eventPrintHtml(project, artwork, backImage),
      contentType: 'text/html; charset=utf-8',
    };
  }
  if (pathname === '/api/card-projects') {
    if (method === 'POST') return { status: 201, value: await saveProject(root, body) };
    if (method !== 'GET') throw new CardApiError(405, 'Methode nicht erlaubt.');
    const manifests: CardManifest[] = [];
    let entries: string[];
    try {
      entries = await readdir(join(root, 'working', 'cards'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      entries = [];
    }
    for (const entry of entries.filter((id) => projectId.test(id)).sort()) {
      try {
        manifests.push(
          JSON.parse(
            await readFile(join(root, 'working', 'cards', entry, 'manifest.json'), 'utf8'),
          ) as CardManifest,
        );
      } catch {
        /* Unfinished or unrelated external artifacts do not become library entries. */
      }
    }
    return { status: 200, value: manifests };
  }
  const match =
    /^\/api\/card-projects\/([^/]+)(?:\/(project\.json|back\.svg|print\.html|rules\.txt|fronts\/[a-z0-9][a-z0-9-]{0,63}\.svg))?$/.exec(
      pathname,
    );
  if (match) {
    if (method !== 'GET') throw new CardApiError(405, 'Methode nicht erlaubt.');
    const id = match[1]!;
    if (!projectId.test(id)) throw new CardApiError(400, 'Ungültige Kartenset-ID.');
    const file = match[2] ?? 'project.json';
    const value = await readFile(join(root, 'working', 'cards', id, file), 'utf8');
    return {
      status: 200,
      value: file.endsWith('.json') ? JSON.parse(value) : value,
      contentType: file.endsWith('.svg')
        ? 'image/svg+xml; charset=utf-8'
        : file.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : file.endsWith('.txt')
            ? 'text/plain; charset=utf-8'
            : undefined,
    };
  }
  throw new CardApiError(404, 'Karten-Endpunkt nicht gefunden.');
}
