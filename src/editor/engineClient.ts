import type { GeneratedTile, TileConfig } from '../core/types';
import type { SeededProjectOptions } from '../core/project';
import type { BulkGenerationOptions } from '../core/bulk';
import { generationKey } from './generationKey';
import type { EngineInput, EngineOutput, EngineReply, EngineRequest } from './engineProtocol';
export interface WorkerPort {
  postMessage(request: EngineRequest): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<EngineReply>) => void): void;
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<EngineReply>) => void): void;
  removeEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  terminate(): void;
}
interface Task {
  id: number;
  channel: 'preview' | 'project' | 'bulk' | 'validation';
  input: EngineInput;
  resolve: (output: EngineOutput) => void;
  reject: (error: Error) => void;
}
function cancelled() {
  const error = new Error('Durch eine neuere Änderung ersetzt.');
  error.name = 'AbortError';
  return error;
}
export class EngineClient {
  private sequence = 0;
  private inFlight: Task | null = null;
  private queue: Task[] = [];
  private cache: { key: string; tile: GeneratedTile; elapsedMs: number } | null = null;
  private disposed = false;
  private failure: Error | null = null;
  constructor(private readonly port: WorkerPort) {
    port.addEventListener('message', this.onMessage);
    port.addEventListener('error', this.onError);
  }
  private readonly onMessage = (event: MessageEvent<EngineReply>) => {
    const reply = event.data;
    if (!this.inFlight || reply.id !== this.inFlight.id) return;
    const task = this.inFlight;
    this.inFlight = null;
    if (reply.ok) {
      if (reply.output.kind !== 'bulk')
        this.cache = {
          key: reply.output.key,
          tile: reply.output.tile,
          elapsedMs: reply.output.elapsedMs,
        };
      task.resolve(reply.output);
    } else task.reject(new Error(reply.error));
    this.pump();
  };
  private readonly onError = (event: ErrorEvent) => {
    const error = new Error(event.message || 'Der Generator konnte nicht gestartet werden.');
    this.failure = error;
    this.inFlight?.reject(error);
    this.inFlight = null;
    for (const task of this.queue) task.reject(error);
    this.queue = [];
    this.port.terminate();
  };
  private pump() {
    if (this.disposed || this.inFlight) return;
    const task = this.queue.shift();
    if (!task) return;
    this.inFlight = task;
    try {
      this.port.postMessage({ id: task.id, input: task.input });
    } catch (error) {
      this.inFlight = null;
      task.reject(error instanceof Error ? error : new Error(String(error)));
      this.pump();
    }
  }
  private request(input: EngineInput, channel: Task['channel']): Promise<EngineOutput> {
    if (this.disposed) return Promise.reject(new Error('Generator wurde geschlossen.'));
    if (this.failure) return Promise.reject(this.failure);
    if (channel !== 'validation') {
      const kept: Task[] = [];
      for (const task of this.queue) {
        if (task.channel === channel) task.reject(cancelled());
        else kept.push(task);
      }
      this.queue = kept;
    }
    return new Promise((resolve, reject) => {
      const task = { id: ++this.sequence, input, channel, resolve, reject };
      if (channel === 'project') this.queue.unshift(task);
      else this.queue.push(task);
      this.pump();
    });
  }
  async preview(config: TileConfig) {
    const key = generationKey(config);
    if (!this.disposed && !this.failure && this.cache?.key === key) return this.cache;
    const output = await this.request(
      { kind: 'tile', key, config: JSON.parse(key) as TileConfig },
      'preview',
    );
    if (output.kind !== 'tile') throw new Error('Ungültige Generatorantwort.');
    return { key: output.key, tile: output.tile, elapsedMs: output.elapsedMs };
  }
  async validate(config: TileConfig) {
    const key = generationKey(config);
    const output = await this.request(
      { kind: 'tile', key, config: JSON.parse(key) as TileConfig },
      'validation',
    );
    if (output.kind !== 'tile') throw new Error('Ungültige Generatorantwort.');
    return output.tile;
  }
  async project(seed: string, options: SeededProjectOptions) {
    const output = await this.request({ kind: 'project', seed, options }, 'project');
    if (output.kind !== 'project') throw new Error('Ungültige Generatorantwort.');
    return output.config;
  }
  async bulk(options: BulkGenerationOptions) {
    const output = await this.request({ kind: 'bulk', options }, 'bulk');
    if (output.kind !== 'bulk') throw new Error('Ungültige Generatorantwort.');
    return output.project;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.port.removeEventListener('message', this.onMessage);
    this.port.removeEventListener('error', this.onError);
    this.port.terminate();
    const error = cancelled();
    this.inFlight?.reject(error);
    for (const task of this.queue) task.reject(error);
    this.inFlight = null;
    this.queue = [];
    this.cache = null;
  }
}
export function createEngineClient() {
  return new EngineClient(
    new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' }),
  );
}
