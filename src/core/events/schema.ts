import { z } from 'zod';

export const EVENT_VERSION = 'events-4.0.0' as const;
export const EVENT_GENERATOR_VERSION = 'events-3.0.0' as const;
export const STANDARD_EVENT_KINDS = [
  'alb-move',
  'alb-steal',
  'move',
  'pentagon',
  'resources',
  'steal',
  'tile-change',
] as const;
export const RARE_EVENT_KINDS = ['alb-give', 'gift', 'protection', 'bonus-roll'] as const;
export const RARE_EVENT_WEIGHTS = { 'alb-give': 1, gift: 2, protection: 1, 'bonus-roll': 1 };
export const EVENT_KINDS = [...STANDARD_EVENT_KINDS, ...RARE_EVENT_KINDS] as const;
export const EVENT_RESOURCES = ['scrap', 'gem', 'platinum', 'amethyst', 'gold'] as const;
export const RESOURCE_NAMES = {
  scrap: 'Altmetall',
  gem: 'Edelsteine',
  platinum: 'Platin',
  amethyst: 'Amethyst',
  gold: 'Gold',
} as const;
export const EFFECT_NAMES = {
  'alb-move': 'Alb bewegen',
  'alb-steal': 'Alb stiehlt',
  'alb-give': 'Pakt mit dem Alb',
  gift: 'Geschenk erhalten',
  protection: 'Diebstahlschutz',
  'bonus-roll': 'Zusatzwurf',
  move: 'Spieler bewegen',
  pentagon: 'Zum Pentagon',
  resources: 'Ressourcen',
  steal: 'Spieler stiehlt',
  'tile-change': 'Gebiete verändern',
  custom: 'Eigener Effekt',
} as const;
const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const quantity = z.number().int().min(1).max(24);
export const resourceSelectionSchema = z.enum(['random', 'choice', ...EVENT_RESOURCES]);
const active = z.object({ kind: z.literal('active') }).strict();
const all = z.object({ kind: z.literal('all') }).strict();
const turn = z
  .object({
    kind: z.literal('turn-order'),
    direction: z.enum(['next', 'previous']),
    rank: z.number().int().min(1).max(6),
  })
  .strict();
const board = z
  .object({
    kind: z.literal('board'),
    direction: z.enum(['any', 'forward', 'backward']),
    rank: z.number().int().min(1).max(6),
    origin: z.enum(['active-player', 'alb']),
  })
  .strict();
export const playerTargetSchema = z.discriminatedUnion('kind', [active, turn, board, all]);
const singleTarget = z.discriminatedUnion('kind', [active, turn, board]);
const otherTarget = z.discriminatedUnion('kind', [turn, board, all]);
const inventory = z.enum(['carried', 'stored']);
export const giftSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bank') }).strict(),
  z.object({ kind: z.literal('players'), target: otherTarget, inventory }).strict(),
]);
const distance = z.object({ amount: quantity, unit: z.enum(['fields', 'pentagons']) }).strict();
const cost = z
  .object({
    amount: z.number().int().min(1).max(9),
    resource: resourceSelectionSchema,
    source: z.enum(['carried', 'stored', 'either']),
    failure: z.enum(['skip-effect', 'skip-card']),
  })
  .strict();
