import { z } from 'zod';
import { DECORATION_KINDS } from './objects';
import type { FieldEdit, TileConfig } from './types';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const point = z
  .object({ x: z.number().finite().min(-1).max(1), y: z.number().finite().min(-1).max(1) })
  .strict();
const gradient = z
  .array(z.object({ at: z.number().min(0).max(1), color: hex }).strict())
  .min(2)
  .max(12)
  .refine(
    (stops) =>
      stops[0]?.at === 0 &&
      stops.at(-1)?.at === 1 &&
      stops.every((stop, i) => i === 0 || stop.at > stops[i - 1]!.at),
    'Farbverlauf muss von 0 bis 1 streng aufsteigend sein.',
  );
const action = z.enum([
  'rotate',
  'shift',
  'event',
  'shop',
  'scrap',
  'jump',
  'alb',
  'amethyst',
  'platinum',
  'gem',
  'gold',
  'none',
  'custom',
]);
const LEGACY_DECORATION_KINDS = [
  'tree',
  'pine',
  'oak',
  'birch',
  'deadTree',
  'bush',
  'rock',
  'crystal',
] as const;
const V5_DECORATION_KINDS = [
  'tree',
  'pine',
  'oak',
  'birch',
  'deadTree',
  'bush',
  'rock',
  'crystal',
  'willow',
  'maple',
  'fern',
  'grass',
  'flowers',
  'mushrooms',
  'reeds',
  'log',
  'stump',
  'quartz',
] as const;
const kind = z.enum(DECORATION_KINDS);
const v5Kind = z.enum(V5_DECORATION_KINDS);
const legacyKind = z.enum(LEGACY_DECORATION_KINDS);
const modelSlots = <T extends string>(kinds: readonly T[]) =>
  z
    .object(
      Object.fromEntries(kinds.map((entry) => [entry, z.string().max(100).optional()])) as Record<
        T,
        z.ZodOptional<z.ZodString>
      >,
    )
    .strict()
    .optional();
const fieldEdit = z
  .object({
    id: z.string().min(1).max(100),
    cellIds: z.array(z.string().max(50)).max(3000),
    action,
    color: hex.optional(),
    label: z.string().max(100).optional(),
    heightOffset: z.number().min(-0.12).max(0.3).optional(),
    heightMode: z.enum(['flat', 'terraced']).optional(),
  })
  .strict();
const fieldList = (schema: z.ZodType<FieldEdit>) =>
  z
    .array(schema)
    .max(1000)
    .refine(
      (fields) => new Set(fields.map((field) => field.id)).size === fields.length,
      'Spielfeld-IDs müssen eindeutig sein.',
    );
