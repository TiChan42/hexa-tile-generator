import { useCallback, useState } from 'react';
import { configSchema } from './core';
import { loadStoredProject, saveStoredProject } from './editor/storage';
import type { TileConfig } from './core/types';

interface History {
  past: TileConfig[];
  present: TileConfig;
  future: TileConfig[];
}
function initialProject() {
  try {
    return loadStoredProject(localStorage);
  } catch {
    return loadStoredProject(null);
  }
}
export function useProject() {
  const [initial] = useState(initialProject);
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: initial.config,
    future: [],
  }));
  const [storageError, setStorageError] = useState(false);
  const remember = useCallback((config: TileConfig) => {
    try {
      setStorageError(!saveStoredProject(localStorage, config));
    } catch {
      setStorageError(true);
    }
  }, []);
  const update = useCallback((change: (draft: TileConfig) => void) => {
    setHistory((previous) => {
      const draft = structuredClone(previous.present);
      change(draft);
      const parsed = configSchema.safeParse(draft);
      if (!parsed.success || JSON.stringify(parsed.data) === JSON.stringify(previous.present))
        return previous;
      return {
        past: [...previous.past.slice(-79), previous.present],
        present: parsed.data,
        future: [],
      };
    });
  }, []);
  const replace = useCallback(
    (config: TileConfig) =>
      setHistory((prev) => ({
        past: [...prev.past.slice(-79), prev.present],
        present: configSchema.parse(config),
        future: [],
      })),
    [],
  );
  const load = useCallback(
    (config: TileConfig) =>
      setHistory({ past: [], present: configSchema.parse(config), future: [] }),
    [],
  );
  const undo = useCallback(
    () =>
      setHistory((prev) =>
        prev.past.length
          ? {
              past: prev.past.slice(0, -1),
              present: prev.past.at(-1)!,
              future: [prev.present, ...prev.future],
            }
          : prev,
      ),
    [],
  );
  const redo = useCallback(
    () =>
      setHistory((prev) =>
        prev.future.length
          ? {
              past: [...prev.past, prev.present],
              present: prev.future[0],
              future: prev.future.slice(1),
            }
          : prev,
      ),
    [],
  );
  return {
    config: history.present,
    migrationNotice: initial.notices.join(' '),
    update,
    replace,
    load,
    undo,
    redo,
    canUndo: !!history.past.length,
    canRedo: !!history.future.length,
    remember,
    storageError,
  };
}
