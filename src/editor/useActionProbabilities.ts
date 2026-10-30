import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { ACTION_PROBABILITIES, actionProbabilitiesSchema } from '../core/action-probabilities';
import type { ActionProbabilities } from '../core/action-probabilities';

const responseSchema = z
  .object({
    version: z.literal(1),
    revision: z.string().regex(/^[a-f\d]{64}$/),
    probabilities: actionProbabilitiesSchema,
  })
  .strict();
type Profile = z.infer<typeof responseSchema>;
async function read(response: Response): Promise<Profile> {
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data === 'object' && data !== null && 'error' in data
        ? String(data.error)
        : 'Die globale Aktionsverteilung konnte nicht geladen werden.',
    );
  return responseSchema.parse(data);
}
export interface ActionProbabilityController {
  profile: { revision: string; probabilities: ActionProbabilities };
  ready: boolean;
  error: string;
  save: (probabilities: ActionProbabilities) => Promise<void>;
  reload: () => Promise<void>;
}
export function useActionProbabilities(): ActionProbabilityController {
  const [state, setState] = useState({
    profile: { revision: '', probabilities: structuredClone(ACTION_PROBABILITIES) },
    ready: false,
    error: '',
  });
  const reload = useCallback(async () => {
    try {
      const profile = await read(await fetch('/api/action-probabilities'));
      setState({ profile, ready: true, error: '' });
    } catch (error) {
      setState((previous) => ({
        ...previous,
        ready: false,
        error:
          error instanceof Error ? error.message : 'Globale Aktionsverteilung nicht verfügbar.',
      }));
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/action-probabilities', { signal: controller.signal })
      .then(read)
      .then(
        (profile) => {
          if (!controller.signal.aborted) setState({ profile, ready: true, error: '' });
        },
        (error: unknown) => {
          if (!controller.signal.aborted)
            setState((previous) => ({
              ...previous,
              ready: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Globale Aktionsverteilung nicht verfügbar.',
            }));
        },
      );
    return () => controller.abort();
  }, []);
  const save = async (probabilities: ActionProbabilities) => {
    const candidate = actionProbabilitiesSchema.parse(probabilities);
    const profile = await read(
      await fetch('/api/action-probabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          expectedRevision: state.profile.revision,
          probabilities: candidate,
        }),
      }),
    );
    setState({ profile, ready: true, error: '' });
  };
  return { ...state, save, reload };
}
