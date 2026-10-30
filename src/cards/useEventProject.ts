import { useCallback, useEffect, useRef, useState } from 'react';
import { eventProjectSchema } from '../core/events';
import type { EventProject } from '../core/events';
import { loadEventProject, saveEventProject } from './storage';
interface History {
  past: EventProject[];
  present: EventProject;
  future: EventProject[];
}
export function useEventProject() {
  const [initial] = useState(() => {
    try {
      return loadEventProject(localStorage);
    } catch {
      return loadEventProject(null);
    }
  });
  const [history, setHistory] = useState<History>({
    past: [],
    present: initial.project,
    future: [],
  });
  const current = useRef(history.present),
    dirty = useRef(false);
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    current.current = history.present;
  }, [history.present]);
  useEffect(() => {
    const save = () => {
      if (initial.error && !dirty.current) return;
      try {
        setStorageError(
          saveEventProject(localStorage, current.current)
            ? ''
            : 'Der Browser konnte das Kartenset nicht speichern. Sichere es als JSON oder im Working-Ordner.',
        );
      } catch {
        setStorageError(
          'Der Browser-Speicher ist nicht verfügbar. Sichere das Kartenset als JSON.',
        );
      }
    };
    save();
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, [history.present, initial.error]);
  const replace = useCallback((value: EventProject) => {
    const parsed = eventProjectSchema.parse(value);
    dirty.current = true;
    current.current = parsed;
    setHistory((previous) =>
      JSON.stringify(previous.present) === JSON.stringify(parsed)
        ? previous
        : { past: [...previous.past.slice(-79), previous.present], present: parsed, future: [] },
    );
  }, []);
  const update = useCallback(
    (change: (draft: EventProject) => void) => {
      const draft = structuredClone(current.current);
      change(draft);
      replace(draft);
    },
    [replace],
  );
  const undo = useCallback(() => {
    dirty.current = true;
    setHistory((previous) => {
      if (!previous.past.length) return previous;
      const present = previous.past.at(-1)!;
      current.current = present;
      return {
        past: previous.past.slice(0, -1),
        present,
        future: [previous.present, ...previous.future],
      };
    });
  }, []);
  const redo = useCallback(() => {
    dirty.current = true;
    setHistory((previous) => {
      if (!previous.future.length) return previous;
      const present = previous.future[0]!;
      current.current = present;
      return {
        past: [...previous.past, previous.present],
        present,
        future: previous.future.slice(1),
      };
    });
  }, []);
  return {
    project: history.present,
    update,
    replace,
    undo,
    redo,
    canUndo: !!history.past.length,
    canRedo: !!history.future.length,
    error: storageError || initial.error,
  };
}