export const configSchema = z
  .object({
    schemaVersion: z.literal(10),
    generatorVersion: z.literal('10.0.0'),
    name: z.string().trim().min(1).max(80),
    seed: z.string().min(1).max(128),
    editing: z.object({ regeneratePathsOnCenterChange: z.boolean() }).strict(),
    actions: z
      .object({
        weights: z.record(action, z.number().finite().min(0).max(100)),
        revision: z.number().int().min(0).max(2147483647),
      })
      .strict(),
    rules: z
      .object({
        minFieldArea: z.number().finite().min(0).max(0.5),
        requireFieldConnectivity: z.boolean(),
        requirePathConnectivity: z.boolean(),
        exportPolicy: z.enum(['warn', 'block']),
      })
      .strict(),
    border: z
      .object({
        enabled: z.boolean(),
        width: z.number().finite().min(0).max(0.1),
        mode: z.enum(['black', 'custom', 'fields', 'transparent']),
        color: hex,
      })
      .strict(),
    grid: z
      .object({
        kind: z.enum(['hex', 'diamond']),
        divisions: z.number().int().min(6).max(24),
        subDivisions: z.number().int().min(1).max(6),
        showGrid: z.boolean(),
        showSubgrid: z.boolean(),
      })
      .strict(),
    terrain: z
      .object({
        scale: z.number().min(0.1).max(12),
        octaves: z.number().int().min(1).max(8),
        persistence: z.number().min(0.1).max(0.9),
        lacunarity: z.number().min(1).max(4),
        elevation: z.number().min(0).max(0.6),
        terraces: z.number().int().min(1).max(24),
        grain: z.number().min(0).max(0.4),
        overhang: z.number().min(0).max(0.03),
        skirtDepth: z.number().min(0.005).max(0.1),
        texture: z
          .object({
            scale: z.number().min(1).max(32),
            octaves: z.number().int().min(1).max(6),
            strength: z.number().min(0).max(0.4),
            detailScale: z.number().min(8).max(180),
            detailStrength: z.number().min(0).max(0.25),
          })
          .strict(),
        gradient,
        wallGradient: gradient,
      })
      .strict(),
    center: z
      .object({
        shape: z.enum(['regular', 'organic']),
        scale: z.number().min(0.5).max(1.2),
        rotation: z.number().min(-180).max(180),
        irregularity: z.number().min(0).max(0.35),
        offset: z
          .object({ x: z.number().min(-0.45).max(0.45), y: z.number().min(-0.45).max(0.45) })
          .strict(),
        portalWidth: z.number().min(0.25).max(0.7),
      })
      .strict(),
    paths: z
      .object({
        enabled: z.boolean(),
        auto: z.boolean(),
        enabledSides: z.array(z.boolean()).length(6),
        loop: z.boolean(),
        fieldSize: z.number().int().min(1).max(80),
        fieldCount: z.number().int().min(7).max(24),
        heightMode: z.enum(['flat', 'terraced']),
        detail: z
          .object({
            pebbleDensity: z.number().min(0).max(1),
            centerLight: z.number().min(0).max(0.5),
            edgeShade: z.number().min(0).max(0.4),
          })
          .strict(),
        gradient,
        fields: fieldList(fieldEdit),
      })
      .strict(),
    decoration: z
      .object({
        enabled: z.boolean(),
        density: z.number().min(0).max(1),
        maxPerCell: z.number().int().min(1).max(12),
        species: z
          .array(kind)
          .min(1)
          .max(DECORATION_KINDS.length)
          .refine(
            (values) => new Set(values).size === values.length,
            'Objektarten müssen eindeutig sein.',
          ),
        sourceDensity: z.number().min(0).max(1).optional(),
        placements: z
          .array(
            z
              .object({
                id: z.string().min(1).max(100),
                kind,
                cellId: z.string().max(50),
                offset: point,
                scale: z.number().min(0.2).max(3),
                rotation: z.number().min(-360).max(360),
              })
              .strict(),
          )
          .max(5000),
        modelSlots: modelSlots(DECORATION_KINDS),
      })
      .strict(),
    camera: z
      .object({
        mode: z.enum(['top', 'orbit', 'perspective']),
        azimuth: z.number().min(-360).max(360),
        elevation: z.number().min(-85).max(90),
        fov: z.number().min(-100).max(100),
        zoom: z.number().min(0.4).max(3),
      })
      .strict(),
    export: z
      .object({ size: z.number().int().min(128).max(4096), transparent: z.boolean() })
      .strict(),
    palette: z.array(hex).max(32),
  })
  .strict();

