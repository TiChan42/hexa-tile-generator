import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  configSchema,
  defaultConfig,
  generateTile,
  randomAt,
  rollFieldActions,
} from '../src/core';
import type { ActionId, GeneratedTile, TileConfig } from '../src/core';

const weights = (value = 0): Record<ActionId, number> =>
  Object.fromEntries(ACTIONS.map(({ id }) => [id, value])) as Record<ActionId, number>;
const base = structuredClone(defaultConfig);
base.decoration.enabled = false;
const visible = generateTile(base);
const actionsById = (config: TileConfig): Record<string, ActionId> =>
  Object.fromEntries(config.paths.fields.map((field) => [field.id, field.action]));
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(frozen);
  }
  return value;
}
function manyFields(count = 128): GeneratedTile {
  return {
    ...visible,
    fields: Array.from({ length: count }, (_, i) => ({
      ...visible.fields[0]!,
      id: `independent-${i}`,
      isCenter: i === 0,
    })),
  };
}

describe('explicit deterministic weighted field action rolls', () => {
  it('returns an immutable deterministic new configuration including a center metadata edit', () => {
    const config = frozen(structuredClone(base)),
      tile = frozen(structuredClone(visible)),
      before = structuredClone(config),
      beforeTile = structuredClone(tile);
    const first = rollFieldActions(config, tile),
      second = rollFieldActions(config, tile);
    expect(first).toEqual(second);
    expect(first).not.toBe(config);
    expect(first.actions.revision).toBe(1);
    expect(first.paths.fields).toHaveLength(tile.fields.length);
    expect(first.paths.fields.find((field) => field.id === 'center')).toMatchObject({
      id: 'center',
      cellIds: [],
    });
    expect(first.paths.auto).toBe(config.paths.auto);
    expect(config).toEqual(before);
    expect(tile).toEqual(beforeTile);
    expect(configSchema.safeParse(first).success).toBe(true);
  });
  it.each(ACTIONS.map(({ id }) => id))(
    'assigns one-hot %s to every normal field and the pentagon',
    (action) => {
      const config = structuredClone(base);
      config.actions.weights = { ...weights(), [action]: 100 };
      const next = rollFieldActions(config, visible);
      expect(new Set(next.paths.fields.map((field) => field.action))).toEqual(new Set([action]));
      expect(next.paths.fields.find((field) => field.id === 'center')?.action).toBe(action);
      expect(next.paths.fields).toHaveLength(visible.fields.length);
    },
  );
  it('excludes every zero-weight action and applies the configured bias rather than uniform sampling', () => {
    const config = structuredClone(base);
    config.actions.weights = { ...weights(), event: 10, gold: 90 };
    const tile = manyFields(256),
      rolled = rollFieldActions(config, tile),
      actions = rolled.paths.fields.map((field) => field.action);
    expect(new Set(actions)).toEqual(new Set(['event', 'gold']));
    const gold = actions.filter((action) => action === 'gold').length,
      event = actions.filter((action) => action === 'event').length;
    expect(gold).toBeGreaterThan(event * 5);
    expect(event).toBeGreaterThan(0);
  });
  it('normalizes relative fractional weights and ignores their object insertion order', () => {
    const config = structuredClone(base),
      other = structuredClone(base);
    config.actions.weights = { ...weights(), shop: 4.5, event: 9.25, gold: 23.5 };
    other.actions.weights = Object.fromEntries(
      Object.entries(config.actions.weights)
        .reverse()
        .map(([id, weight]) => [id, weight / 4]),
    ) as Record<ActionId, number>;
    const tile = manyFields();
    expect(actionsById(rollFieldActions(config, tile))).toEqual(
      actionsById(rollFieldActions(other, tile)),
    );
  });
  it('keeps all fields independent of their enumeration order and of newly added visible fields', () => {
    const config = structuredClone(base),
      normal = rollFieldActions(config, visible),
      reverse = rollFieldActions(config, { ...visible, fields: [...visible.fields].reverse() });
    expect(reverse).toEqual(normal);
    const added = rollFieldActions(config, {
      ...visible,
      fields: [{ ...visible.fields[0]!, id: 'new-visible' }, ...visible.fields],
    });
    const before = actionsById(normal),
      after = actionsById(added);
    for (const field of visible.fields) expect(after[field.id]).toBe(before[field.id]);
    expect(added.paths.fields.filter((field) => field.id === 'new-visible')).toHaveLength(1);
  });
  it('uses independent seed and revision domains without consulting old actions or field geometry', () => {
    const config = structuredClone(base),
      changed = structuredClone(base),
      tile = manyFields();
    const initial = actionsById(rollFieldActions(config, tile));
    changed.seed = 'anderer-aktionsseed';
    expect(actionsById(rollFieldActions(changed, tile))).not.toEqual(initial);
    changed.seed = config.seed;
    changed.actions.revision = 1;
    expect(actionsById(rollFieldActions(changed, tile))).not.toEqual(initial);
    const decorated = {
      ...tile,
      fields: tile.fields.map((field) => ({
        ...field,
        color: '#ff0000',
        height: 0.9,
        action: 'none' as const,
        label: 'Andere Metadaten',
        cellIds: [],
      })),
    };
    expect(actionsById(rollFieldActions(config, decorated))).toEqual(initial);
  });
  it('preserves every existing form, color, label, height edit and object while adding only minimal auto metadata', () => {
    const config = structuredClone(defaultConfig),
      automatic = generateTile(config),
      a = automatic.fields[1]!,
      b = automatic.fields[2]!;
    config.paths.fields = [
      {
        id: a.id,
        cellIds: [],
        action: 'custom',
        color: '#abc123',
        label: 'Mein Name',
        heightOffset: 0.075,
        heightMode: 'terraced',
      },
      { id: b.id, cellIds: [], action: 'shop', label: 'Eigenes Feld', heightMode: 'flat' },
      {
        id: 'center',
        cellIds: [],
        action: 'event',
        color: '#fedcba',
        heightOffset: -0.05,
        heightMode: 'terraced',
        label: 'Pentagon',
      },
      {
        id: 'inactive-edit',
        cellIds: [],
        action: 'none',
        label: 'Für später',
        color: '#123456',
        heightOffset: 0.02,
      },
    ];
    const tile = generateTile(config),
      before = structuredClone(config),
      next = rollFieldActions(config, tile),
      after = generateTile(next);
    const { paths: beforePaths, actions: beforeActions, ...beforeOther } = before,
      { paths: afterPaths, actions: afterActions, ...afterOther } = next;
    expect(afterOther).toEqual(beforeOther);
    const { fields: beforeFields, ...beforeSettings } = beforePaths,
      { fields: afterFields, ...afterSettings } = afterPaths;
    expect(afterSettings).toEqual(beforeSettings);
    expect(afterActions.weights).toEqual(beforeActions.weights);
    for (const original of beforeFields) {
      const edit = afterFields.find((field) => field.id === original.id)!;
      expect({ ...edit, action: original.action }).toEqual(original);
    }
    expect(afterFields.find((field) => field.id === 'inactive-edit')).toEqual(
      beforeFields.find((field) => field.id === 'inactive-edit'),
    );
    for (const edit of afterFields.filter(
      (edit) => !beforeFields.some((original) => original.id === edit.id),
    ))
      expect(Object.keys(edit).sort()).toEqual(['action', 'cellIds', 'id']);
    expect(
      afterFields
        .filter((edit) => !beforeFields.some((original) => original.id === edit.id))
        .every((edit) => edit.cellIds.length === 0),
    ).toBe(true);
    const withoutActions = (tile: GeneratedTile) => ({
      ...tile,
      fields: tile.fields.map(({ action: discarded, ...field }) => {
        void discarded;
        return field;
      }),
    });
    expect(withoutActions(after)).toEqual(withoutActions(tile));
    expect(config).toEqual(before);
  });
  it('does not replace explicit manual cell memberships with metadata-only edits', () => {
    const config = structuredClone(base);
    config.paths.auto = false;
    config.paths.fields = visible.fields
      .filter((field) => !field.isCenter)
      .map((field) => ({
        id: field.id,
        cellIds: [...field.cellIds],
        action: field.action,
        label: field.label,
        color: field.color,
      }));
    const tile = generateTile(config),
      next = rollFieldActions(config, tile);
    for (const edit of config.paths.fields)
      expect(next.paths.fields.find((field) => field.id === edit.id)?.cellIds).toEqual(
        edit.cellIds,
      );
    expect(next.paths.auto).toBe(false);
    expect(generateTile(next).cells).toEqual(tile.cells);
  });
  it('permits an all-zero editable config but rejects rolling it with a clear error and no mutation', () => {
    const config = structuredClone(base);
    config.actions.weights = weights();
    const before = structuredClone(config);
    expect(configSchema.safeParse(config).success).toBe(true);
    expect(() => rollFieldActions(config, visible)).toThrow(
      'mindestens ein Aktionsgewicht größer als 0',
    );
    expect(config).toEqual(before);
  });
  it('wraps the maximum revision to zero and uses that wrapped revision for sampling', () => {
    const config = structuredClone(base);
    config.actions.revision = 2147483647;
    const wrapped = rollFieldActions(config, visible);
    expect(wrapped.actions.revision).toBe(0);
    const expected = new Map(
      visible.fields.map((field) => {
        const candidates = Object.entries(config.actions.weights)
          .filter(([, weight]) => weight > 0)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        const total = candidates.reduce((sum, [, weight]) => sum + weight, 0),
          target = randomAt(config.seed, 'field-action-roll-v10', 0, field.id) * total;
        let cumulative = 0;
        return [field.id, candidates.find(([, weight]) => (cumulative += weight) > target)![0]];
      }),
    );
    for (const field of wrapped.paths.fields) expect(field.action).toBe(expected.get(field.id));
  });
  it('retains a positive one-hot subnormal weight even if rounding lands exactly on the final bucket edge', () => {
    const config = structuredClone(base);
    config.actions.weights = { ...weights(), custom: Number.MIN_VALUE };
    const id = Array.from({ length: 64 }, (_, i) => `tiny-${i}`).find(
      (id) => randomAt(config.seed, 'field-action-roll-v10', 1, id) > 0.5,
    )!;
    expect(id).toBeDefined();
    const next = rollFieldActions(config, { ...visible, fields: [{ ...visible.fields[0]!, id }] });
    expect(next.paths.fields).toEqual([{ id, cellIds: [], action: 'custom' }]);
  });
  it('leaves ordinary generation unchanged when weights or the roll counter are edited without rolling', () => {
    const config = structuredClone(base),
      before = generateTile(config);
    config.actions.weights = { ...weights(), none: 100 };
    config.actions.revision = 111;
    expect(generateTile(config)).toEqual(before);
  });
});
