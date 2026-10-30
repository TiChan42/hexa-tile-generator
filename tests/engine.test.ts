import { describe, expect, it } from 'vitest';
import { EngineClient } from '../src/editor/engineClient';
import type { WorkerPort } from '../src/editor/engineClient';
import type { EngineReply, EngineRequest } from '../src/editor/engineProtocol';
import { generationKey } from '../src/editor/generationKey';
import { defaultConfig } from '../src/core/config';
import type { GeneratedTile } from '../src/core/types';

const tile: GeneratedTile = {
  cells: [],
  fields: [],
  entrances: [],
  center: { polygon: [], height: 0, sides: [] },
  decorations: [],
  connections: [],
  pathDetails: [],
  warnings: [],
  stats: { cells: 0, fields: 0, decorations: 0, connected: false },
};
class Port {
  requests: EngineRequest[] = [];
  messages = new Set<(event: MessageEvent<EngineReply>) => void>();
  errors = new Set<(event: ErrorEvent) => void>();
  terminated = false;
  throwPost = false;
  postMessage(request: EngineRequest) {
    if (this.throwPost) throw new Error('serialization');
    this.requests.push(request);
  }
  addEventListener(type: string, listener: unknown) {
    if (type === 'message')
      this.messages.add(listener as (event: MessageEvent<EngineReply>) => void);
    else this.errors.add(listener as (event: ErrorEvent) => void);
  }
  removeEventListener(type: string, listener: unknown) {
    if (type === 'message')
      this.messages.delete(listener as (event: MessageEvent<EngineReply>) => void);
    else this.errors.delete(listener as (event: ErrorEvent) => void);
  }
  terminate() {
    this.terminated = true;
  }
  reply(index: number, error?: string) {
    const { id, input } = this.requests[index];
    const key = input.kind === 'tile' ? input.key : generationKey(defaultConfig);
    const data: EngineReply = error
      ? { id, ok: false, error }
      : {
          id,
          ok: true,
          output:
            input.kind === 'tile'
              ? { kind: 'tile', key, tile, elapsedMs: 42 }
              : { kind: 'project', key, config: defaultConfig, tile, elapsedMs: 42 },
        };
    this.emit(data);
  }
  emit(data: EngineReply) {
    for (const fn of this.messages) fn({ data } as MessageEvent<EngineReply>);
  }
  error(message: string) {
    for (const fn of this.errors) fn({ message } as ErrorEvent);
  }
}
const config = (seed: string) => ({ ...structuredClone(defaultConfig), seed });
const engine = () => {
  const port = new Port();
  return { port, client: new EngineClient(port as WorkerPort) };
};
describe('worker scheduling and presentation separation', () => {
  it('coalesces queued slider changes and never drops validation jobs', async () => {
    const { client, port } = engine();
    const first = client.preview(config('first'));
    const stale = client.preview(config('stale')).catch((error) => (error as Error).name);
    const validation = client.validate(config('validation'));
    const latest = client.preview(config('latest'));
    expect(await stale).toBe('AbortError');
    expect(port.requests).toHaveLength(1);
    port.reply(0);
    await first;
    expect(port.requests[1].input).toMatchObject({ kind: 'tile', config: { seed: 'validation' } });
    port.reply(1);
    expect(await validation).toEqual(tile);
    expect(port.requests[2].input).toMatchObject({ kind: 'tile', config: { seed: 'latest' } });
    port.reply(2);
    expect((await latest).elapsedMs).toBe(42);
    client.dispose();
  });
  it('prioritizes complete recipes, preserves required previews, and caches the final result', async () => {
    const { client, port } = engine();
    const first = client.preview(config('first'));
    const stale = client.preview(config('stale')).catch((error) => (error as Error).name);
    const project = client.project('world', { fieldCount: 13 });
    port.reply(0);
    await first;
    expect(port.requests[1].input).toEqual({
      kind: 'project',
      seed: 'world',
      options: { fieldCount: 13 },
    });
    port.reply(1);
    expect(await project).toEqual(defaultConfig);
    expect((await client.preview(defaultConfig)).tile).toEqual(tile);
    expect(port.requests).toHaveLength(3);
    port.reply(2);
    expect(await stale).not.toBe('AbortError');
    client.dispose();
  });
  it('ignores foreign replies and recovers after one failed generation', async () => {
    const { client, port } = engine();
    const failed = client.preview(defaultConfig).catch((error) => (error as Error).message);
    port.emit({ id: 999, ok: false, error: 'foreign' });
    expect(port.requests).toHaveLength(1);
    port.reply(0, 'impossible');
    expect(await failed).toBe('impossible');
    const next = client.preview(config('next'));
    port.reply(1);
    expect((await next).tile).toEqual(tile);
    client.dispose();
  });
  it('continues the current preview after a complete recipe fails', async () => {
    const { client, port } = engine();
    const old = client.preview(config('old'));
    const current = client.preview(config('current'));
    const recipe = client.project('bad', {}).catch((error) => (error as Error).message);
    port.reply(0);
    await old;
    port.reply(1, 'recipe failed');
    expect(await recipe).toBe('recipe failed');
    expect(port.requests[2].input).toMatchObject({ kind: 'tile', config: { seed: 'current' } });
    port.reply(2);
    expect((await current).tile).toEqual(tile);
    client.dispose();
  });
  it('rejects all pending requests on crash or disposal instead of leaving the editor busy', async () => {
    const { client, port } = engine();
    const first = client.preview(defaultConfig).catch((error) => (error as Error).message);
    const next = client.validate(config('next')).catch((error) => (error as Error).message);
    port.error('worker crashed');
    expect(await first).toBe('worker crashed');
    expect(await next).toBe('worker crashed');
    await expect(client.preview(config('new'))).rejects.toThrow('worker crashed');
    expect(port.terminated).toBe(true);
    client.dispose();
    client.dispose();
    await expect(client.validate(defaultConfig)).rejects.toThrow('geschlossen');
    expect(port.messages.size).toBe(0);
    const other = engine();
    const pending = other.client.preview(defaultConfig).catch((error) => (error as Error).name);
    const queued = other.client.project('x', {}).catch((error) => (error as Error).name);
    other.client.dispose();
    expect(await pending).toBe('AbortError');
    expect(await queued).toBe('AbortError');
  });
  it('reports startup and serialization failures', async () => {
    const { client, port } = engine();
    port.throwPost = true;
    await expect(client.validate(defaultConfig)).rejects.toThrow('serialization');
    port.throwPost = false;
    const pending = client.preview(defaultConfig).catch((error) => (error as Error).message);
    port.error('');
    expect(await pending).toContain('gestartet');
    client.dispose();
  });
  it('avoids regeneration for camera, export and material edits but includes geometry and object inputs', () => {
    const original = config('key');
    const visual = structuredClone(original);
    visual.name = 'renamed';
    visual.camera.zoom = 2;
    visual.export.size = 2048;
    visual.palette = ['#abcdef'];
    visual.grid.showGrid = false;
    visual.terrain.texture.strength = 0.1;
    visual.terrain.grain = 0.2;
    visual.terrain.overhang = 0.02;
    visual.terrain.skirtDepth = 0.07;
    visual.paths.detail.centerLight = 0.4;
    visual.paths.detail.edgeShade = 0.3;
    visual.decoration.modelSlots = { oak: 'custom' };
    visual.border.mode = 'custom';
    visual.border.color = '#fe0033';
    visual.editing.regeneratePathsOnCenterChange = true;
    visual.actions.revision = 42;
    expect(generationKey(visual)).toBe(generationKey(original));
    for (const mutate of [
      (c: typeof original) => {
        c.border.enabled = true;
      },
      (c: typeof original) => {
        c.border.width = 0.03;
      },
      (c: typeof original) => {
        c.paths.fieldCount = 18;
      },
      (c: typeof original) => {
        c.center.offset.x = 0.2;
      },
      (c: typeof original) => {
        c.paths.detail.pebbleDensity = 0.8;
      },
      (c: typeof original) => {
        c.decoration.maxPerCell = 8;
      },
      (c: typeof original) => {
        c.decoration.species = ['oak'];
      },
      (c: typeof original) => {
        c.terrain.elevation = 0.5;
      },
    ]) {
      const changed = structuredClone(original);
      mutate(changed);
      expect(generationKey(changed)).not.toBe(generationKey(original));
    }
  });
});
