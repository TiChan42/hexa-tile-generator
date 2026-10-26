import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from './api.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT muss zwischen 1 und 65535 liegen.');
const api = createApiHandler(root);
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = createServer((request, response) => {
  void api(request, response, () => {
    void (async () => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405);
        response.end();
        return;
      }
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      } catch {
        response.writeHead(400);
        response.end();
        return;
      }
      const target = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!target.startsWith(`${dist}${sep}`)) {
        response.writeHead(403);
        response.end();
        return;
      }
      let file: string;
      try {
        file = await realpath(target);
      } catch {
        if (extname(pathname)) {
          response.writeHead(404);
          response.end();
          return;
        }
        file = resolve(dist, 'index.html');
      }
      if (!file.startsWith(`${dist}${sep}`)) {
        response.writeHead(403);
        response.end();
        return;
      }
      try {
        const bytes = await readFile(file);
        response.writeHead(200, {
          'Content-Type': types[extname(file)] ?? 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
        });
        response.end(request.method === 'HEAD' ? undefined : bytes);
      } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Build fehlt. Bitte npm run build ausführen.');
      }
    })();
  });
});
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Hexa Tile Studio: http://127.0.0.1:${port}\n`);
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    server.close();
  });
