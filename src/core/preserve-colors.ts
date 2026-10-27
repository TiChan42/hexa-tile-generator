import { generateTile } from './generate';
import type { GeneratedTile, TileConfig } from './types';

/** Keep visible colors when local geometry changes the automatic terrain-contrast choice.
 * Unchanged generated colors stay gradient-driven; only actual color changes need an override.
 * Returns a separate configuration; rendering and saved source inputs remain untouched.
 */
export function preserveChangedFieldColors(config: TileConfig, source: GeneratedTile): TileConfig {
  const draft = structuredClone(config);
  const preview = generateTile({
    ...draft,
    paths: { ...draft.paths, enabled: true },
    decoration: { ...draft.decoration, enabled: false },
  });
  const colors = new Map(preview.fields.map((field) => [field.id, field.color]));
  for (const field of source.fields) {
    if (!colors.has(field.id) || colors.get(field.id) === field.color) continue;
    let edit = draft.paths.fields.find((candidate) => candidate.id === field.id);
    // A newer explicit edit can be ahead of the visible preview and remains authoritative.
    if (edit?.color !== undefined) continue;
    if (!edit) {
      // Only the center can lack an entry after the caller snapshots normal fields.
      if (!field.isCenter) continue;
      edit = { id: field.id, cellIds: [], action: field.action, label: field.label };
      draft.paths.fields.unshift(edit);
    }
    edit.color = field.color;
  }
  return draft;
}
