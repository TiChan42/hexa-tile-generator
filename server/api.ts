import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { z, ZodError } from 'zod';
import { configSchema } from '../src/core/config.js';
import { bulkProjectSchema } from '../src/core/bulk.js';
import { generateTile } from '../src/core/generate.js';
import { getExportRuleIssues } from '../src/core/rules.js';
import type { GeneratedTile } from '../src/core/types.js';
import { decodePng } from './png.js';
import { normalizeModel, readStoredModel, type StoredVoxelModel } from './models.js';
import { CardApiError, eventCardApi } from './cards.js';
import { EventGenerationError } from '../src/core/events/index.js';
import {
  readActionProbabilities,
  saveActionProbabilities,
  ProbabilityConflict,
} from './action-probabilities.js';

const MAX_BODY_BYTES = 100 * 1024 * 1024;
const identifier = /^[a-z0-9][a-z0-9-]{0,119}$/;
const modelIdentifier = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,119}$/;
const tileRequest = z.object({ config: z.unknown(), png: z.unknown() }).strict();
const seriesRequest = z
  .object({ version: z.literal(1), project: bulkProjectSchema, png: z.unknown() })
  .strict();

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface TileManifest {
  id: string;
  name: string;
  seed: string;
  size: number;
  configHash: string;
  pngHash: string;
  generatorVersion: string;
  path: string;
  pngUrl: string;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
function slug(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 35) || 'tile'
  );
}
function errorCode(value: unknown): string {
  return typeof value === 'object' && value !== null && 'code' in value ? String(value.code) : '';
}

async function readJson(request: IncomingMessage, limit = MAX_BODY_BYTES): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json'))
    throw new HttpError(415, 'Content-Type application/json erforderlich.');
  const declared = Number(request.headers['content-length'] ?? 0);
  if (declared > limit) throw new HttpError(413, 'Datei ist zu groß.');
  return new Promise((accept, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        if (!failed) reject(new HttpError(413, 'Datei ist zu groß.'));
        failed = true;
      } else if (!failed) chunks.push(chunk);
    });
    request.on('error', reject);
    request.on('end', () => {
      if (failed) return;
      try {
        accept(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
      } catch {
        reject(new HttpError(400, 'Ungültiges JSON.'));
      }
    });
  });
}

async function entries(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return [];
    throw error;
  }
}

async function storedModels(root: string): Promise<StoredVoxelModel[]> {
  const result: StoredVoxelModel[] = [];
  for (const [directory, builtin] of [
    [join(root, 'public', 'models'), true],
    [join(root, 'working', 'models'), false],
  ] as const) {
    for (const file of await entries(directory)) {
      if (!file.endsWith('.json')) continue;
      try {
        result.push(
          readStoredModel(
            JSON.parse(await readFile(join(directory, file), 'utf8')) as unknown,
            builtin,
          ),
        );
      } catch {
        /* Ignore unrelated manifests and incomplete external models. */
      }
    }
  }
  return result;
}

