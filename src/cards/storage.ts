import { createEventProject, eventProjectSchema, migrateEventProject } from '../core/events';
import type { EventProject } from '../core/events';
export const EVENT_STORAGE_KEY = 'hexa-studio-event-cards-v4';
export function loadEventProject(storage: Pick<Storage, 'getItem'> | null): {
  project: EventProject;
  error: string;
} {
  try {
    const raw =
      storage?.getItem(EVENT_STORAGE_KEY) ??
      storage?.getItem('hexa-studio-event-cards-v3') ??
      storage?.getItem('hexa-studio-event-cards-v2') ??
      storage?.getItem('hexa-studio-event-cards-v1');
    return {
      project: raw ? migrateEventProject(JSON.parse(raw)) : createEventProject(),
      error: '',
    };
  } catch {
    return {
      project: createEventProject(),
      error:
        'Das gespeicherte Kartenset konnte nicht gelesen werden. Der ursprüngliche Eintrag bleibt bis zu deiner nächsten Bearbeitung erhalten.',
    };
  }
}
export function saveEventProject(
  storage: Pick<Storage, 'setItem'> | null,
  project: EventProject,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(EVENT_STORAGE_KEY, JSON.stringify(eventProjectSchema.parse(project)));
    return true;
  } catch {
    return false;
  }
}
