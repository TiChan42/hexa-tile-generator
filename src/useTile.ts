import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEngineClient } from './editor/engineClient';
import type { EngineClient } from './editor/engineClient';
import { generationKey } from './editor/generationKey';
import { fieldEditingKey, interactionKey, presentFieldEdits } from './editor/presentation';
import type { GeneratedTile, TileConfig } from './core/types';
import type { SeededProjectOptions } from './core/project';

export const EMPTY_TILE: GeneratedTile = {
  cells: [],
  fields: [],
  entrances: [],
  center: { polygon: [], height: 0, sides: [] },
  decorations: [],
  pathDetails: [],
  connections: [],
  warnings: [],
  stats: { cells: 0, fields: 0, decorations: 0, connected: false },
};
export function useTile(config: TileConfig) {
  const clientRef = useRef<EngineClient | null>(null);
  const key = generationKey(config);
  const [result, setResult] = useState<{
    key: string;
    tile: GeneratedTile;
    elapsedMs: number;
  } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let client: EngineClient | undefined;
    try {
      client = createEngineClient();
      clientRef.current = client;
    } catch (reason) {
      queueMicrotask(() => {
        if (active)
          setStartupError(
            reason instanceof Error
              ? reason.message
              : 'Der Generator konnte nicht gestartet werden.',
          );
      });
    }
    return () => {
      active = false;
      client?.dispose();
      clientRef.current = null;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      clientRef.current
        ?.preview(JSON.parse(key) as TileConfig)
        .then((output) => {
          if (active) {
            setResult(output);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (active && reason instanceof Error && reason.name !== 'AbortError')
            setError({ key, message: reason.message });
        });
    }, 45);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key]);
  const buildProject = useCallback((seed: string, options: SeededProjectOptions) => {
    const client = clientRef.current;
    if (!client) return Promise.reject(new Error('Generator startet noch.'));
    return client.project(seed, options);
  }, []);
  const validateTile = useCallback((candidate: TileConfig) => {
    const client = clientRef.current;
    if (!client) return Promise.reject(new Error('Generator startet noch.'));
    return client.validate(candidate);
  }, []);
  const activeError = startupError ?? (error?.key === key ? error.message : null);
  const editable =
    !!result &&
    !activeError &&
    interactionKey(JSON.parse(result.key) as TileConfig) === interactionKey(config);
  const fieldEditable =
    !!result &&
    !activeError &&
    fieldEditingKey(JSON.parse(result.key) as TileConfig) === fieldEditingKey(config);
  const tile = useMemo(
    () => presentFieldEdits(result?.tile ?? EMPTY_TILE, config),
    [result, config],
  );
  return {
    tile,
    editable,
    fieldEditable,
    pending: !startupError && result?.key !== key && error?.key !== key,
    error: activeError,
    elapsedMs: result?.elapsedMs ?? 0,
    buildProject,
    validateTile,
  };
}