const standardEffects = [
  z
    .object({ kind: z.literal('alb-move'), target: singleTarget, limit: distance.nullable() })
    .strict(),
  z
    .object({
      kind: z.literal('alb-steal'),
      target: playerTargetSchema,
      amount: quantity,
      resource: resourceSelectionSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('move'),
      target: playerTargetSchema,
      amount: quantity,
      unit: z.enum(['fields', 'pentagons']),
      direction: z.enum(['forward', 'backward']),
      fieldActions: z.enum(['each', 'last', 'none']),
      optional: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('pentagon'),
      target: playerTargetSchema,
      ordinal: z.number().int().min(1).max(6),
      direction: z.enum(['forward', 'backward']),
      fieldAction: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('resources'),
      target: playerTargetSchema,
      operation: z.enum(['gain', 'lose', 'pay', 'store', 'withdraw']),
      amount: quantity,
      resource: resourceSelectionSchema,
      location: z.enum(['carried', 'stored']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('steal'),
      target: playerTargetSchema,
      amount: quantity,
      resource: resourceSelectionSchema,
      location: z.enum(['carried', 'stored']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('tile-change'),
      target: playerTargetSchema,
      amount: z.number().int().min(1).max(6),
      operation: z.enum(['rotate', 'shift']),
      optional: z.boolean(),
    })
    .strict(),
  z.object({ kind: z.literal('custom'), text: z.string().trim().min(1).max(240) }).strict(),
] as const;
const validStealTarget = (effect: { kind: string; target?: { kind: string } }) =>
  effect.kind !== 'steal' || effect.target?.kind !== 'active';
const stealTargetMessage = 'Beim Diebstahl muss ein anderer Spieler als Ziel gewählt werden.';
const legacyEffectSchema = z
  .discriminatedUnion('kind', standardEffects)
  .refine(validStealTarget, stealTargetMessage);
export const eventEffectSchema = z
  .discriminatedUnion('kind', [
    ...standardEffects,
    z
      .object({
        kind: z.literal('alb-give'),
        target: singleTarget,
        amount: quantity,
        resource: resourceSelectionSchema,
        approach: distance,
      })
      .strict(),
    z
      .object({
        kind: z.literal('gift'),
        source: giftSourceSchema,
        amount: quantity,
        resource: resourceSelectionSchema,
        destination: inventory,
      })
      .strict(),
    z
      .object({
        kind: z.literal('protection'),
        target: playerTargetSchema,
        turns: z.number().int().min(1).max(3),
        against: z.enum(['alb', 'players', 'all']),
      })
      .strict(),
    z
      .object({
        kind: z.literal('bonus-roll'),
        target: singleTarget,
        fieldActions: z.enum(['each', 'last', 'none']),
      })
      .strict(),
  ])
  .refine(validStealTarget, stealTargetMessage);
export const eventStepSchema = z
  .object({ id, effect: eventEffectSchema, cost: cost.nullable() })
  .strict();
export const eventCardSchema = z
  .object({
    id,
    title: z.string().trim().min(1).max(70),
    flavor: z.string().max(160),
    mode: z.enum(['sequence', 'choice']),
    steps: z
      .array(eventStepSchema)
      .min(1)
      .max(6)
      .refine(
        (steps) => new Set(steps.map((step) => step.id)).size === steps.length,
        'Effekt-IDs müssen eindeutig sein.',
      ),
  })
  .strict();
const range = (max: number) =>
  z
    .object({ min: z.number().int().min(1).max(max), max: z.number().int().min(1).max(max) })
    .strict()
    .refine((value) => value.min <= value.max, 'Minimum darf nicht über dem Maximum liegen.');
export const eventGeneratorSchema = z
  .object({
    version: z.literal(3),
    seed: z.string().min(1).max(128),
    revision: z.number().int().min(0).max(2147483647),
    count: z.number().int().min(1).max(100),
    theme: z.enum(['mixed', 'alb', 'adventure', 'resources']),
    steps: range(6),
    movement: range(24),
    resources: range(9),
    albGifts: range(24),
    targetRank: range(6),
    weights: z.record(z.enum(EVENT_KINDS), z.number().finite().min(0).max(100)),
    resourceWeights: z.record(z.enum(EVENT_RESOURCES), z.number().finite().min(0).max(100)),
    targetBases: z
      .array(z.enum(['turn-order', 'board']))
      .min(1)
      .max(2)
      .refine(
        (values) => new Set(values).size === values.length,
        'Zielarten müssen eindeutig sein.',
      ),
    allowBackward: z.boolean(),
    allowTileChanges: z.boolean(),
    costChance: z.number().finite().min(0).max(1),
    mode: z.enum(['sequence', 'choice', 'random']),
  })
  .strict();
const hex = z.string().regex(/^#[a-f\d]{6}$/i);
export const cardDesignSchema = z
  .object({
    palette: z.enum(['moss', 'amethyst', 'treasure', 'custom']),
    backRevision: z.number().int().min(0).max(2147483647),
    background: hex,
    ink: hex,
    accent: hex,
    backTitle: z.string().trim().min(1).max(45),
    footer: z.string().max(60),
    distanceMetric: z.enum(['path', 'air']),
  })
  .strict();
export const eventProjectSchema = z
  .object({
    schemaVersion: z.literal(4),
    generatorVersion: z.literal(EVENT_VERSION),
    name: z.string().trim().min(1).max(80),
    generator: eventGeneratorSchema,
    design: cardDesignSchema,
    cards: z
      .array(eventCardSchema)
      .max(100)
      .refine(
        (cards) => new Set(cards.map((card) => card.id)).size === cards.length,
        'Karten-IDs müssen eindeutig sein.',
      ),
  })
  .strict();
/** Frozen legacy schemas reject new effects/weights before migration; saved cards stay intact. */
const legacyGeneratorSchema = eventGeneratorSchema
  .omit({ albGifts: true })
  .extend({
    version: z.literal(2),
    weights: z.record(z.enum(STANDARD_EVENT_KINDS), z.number().finite().min(0).max(100)),
  })
  .strict();
const legacyStepSchema = eventStepSchema.extend({ effect: legacyEffectSchema }).strict();
const legacyCardSchema = eventCardSchema
  .extend({
    steps: z
      .array(legacyStepSchema)
      .min(1)
      .max(6)
      .refine(
        (steps) => new Set(steps.map((step) => step.id)).size === steps.length,
        'Effekt-IDs müssen eindeutig sein.',
      ),
  })
  .strict();
const v3ProjectSchema = eventProjectSchema
  .extend({
    schemaVersion: z.literal(3),
    generatorVersion: z.literal('events-3.0.0'),
    generator: legacyGeneratorSchema,
    cards: z
      .array(legacyCardSchema)
      .max(100)
      .refine(
        (cards) => new Set(cards.map((card) => card.id)).size === cards.length,
        'Karten-IDs müssen eindeutig sein.',
      ),
  })
  .strict();
const v1GeneratorSchema = legacyGeneratorSchema.extend({ version: z.literal(1) }).strict();
const v2ProjectSchema = v3ProjectSchema
  .extend({
    schemaVersion: z.literal(2),
    generatorVersion: z.literal('events-2.0.0'),
    design: cardDesignSchema.omit({ backRevision: true }),
  })
  .strict();
const v1ProjectSchema = v2ProjectSchema
  .extend({
    schemaVersion: z.literal(1),
    generatorVersion: z.literal('events-1.0.0'),
    generator: v1GeneratorSchema,
  })
  .strict();
export function migrateEventProject(value: unknown): z.infer<typeof eventProjectSchema> {
  if (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    (value.schemaVersion === 1 || value.schemaVersion === 2 || value.schemaVersion === 3)
  ) {
    const previous =
      value.schemaVersion === 1
        ? v1ProjectSchema.parse(value)
        : value.schemaVersion === 2
          ? v2ProjectSchema.parse(value)
          : v3ProjectSchema.parse(value);
    return eventProjectSchema.parse({
      ...previous,
      schemaVersion: 4,
      generatorVersion: EVENT_VERSION,
      generator: {
        ...previous.generator,
        version: 3,
        albGifts: { min: 4, max: 9 },
        weights: { ...previous.generator.weights, ...RARE_EVENT_WEIGHTS },
      },
      design: {
        ...previous.design,
        backRevision: 'backRevision' in previous.design ? previous.design.backRevision : 0,
      },
    });
  }
  return eventProjectSchema.parse(value);
}

export type PlayerTarget = z.infer<typeof playerTargetSchema>;
export type EventEffect = z.infer<typeof eventEffectSchema>;
export type EventStep = z.infer<typeof eventStepSchema>;
export type EventCard = z.infer<typeof eventCardSchema>;
export type EventGenerator = z.infer<typeof eventGeneratorSchema>;
export type CardDesign = z.infer<typeof cardDesignSchema>;
export type EventProject = z.infer<typeof eventProjectSchema>;
export type EventKind = (typeof EVENT_KINDS)[number];
export type EventResource = (typeof EVENT_RESOURCES)[number];
export type ResourceSelection = z.infer<typeof resourceSelectionSchema>;

export const CARD_PALETTES = {
  moss: { background: '#fff6dd', ink: '#172c3b', accent: '#527b64' },
  amethyst: { background: '#f6edff', ink: '#2d2045', accent: '#8553b3' },
  treasure: { background: '#fff3cf', ink: '#342b21', accent: '#ad7721' },
} as const;
export const DEFAULT_EVENT_GENERATOR: EventGenerator = {
  version: 3,
  seed: 'alb-und-abenteuer',
  revision: 0,
  count: 12,
  theme: 'mixed',
  steps: { min: 1, max: 3 },
  movement: { min: 1, max: 6 },
  resources: { min: 1, max: 5 },
  albGifts: { min: 4, max: 9 },
  targetRank: { min: 1, max: 3 },
  weights: {
    'alb-move': 20,
    'alb-steal': 20,
    move: 20,
    pentagon: 15,
    resources: 25,
    steal: 10,
    'tile-change': 10,
    ...RARE_EVENT_WEIGHTS,
  },
  resourceWeights: { scrap: 24, gem: 8, platinum: 24 / 9, amethyst: 24 / 27, gold: 12 },
  targetBases: ['turn-order', 'board'],
  allowBackward: true,
  allowTileChanges: false,
  costChance: 0.2,
  mode: 'sequence',
};
export const DEFAULT_CARD_DESIGN: CardDesign = {
  palette: 'moss',
  backRevision: 0,
  ...CARD_PALETTES.moss,
  backTitle: 'HEXA · EREIGNISSE',
  footer: 'Eine Karte. Neue Möglichkeiten.',
  distanceMetric: 'path',
};
export function defaultEffect(kind: EventKind | 'custom'): EventEffect {
  const target: PlayerTarget = { kind: 'active' };
  switch (kind) {
    case 'alb-move':
      return {
        kind,
        target: { kind: 'board', direction: 'any', rank: 1, origin: 'alb' },
        limit: null,
      };
    case 'alb-steal':
      return {
        kind,
        target: { kind: 'turn-order', direction: 'next', rank: 1 },
        amount: 2,
        resource: 'random',
      };
    case 'alb-give':
      return {
        kind,
        target,
        amount: 5,
        resource: 'random',
        approach: { amount: 1, unit: 'pentagons' },
      };
    case 'gift':
      return {
        kind,
        source: { kind: 'bank' },
        amount: 2,
        resource: 'random',
        destination: 'carried',
      };
    case 'protection':
      return { kind, target, turns: 1, against: 'all' };
    case 'bonus-roll':
      return { kind, target, fieldActions: 'last' };
    case 'move':
      return {
        kind,
        target,
        amount: 3,
        unit: 'fields',
        direction: 'forward',
        fieldActions: 'each',
        optional: false,
      };
    case 'pentagon':
      return { kind, target, ordinal: 1, direction: 'forward', fieldAction: true };
    case 'resources':
      return {
        kind,
        target,
        operation: 'gain',
        amount: 2,
        resource: 'random',
        location: 'carried',
      };
    case 'steal':
      return {
        kind,
        target: { kind: 'turn-order', direction: 'next', rank: 1 },
        amount: 2,
        resource: 'random',
        location: 'carried',
      };
    case 'tile-change':
      return { kind, target, amount: 3, operation: 'rotate', optional: true };
    case 'custom':
      return { kind, text: 'Beschreibe hier deinen eigenen Effekt.' };
  }
}