export const defaultConfig: TileConfig = {
  schemaVersion: 10,
  generatorVersion: '10.0.0',
  name: 'Mooslicht',
  seed: 'mooslicht-42',
  editing: { regeneratePathsOnCenterChange: false },
  actions: {
    weights: {
      rotate: 10,
      shift: 10,
      event: 20,
      shop: 10,
      scrap: 10,
      jump: 5,
      alb: 5,
      amethyst: 5,
      platinum: 5,
      gem: 10,
      gold: 10,
      custom: 0,
      none: 0,
    },
    revision: 0,
  },
  rules: {
    minFieldArea: 0.0625,
    requireFieldConnectivity: true,
    requirePathConnectivity: true,
    exportPolicy: 'block',
  },
  border: { enabled: false, width: 0.015, mode: 'black', color: '#000000' },
  grid: { kind: 'hex', divisions: 18, subDivisions: 3, showGrid: true, showSubgrid: false },
  terrain: {
    scale: 2.5,
    octaves: 4,
    persistence: 0.5,
    lacunarity: 2,
    elevation: 0.23,
    terraces: 7,
    grain: 0.09,
    overhang: 0.008,
    skirtDepth: 0.035,
    texture: { scale: 5, octaves: 4, strength: 0.3, detailScale: 38, detailStrength: 0.12 },
    gradient: [
      { at: 0, color: '#344c49' },
      { at: 0.35, color: '#617c59' },
      { at: 0.7, color: '#9ba96d' },
      { at: 1, color: '#d6cc98' },
    ],
    wallGradient: [
      { at: 0, color: '#373e38' },
      { at: 0.5, color: '#6d6552' },
      { at: 1, color: '#b6a27c' },
    ],
  },
  center: {
    shape: 'organic',
    scale: 0.8,
    rotation: 0,
    irregularity: 0.18,
    offset: { x: 0, y: 0 },
    portalWidth: 0.45,
  },
  paths: {
    enabled: true,
    auto: true,
    enabledSides: [true, true, true, true, true, true],
    loop: true,
    fieldSize: 5,
    fieldCount: 13,
    heightMode: 'flat',
    detail: { pebbleDensity: 0.3, centerLight: 0.22, edgeShade: 0.12 },
    gradient: [
      { at: 0, color: '#b69462' },
      { at: 0.5, color: '#d4bb83' },
      { at: 1, color: '#eee0b1' },
    ],
    fields: [],
  },
  decoration: {
    enabled: true,
    density: 0.55,
    maxPerCell: 5,
    species: ['pine', 'oak', 'birch', 'bush', 'fern', 'mushrooms', 'rock'],
    placements: [],
  },
  camera: { mode: 'orbit', azimuth: -25, elevation: 52, fov: 35, zoom: 1 },
  export: { size: 1080, transparent: true },
  palette: ['#d4bb83', '#af7864', '#7e9a91', '#b6a3c9'],
};
export const DEFAULT_CONFIG = defaultConfig;
/** V9 has no center-edit policy or action weights; freeze its historical object catalog. */
const v9Schema = configSchema
  .omit({ editing: true, actions: true })
  .extend({
    schemaVersion: z.literal(9),
    generatorVersion: z.literal('9.0.0'),
    decoration: configSchema.shape.decoration
      .extend({
        species: z
          .array(v5Kind)
          .min(1)
          .max(18)
          .refine(
            (values) => new Set(values).size === values.length,
            'Objektarten müssen eindeutig sein.',
          ),
        placements: z
          .array(configSchema.shape.decoration.shape.placements.element.extend({ kind: v5Kind }))
          .max(5000),
        modelSlots: modelSlots(V5_DECORATION_KINDS),
      })
      .strict(),
  })
  .strict();
/** V8 has no border settings. */
const v8Schema = v9Schema
  .omit({ border: true })
  .extend({ schemaVersion: z.literal(8), generatorVersion: z.literal('8.0.0') })
  .strict();
/** V7 has no persisted rule settings. */
const v7Schema = v8Schema
  .omit({ rules: true })
  .extend({ schemaVersion: z.literal(7), generatorVersion: z.literal('7.0.0') })
  .strict();
/** V6 has the same persisted fields but older manual geometry semantics. */
const v6Schema = v7Schema
  .extend({ schemaVersion: z.literal(6), generatorVersion: z.literal('6.0.0') })
  .strict();
/** V5 still requires its obsolete ramp width. */
const v5Schema = v6Schema
  .extend({
    schemaVersion: z.literal(5),
    generatorVersion: z.literal('5.0.0'),
    paths: v6Schema.shape.paths.extend({ transitionWidth: z.number().min(0.01).max(0.1) }).strict(),
  })
  .strict();
/** V4 remains frozen to its original eight kinds. */
const v4Schema = v5Schema
  .extend({
    schemaVersion: z.literal(4),
    generatorVersion: z.literal('4.0.0'),
    decoration: v5Schema.shape.decoration
      .extend({
        species: z
          .array(legacyKind)
          .min(1)
          .max(8)
          .refine(
            (values) => new Set(values).size === values.length,
            'Objektarten müssen eindeutig sein.',
          ),
        placements: z
          .array(v5Schema.shape.decoration.shape.placements.element.extend({ kind: legacyKind }))
          .max(5000),
        modelSlots: modelSlots(LEGACY_DECORATION_KINDS),
      })
      .strict(),
  })
  .strict();
/** V1–V3 additionally require the existing explicit layout migration. */
const legacyFields = fieldList(fieldEdit.omit({ heightOffset: true, heightMode: true }));
const v3Schema = v4Schema
  .extend({
    schemaVersion: z.literal(3),
    generatorVersion: z.literal('3.0.0'),
    center: v4Schema.shape.center.omit({ portalWidth: true }),
    paths: v4Schema.shape.paths.omit({ heightMode: true }).extend({ fields: legacyFields }),
  })
  .strict();