async function persistTile(
  root: string,
  value: unknown,
): Promise<TileManifest & { existing: boolean }> {
  const request = tileRequest.parse(value);
  // Saving couples an already-rendered PNG to its exact current-format configuration (schema 15 / generator 15.0.0).
  // Legacy imports must be migrated and rendered in the editor before this endpoint.
  const config = configSchema.parse(request.config);
  const png = decodePng(request.png, config.export.size);
  if (config.rules.exportPolicy === 'block') {
    let tile: GeneratedTile;
    try {
      tile = generateTile(config);
    } catch (error) {
      throw new HttpError(
        400,
        `Export nicht möglich: ${error instanceof Error ? error.message : 'Die Geometrie konnte nicht erzeugt werden.'}`,
      );
    }
    const issues = getExportRuleIssues(config, tile);
    if (issues.length)
      throw new HttpError(
        400,
        `Export durch Prüfregeln blockiert: ${issues
          .slice(0, 5)
          .map((issue) => issue.message)
          .join(
            ' ',
          )}${issues.length > 5 ? ` Weitere ${issues.length - 5} Regelverletzungen.` : ''}`,
      );
  }
  const configJson = `${JSON.stringify(config, null, 2)}\n`;
  const configHash = digest(configJson);
  const id = `${slug(config.name)}-${slug(config.seed)}-${configHash.slice(0, 16)}`;
  const working = join(root, 'working');
  const target = join(working, id);
  await mkdir(working, { recursive: true });
  const manifest: TileManifest = {
    id,
    name: config.name,
    seed: config.seed,
    size: config.export.size,
    configHash,
    pngHash: digest(png),
    generatorVersion: config.generatorVersion,
    path: `working/${id}`,
    pngUrl: `/api/tiles/${id}/tile.png`,
  };
  const staging = join(working, `.staging-${randomUUID()}`);
  await mkdir(staging);
  try {
    await writeFile(join(staging, 'config.json'), configJson, { flag: 'wx' });
    await writeFile(join(staging, 'tile.png'), png, { flag: 'wx' });
    await writeFile(join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: 'wx',
    });
    try {
      await rename(staging, target);
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(errorCode(error))) throw error;
      const existing = JSON.parse(
        await readFile(join(target, 'manifest.json'), 'utf8'),
      ) as TileManifest;
      return { ...existing, existing: true };
    }
    return { ...manifest, existing: false };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function persistSeries(root: string, value: unknown) {
  const { project, png: suppliedPng } = seriesRequest.parse(value);
  const first = project.tiles.find((tile) => tile.id === project.order[0])!.config;
  const png = decodePng(suppliedPng, first.export.size);
  for (const item of project.tiles) {
    if (item.config.rules.exportPolicy !== 'block') continue;
    let tile: GeneratedTile;
    try {
      tile = generateTile(item.config);
    } catch (error) {
      throw new HttpError(
        400,
        `Export nicht möglich: ${error instanceof Error ? error.message : 'Ungültige Geometrie.'}`,
      );
    }
    const issues = getExportRuleIssues(item.config, tile);
    if (issues.length)
      throw new HttpError(
        400,
        `${item.config.name}: Export durch Prüfregeln blockiert. ${issues.map((issue) => issue.message).join(' ')}`,
      );
  }
  const projectJson = `${JSON.stringify(project, null, 2)}\n`;
  const id = `serie-${slug(project.seed).slice(0, 60)}-${digest(projectJson).slice(0, 16)}-${digest(png).slice(0, 12)}`;
  const directory = join(root, 'working', 'series');
  const target = join(directory, id);
  const staging = join(directory, `.staging-${randomUUID()}`);
  const result = { path: `working/series/${id}`, pngUrl: `/api/series/${id}/gesamtfeld.png` };
  await mkdir(staging, { recursive: true });
  try {
    await writeFile(join(staging, 'project.json'), projectJson, { flag: 'wx' });
    await writeFile(join(staging, 'gesamtfeld.png'), png, { flag: 'wx' });
    try {
      await rename(staging, target);
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(errorCode(error))) throw error;
      return { ...result, existing: true };
    }
    return { ...result, existing: false };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function persistModel(root: string, value: unknown): Promise<StoredVoxelModel> {
  const model = normalizeModel(value);
  const directory = join(root, 'working', 'models');
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(join(directory, `${model.id}.json`), `${JSON.stringify(model, null, 2)}\n`, {
      flag: 'wx',
    });
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error;
  }
  return model;
}

