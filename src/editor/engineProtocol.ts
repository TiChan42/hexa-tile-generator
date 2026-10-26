import type { GeneratedTile, TileConfig } from '../core/types';
import type { SeededProjectOptions } from '../core/project';
export type EngineInput =
  | { kind: 'tile'; key: string; config: TileConfig }
  | { kind: 'project'; seed: string; options: SeededProjectOptions };
export interface EngineRequest {
  id: number;
  input: EngineInput;
}
export type EngineOutput =
  | { kind: 'tile'; key: string; tile: GeneratedTile; elapsedMs: number }
  | { kind: 'project'; key: string; config: TileConfig; tile: GeneratedTile; elapsedMs: number };
export type EngineReply =
  { id: number; ok: true; output: EngineOutput } | { id: number; ok: false; error: string };