const v2Schema = v3Schema
  .extend({
    schemaVersion: z.literal(2),
    generatorVersion: z.literal('2.0.0'),
    terrain: v3Schema.shape.terrain.omit({ overhang: true, skirtDepth: true }),
    center: v3Schema.shape.center.omit({ offset: true }),
    paths: v3Schema.shape.paths.omit({ fieldCount: true, transitionWidth: true, detail: true }),
    decoration: v3Schema.shape.decoration.omit({ maxPerCell: true, species: true }),
  })
  .strict();
const v1Schema = v2Schema
  .omit({ center: true })
  .extend({
    schemaVersion: z.literal(1),
    generatorVersion: z.literal('1.0.0'),
    terrain: v2Schema.shape.terrain.omit({ texture: true }),
  })
  .strict();
export interface ConfigMigration {
  config: TileConfig;
  migrated: boolean;
  notices: string[];
}
/** Remove only a setting that was already validated by its historical schema. */
function withoutRampWidth(paths: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(paths).filter(([key]) => key !== 'transitionWidth'));
}
export function migrateConfig(value: unknown): ConfigMigration {
  if (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 9
  ) {
    const legacy = v9Schema.parse(value);
    return {
      config: configSchema.parse({
        ...legacy,
        schemaVersion: 10,
        generatorVersion: '10.0.0',
        editing: structuredClone(defaultConfig.editing),
        actions: structuredClone(defaultConfig.actions),
      }),
      migrated: true,
      notices: [
        'Projekt auf Generator 10 umgestellt: Einstellungen für Center-Änderungen und gewichtetes Aktionswürfeln wurden ergänzt. Bestehende Felder, Formen, Aktionen, Farben, Höhen, Prüfregeln, Rand, Objektplatzierungen, Paletten und Modellzuordnungen bleiben unverändert. Center-Änderungen erzeugen standardmäßig keinen neuen Wegeplan. Die neuen Gewichte wirken erst beim ausdrücklichen Würfeln; vorhandene Aktionen werden nicht neu ausgewürfelt. Vorhandene Dateien bleiben unverändert.',
      ],
    };
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 8
  ) {
    const legacy = v8Schema.parse(value);
    return {
      config: configSchema.parse({
        ...legacy,
        schemaVersion: 10,
        generatorVersion: '10.0.0',
        border: structuredClone(defaultConfig.border),
        editing: structuredClone(defaultConfig.editing),
        actions: structuredClone(defaultConfig.actions),
      }),
      migrated: true,
      notices: [
        'Projekt auf Generator 10 umgestellt: Der optionale Außenrand wurde deaktiviert ergänzt, damit die bisherige Ausgabe unverändert bleibt. Alle Felder, Formen, Aktionen, Farben, Höhen, Prüfregeln, Objektplatzierungen, Paletten und Modellzuordnungen wurden unverändert übernommen. Ein später aktivierter Rand blendet nur überlappende Objekte aus; gespeicherte Platzierungen bleiben erhalten und erscheinen nach dem Deaktivieren wieder. Die neuen Aktionsgewichte wirken erst beim ausdrücklichen Würfeln; Center-Änderungen erzeugen standardmäßig keinen neuen Wegeplan. Vorhandene Dateien bleiben unverändert.',
      ],
    };
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    (value.schemaVersion === 6 || value.schemaVersion === 7)
  ) {
    const legacy = value.schemaVersion === 7 ? v7Schema.parse(value) : v6Schema.parse(value);
    return {
      config: configSchema.parse({
        ...legacy,
        schemaVersion: 10,
        generatorVersion: '10.0.0',
        rules: structuredClone(defaultConfig.rules),
        border: structuredClone(defaultConfig.border),
        editing: structuredClone(defaultConfig.editing),
        actions: structuredClone(defaultConfig.actions),
      }),
      migrated: true,
      notices: [
        'Projekt auf Generator 10 umgestellt: Einstellbare Prüfregeln und ein deaktivierter optionaler Außenrand wurden ergänzt. Alle Felder, Aktionen, Farben, Höhen, Objektplatzierungen und Modellzuordnungen wurden unverändert übernommen. Ein später aktivierter Rand blendet überlappende Objekte nur aus und entfernt keine gespeicherten Platzierungen. Bearbeiten bleibt möglich; der Export prüft standardmäßig Mindestfläche und Verbindungen. Die neuen Aktionsgewichte wirken erst beim ausdrücklichen Würfeln; Center-Änderungen erzeugen standardmäßig keinen neuen Wegeplan. Vorhandene Dateien bleiben unverändert.',
      ],
    };
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    (value.schemaVersion === 4 || value.schemaVersion === 5)
  ) {
    const legacy = value.schemaVersion === 4 ? v4Schema.parse(value) : v5Schema.parse(value);
    return {
      config: configSchema.parse({
        ...legacy,
        schemaVersion: 10,
        generatorVersion: '10.0.0',
        rules: structuredClone(defaultConfig.rules),
        border: structuredClone(defaultConfig.border),
        editing: structuredClone(defaultConfig.editing),
        actions: structuredClone(defaultConfig.actions),
        paths: withoutRampWidth(legacy.paths),
      }),
      migrated: true,
      notices: [
        'Projekt auf Generator 10 umgestellt: Höhenwechsel werden als Stufen mit senkrechten Wänden dargestellt. Prüfregeln und ein deaktivierter optionaler Außenrand werden ergänzt; die obsolete Rampenbreite entfällt; alle Felder, Aktionen, Farben, Höhen, Objektplatzierungen und Modellzuordnungen wurden unverändert übernommen. Ein später aktivierter Rand blendet überlappende Objekte nur aus und entfernt keine gespeicherten Platzierungen. Die neuen Aktionsgewichte wirken erst beim ausdrücklichen Würfeln; Center-Änderungen erzeugen standardmäßig keinen neuen Wegeplan. Vorhandene Dateien bleiben unverändert.',
      ],
    };
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    (value.schemaVersion === 1 || value.schemaVersion === 2 || value.schemaVersion === 3)
  ) {
    const legacy =
      value.schemaVersion === 1
        ? v1Schema.parse(value)
        : value.schemaVersion === 2
          ? v2Schema.parse(value)
          : v3Schema.parse(value);
    const center =
      'center' in legacy
        ? legacy.center
        : { shape: 'regular' as const, scale: 1, rotation: 0, irregularity: 0 };
    const count =
      'fieldCount' in legacy.paths
        ? legacy.paths.fieldCount
        : legacy.paths.fields.filter((field) => field.cellIds.length > 0 && field.id !== 'center')
            .length + 1;
    return {
      config: configSchema.parse({
        ...legacy,
        schemaVersion: 10,
        generatorVersion: '10.0.0',
        rules: structuredClone(defaultConfig.rules),
        border: structuredClone(defaultConfig.border),
        editing: structuredClone(defaultConfig.editing),
        actions: structuredClone(defaultConfig.actions),
        center: { ...defaultConfig.center, ...center },
        terrain: { ...defaultConfig.terrain, ...legacy.terrain },
        paths: {
          ...defaultConfig.paths,
          ...withoutRampWidth(legacy.paths),
          auto: true,
          fields: [],
          heightMode: 'flat',
          fieldCount: count >= 7 && count <= 24 ? count : defaultConfig.paths.fieldCount,
        },
        decoration: {
          ...defaultConfig.decoration,
          ...legacy.decoration,
          density: legacy.decoration.sourceDensity ?? legacy.decoration.density,
          placements: [],
        },
      }),
      migrated: true,
      notices: [
        'Projekt auf Generator 10 umgestellt: Mittige Pentagon-Portale mit Landschaftsecken, feste Eingangsfelder und Stufen mit senkrechten Wänden. Wege und Platzierungen werden neu aufgebaut; Prüfregeln und ein deaktivierter optionaler Außenrand werden ergänzt. Die neuen Aktionsgewichte wirken erst beim ausdrücklichen Würfeln; Center-Änderungen erzeugen standardmäßig keinen neuen Wegeplan. Vorhandene Dateien bleiben unverändert.',
      ],
    };
  }
  return { config: configSchema.parse(value), migrated: false, notices: [] };
}
export function parseConfig(value: unknown): TileConfig {
  return migrateConfig(value).config;
}