/** Local-only API shared by Vite and the production static server. */
export function createApiHandler(projectRoot: string) {
  const root = resolve(projectRoot);
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next?: () => void,
  ): Promise<void> => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      json(response, 400, { error: 'Ungültiger Pfad.' });
      return;
    }
    if (!pathname.startsWith('/api/')) {
      next?.();
      return;
    }
    if (
      pathname.split('/').some((part) => part === '..' || part === '.') ||
      pathname.includes('\\') ||
      pathname.includes('\0')
    ) {
      json(response, 400, { error: 'Ungültiger Pfad.' });
      return;
    }
    try {
      const origin = request.headers.origin;
      if (origin) {
        let originHost: string;
        try {
          originHost = new URL(origin).host;
        } catch {
          throw new HttpError(403, 'Ungültiger Browser-Ursprung.');
        }
        if (originHost !== request.headers.host)
          throw new HttpError(403, 'Nur Anfragen vom lokalen Editor sind erlaubt.');
      }
      if (pathname === '/api/action-probabilities') {
        if (request.method === 'GET') json(response, 200, await readActionProbabilities(root));
        else if (request.method === 'POST')
          json(
            response,
            200,
            await saveActionProbabilities(root, await readJson(request, 128 * 1024)),
          );
        else throw new HttpError(405, 'Methode nicht erlaubt.');
        return;
      }
      if (
        pathname.startsWith('/api/cards/') ||
        pathname === '/api/card-projects' ||
        pathname.startsWith('/api/card-projects/')
      ) {
        const result = await eventCardApi(
          root,
          pathname,
          request.method ?? 'GET',
          request.method === 'POST'
            ? await readJson(
                request,
                pathname === '/api/card-projects' || pathname === '/api/cards/print'
                  ? 64 * 1024 * 1024
                  : pathname === '/api/cards/render'
                    ? 30 * 1024 * 1024
                    : 2 * 1024 * 1024,
              )
            : undefined,
        );
        if (!result.contentType) json(response, result.status, result.value);
        else {
          response.writeHead(result.status, {
            'Content-Type': result.contentType,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          });
          response.end(result.value as string);
        }
        return;
      }
      if (pathname === '/api/tiles') {
        if (request.method === 'POST') {
          json(response, 201, await persistTile(root, await readJson(request)));
          return;
        }
        if (request.method === 'GET') {
          const manifests: TileManifest[] = [];
          for (const entry of await entries(join(root, 'working'))) {
            if (!identifier.test(entry) || entry === 'models') continue;
            try {
              manifests.push(
                JSON.parse(
                  await readFile(join(root, 'working', entry, 'manifest.json'), 'utf8'),
                ) as TileManifest,
              );
            } catch {
              /* Other working files are not exports. */
            }
          }
          json(response, 200, manifests);
          return;
        }
        throw new HttpError(405, 'Methode nicht erlaubt.');
      }
      if (pathname === '/api/series') {
        if (request.method !== 'POST') throw new HttpError(405, 'Methode nicht erlaubt.');
        json(response, 201, await persistSeries(root, await readJson(request)));
        return;
      }
      const seriesMatch = /^\/api\/series\/([^/]+)\/(project\.json|gesamtfeld\.png)$/.exec(
        pathname,
      );
      if (seriesMatch) {
        if (request.method !== 'GET') throw new HttpError(405, 'Methode nicht erlaubt.');
        const id = seriesMatch[1]!;
        if (!identifier.test(id)) throw new HttpError(400, 'Ungültige Serien-ID.');
        const file = seriesMatch[2]!;
        const bytes = await readFile(join(root, 'working', 'series', id, file));
        response.writeHead(200, {
          'Content-Type': file.endsWith('.png') ? 'image/png' : 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(bytes);
        return;
      }
      if (pathname === '/api/models') {
        if (request.method === 'GET') {
          json(response, 200, await storedModels(root));
          return;
        }
        if (request.method === 'POST') {
          json(response, 201, await persistModel(root, await readJson(request, 2 * 1024 * 1024)));
          return;
        }
        throw new HttpError(405, 'Methode nicht erlaubt.');
      }
      const modelMatch = /^\/api\/models\/([^/]+)$/.exec(pathname);
      if (modelMatch) {
        if (request.method !== 'GET') throw new HttpError(405, 'Methode nicht erlaubt.');
        if (!modelIdentifier.test(modelMatch[1] ?? ''))
          throw new HttpError(400, 'Ungültige Modell-ID.');
        const model = (await storedModels(root)).find((entry) => entry.id === modelMatch[1]);
        if (!model) throw new HttpError(404, 'Modell nicht gefunden.');
        json(response, 200, model);
        return;
      }
      const tileMatch = /^\/api\/tiles\/([^/]+)(?:\/(config\.json|tile\.png))?$/.exec(pathname);
      if (tileMatch) {
        if (request.method !== 'GET') throw new HttpError(405, 'Methode nicht erlaubt.');
        const id = tileMatch[1] ?? '';
        if (!identifier.test(id)) throw new HttpError(400, 'Ungültige Tile-ID.');
        const file = tileMatch[2] ?? 'config.json';
        const bytes = await readFile(join(root, 'working', id, file));
        response.writeHead(200, {
          'Content-Type': file.endsWith('.png') ? 'image/png' : 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(bytes);
        return;
      }
      throw new HttpError(404, 'API-Endpunkt nicht gefunden.');
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof ProbabilityConflict) json(response, 409, { error: error.message });
      else if (error instanceof HttpError || error instanceof CardApiError)
        json(response, error.status, { error: error.message });
      else if (
        error instanceof EventGenerationError ||
        (error instanceof Error && error.message.startsWith('Der Kartentext ist zu lang'))
      )
        json(response, 400, { error: error.message });
      else if (error instanceof ZodError)
        json(response, 400, {
          error: 'Übermittelte Daten sind ungültig.',
          details: error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .slice(0, 12),
        });
      else if (errorCode(error) === 'ENOENT')
        json(response, 404, { error: 'Datei nicht gefunden.' });
      else if (error instanceof Error && /PNG/.test(error.message))
        json(response, 400, { error: error.message });
      else json(response, 500, { error: 'Lokales Speichern fehlgeschlagen.' });
    }
  };
}

export function workingApiPlugin(projectRoot = process.cwd()): Plugin {
  return {
    name: 'hexa-working-api',
    configureServer(server) {
      server.middlewares.use(createApiHandler(projectRoot));
    },
  };
}
