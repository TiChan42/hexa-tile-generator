import type { DecorationKind, GradientStop, TileConfig } from './types';
import { DECORATION_KINDS } from './objects';
import { defaultObjectSizeProfiles } from './object-sizes';
import type { ObjectSizeProfiles, ObjectSizeProfile } from './object-sizes';
import { randomAt } from './random';

interface BiomePreset {
  id: string;
  name: string;
  summary: string;
  species: readonly DecorationKind[];
  density: number;
  sizeProfiles: Partial<Record<DecorationKind, ObjectSizeProfile>>;
  terrain: readonly string[];
  walls: readonly string[];
  paths: readonly string[];
}

/** Ready-to-apply color and object palettes. Raster, fields, seed and terrain shape stay intact. */
export const BIOME_PRESETS = [
  {
    id: 'mosslight',
    name: 'Mooslicht',
    summary: 'Sattes Grün, Farne und Pilze',
    species: ['tree', 'oak', 'pine', 'birch', 'bush', 'fern', 'mushrooms', 'log', 'rock'],
    density: 0.6,
    sizeProfiles: {
      tree: { scale: 1.8, variation: 0.2 },
      oak: { scale: 1.85, variation: 0.18 },
      fern: { scale: 0.5, variation: 0.22 },
      mushrooms: { scale: 0.4, variation: 0.25 },
    },
    terrain: ['#344c49', '#617c59', '#9ba96d', '#d6cc98'],
    walls: ['#303a30', '#75674b', '#baa878'],
    paths: ['#a78657', '#d2b67e', '#ebdbaf'],
  },
  {
    id: 'abendrot',
    name: 'Abendrot',
    summary: 'Rostrot, Rosa und warmes Gold',
    species: ['maple', 'oak', 'bush', 'flowers', 'mushrooms', 'stump', 'rock'],
    density: 0.58,
    sizeProfiles: {
      maple: { scale: 1.9, variation: 0.2 },
      oak: { scale: 1.65, variation: 0.18 },
      flowers: { scale: 0.42, variation: 0.25 },
    },
    terrain: ['#503b51', '#956c71', '#c18c76', '#e6c49d'],
    walls: ['#493845', '#865b5b', '#bf8366', '#dbb88b'],
    paths: ['#996f68', '#c39978', '#eed1a5'],
  },
  {
    id: 'frostgrat',
    name: 'Frostgrat',
    summary: 'Kühle Felsen, Nadelwald und Quarz',
    species: ['tree', 'pine', 'birch', 'deadTree', 'grass', 'rock', 'quartz', 'stump'],
    density: 0.48,
    sizeProfiles: {
      pine: { scale: 1.35, variation: 0.24 },
      birch: { scale: 1.3, variation: 0.22 },
      rock: { scale: 0.8, variation: 0.28 },
      quartz: { scale: 0.8, variation: 0.3 },
    },
    terrain: ['#344b61', '#678b98', '#aac4c3', '#eceddc'],
    walls: ['#303c4a', '#687e88', '#b3c3bc'],
    paths: ['#839a9b', '#b1c5c0', '#e4e6ce'],
  },
  {
    id: 'amethysthain',
    name: 'Amethysthain',
    summary: 'Violette Kristalle zwischen Farnen',
    species: ['pine', 'oak', 'birch', 'bush', 'fern', 'mushrooms', 'crystal', 'quartz', 'rock'],
    density: 0.56,
    sizeProfiles: {
      crystal: { scale: 0.95, variation: 0.3 },
      quartz: { scale: 0.8, variation: 0.28 },
      mushrooms: { scale: 0.42, variation: 0.25 },
    },
    terrain: ['#453e57', '#746e85', '#a49aad', '#d6c9c0'],
    walls: ['#383345', '#736278', '#b398a4'],
    paths: ['#a18e87', '#c5b0a1', '#edddbf'],
  },
  {
    id: 'sonnensteppe',
    name: 'Sonnensteppe',
    summary: 'Helles Gras, Blüten und warmer Stein',
    species: ['tree', 'oak', 'bush', 'grass', 'flowers', 'stump', 'rock', 'quartz'],
    density: 0.5,
    sizeProfiles: {
      tree: { scale: 1.25, variation: 0.28 },
      oak: { scale: 1.35, variation: 0.25 },
      bush: { scale: 0.5, variation: 0.25 },
      grass: { scale: 0.45, variation: 0.3 },
      flowers: { scale: 0.4, variation: 0.25 },
    },
    terrain: ['#5b6242', '#8d9658', '#c2ba77', '#e2d39b'],
    walls: ['#494133', '#927953', '#c8ad77'],
    paths: ['#b68f61', '#dbc293', '#f0e2ba'],
  },
  {
    id: 'nebelmoor',
    name: 'Nebelmoor',
    summary: 'Schilf, Weiden und nebliges Blaugrün',
    species: ['willow', 'birch', 'deadTree', 'bush', 'fern', 'mushrooms', 'reeds', 'log', 'rock'],
    density: 0.68,
    sizeProfiles: {
      willow: { scale: 2, variation: 0.22 },
      reeds: { scale: 0.85, variation: 0.3 },
      fern: { scale: 0.5, variation: 0.22 },
      mushrooms: { scale: 0.5, variation: 0.28 },
    },
    terrain: ['#30464b', '#526d6c', '#86a391', '#bcc8ab'],
    walls: ['#303938', '#626e5c', '#9da58b'],
    paths: ['#8e8872', '#b5b59a', '#dce0bf'],
  },
  {
    id: 'regenbogenhain',
    name: 'Regenbogenhain',
    summary: 'Mehrfarbige Flecken von Türkis bis Pink',
    species: ['maple', 'willow', 'birch', 'bush', 'flowers', 'mushrooms', 'fern', 'crystal'],
    density: 0.62,
    sizeProfiles: {
      maple: { scale: 1.85, variation: 0.22 },
      willow: { scale: 1.9, variation: 0.25 },
      flowers: { scale: 0.5, variation: 0.3 },
      mushrooms: { scale: 0.55, variation: 0.3 },
      crystal: { scale: 0.85, variation: 0.3 },
    },
    terrain: ['#29536d', '#328b88', '#68a76d', '#d4bb62', '#dc865e', '#bb6685', '#735e9c'],
    walls: ['#263d52', '#34645f', '#65734b', '#bb7950', '#714a70'],
    paths: ['#667e8d', '#b77b68', '#e1c888'],
  },
  {
    id: 'pilzkristallgrotte',
    name: 'Pilz-Kristallgrotte',
    summary: 'Nur Pilze, Kristalle und Bergkristall',
    species: ['mushrooms', 'crystal', 'quartz'],
    density: 0.78,
    sizeProfiles: {
      mushrooms: { scale: 1, variation: 0.35 },
      crystal: { scale: 1.3, variation: 0.35 },
      quartz: { scale: 1.2, variation: 0.32 },
    },
    terrain: ['#262841', '#49375d', '#72528d', '#a8739f', '#dbafba'],
    walls: ['#202235', '#413653', '#6e4f77', '#a27684'],
    paths: ['#71677c', '#aa8d93', '#d7c0b1'],
  },
  {
    id: 'kobaltkristallhoehle',
    name: 'Kobaltkristallhöhle',
    summary: 'Kobalt, Eisblau und ausschließlich Kristalle',
    species: ['crystal', 'quartz'],
    density: 0.56,
    sizeProfiles: {
      crystal: { scale: 1.5, variation: 0.35 },
      quartz: { scale: 1.6, variation: 0.35 },
    },
    terrain: ['#192e52', '#255a87', '#4c9caa', '#a7d3ce', '#e3e8dc'],
    walls: ['#18253f', '#234765', '#43818a', '#9fbdb5'],
    paths: ['#537b91', '#97bdc0', '#dbe1d6'],
  },
  {
    id: 'korallenmoor',
    name: 'Korallenmoor',
    summary: 'Koralle, Lagune und Orchideenrosa',
    species: ['reeds', 'mushrooms', 'flowers', 'crystal', 'fern', 'bush'],
    density: 0.7,
    sizeProfiles: {
      reeds: { scale: 0.85, variation: 0.3 },
      mushrooms: { scale: 0.65, variation: 0.3 },
      flowers: { scale: 0.5, variation: 0.28 },
      crystal: { scale: 0.9, variation: 0.3 },
    },
    terrain: ['#235c60', '#35a09a', '#91c486', '#efbd78', '#e88476', '#b75f84'],
    walls: ['#1c414b', '#35756c', '#b58462', '#b65f70'],
    paths: ['#598b82', '#c08d73', '#e5c28c'],
  },
  {
    id: 'nachtgarten',
    name: 'Nachtgarten',
    summary: 'Leuchtende Pilze und Kristalle im Dunkel',
    species: ['mushrooms', 'crystal', 'quartz', 'flowers', 'fern'],
    density: 0.72,
    sizeProfiles: {
      mushrooms: { scale: 0.85, variation: 0.35 },
      crystal: { scale: 1, variation: 0.32 },
      quartz: { scale: 0.95, variation: 0.32 },
      flowers: { scale: 0.45, variation: 0.28 },
    },
    terrain: ['#1e253c', '#3b3668', '#6756a1', '#ad649d', '#e19a83'],
    walls: ['#181e32', '#343052', '#694b83', '#a65c79'],
    paths: ['#59577d', '#a16f8c', '#d8a589'],
  },
  {
    id: 'jadefarnwald',
    name: 'Jadefarnwald',
    summary: 'Jadegrün mit üppigen Farnen und Blüten',
    species: ['willow', 'oak', 'bush', 'fern', 'mushrooms', 'flowers'],
    density: 0.74,
    sizeProfiles: {
      willow: { scale: 2, variation: 0.2 },
      oak: { scale: 2, variation: 0.18 },
      fern: { scale: 0.7, variation: 0.28 },
      bush: { scale: 0.8, variation: 0.25 },
      flowers: { scale: 0.45, variation: 0.25 },
    },
    terrain: ['#203d37', '#286b53', '#61a775', '#a8c478', '#e0d39a'],
    walls: ['#1b302d', '#315c42', '#769052', '#c0ad78'],
    paths: ['#657b60', '#9fae75', '#d6c891'],
  },
  {
    id: 'juwelensteppe',
    name: 'Juwelensteppe',
    summary: 'Goldenes Gras, Türkis und Violett',
    species: ['grass', 'flowers', 'quartz', 'crystal', 'rock', 'bush'],
    density: 0.46,
    sizeProfiles: {
      grass: { scale: 0.45, variation: 0.3 },
      flowers: { scale: 0.4, variation: 0.28 },
      quartz: { scale: 0.8, variation: 0.3 },
      crystal: { scale: 0.8, variation: 0.3 },
      bush: { scale: 0.5, variation: 0.25 },
    },
    terrain: ['#72533d', '#b07b4b', '#d6bd6e', '#66a09a', '#6371a1', '#886297'],
    walls: ['#493b34', '#936540', '#ba9d58', '#4b7779', '#695278'],
    paths: ['#9a7657', '#9a9b79', '#d2bc86'],
  },
] as const satisfies readonly BiomePreset[];

export type BiomePresetId = (typeof BIOME_PRESETS)[number]['id'];

function gradient(colors: readonly string[]): GradientStop[] {
  return colors.map((color, index) => ({ at: index / (colors.length - 1), color }));
}

export function biomeObjectSizeProfiles(id: BiomePresetId): ObjectSizeProfiles {
  const preset = BIOME_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unbekanntes Biomprofil „${id}“.`);
  const result = defaultObjectSizeProfiles();
  for (const kind of DECORATION_KINDS) {
    const override = (preset as BiomePreset).sizeProfiles[kind];
    if (override) result[kind] = { ...override };
  }
  return result;
}

/** Apply a complete, explicit biome recipe while keeping layout and user seed intact. */
export function applyBiomePreset(config: TileConfig, id: BiomePresetId): TileConfig {
  const preset = BIOME_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unbekanntes Biomprofil „${id}“.`);
  const draft = structuredClone(config),
    allowedSpecies = new Set<DecorationKind>(preset.species);
  draft.actions.biome = id;
  draft.terrain.gradient = gradient(preset.terrain);
  draft.terrain.wallGradient = gradient(preset.walls);
  draft.paths.gradient = gradient(preset.paths);
  draft.decoration.species = [...preset.species];
  draft.decoration.enabled = true;
  draft.decoration.sizeProfiles = biomeObjectSizeProfiles(id);
  draft.decoration.density =
    config.decoration.sourceDensity ??
    (config.decoration.density > 0 ? config.decoration.density : preset.density);
  draft.decoration.sourceDensity = draft.decoration.density;
  draft.decoration.placements = draft.decoration.placements.filter((placement) =>
    allowedSpecies.has(placement.kind),
  );
  return draft;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function variedColor(
  color: string,
  seed: string,
  domain: string,
  index: number,
  hueShift: number,
): string {
  const red = parseInt(color.slice(1, 3), 16) / 255;
  const green = parseInt(color.slice(3, 5), 16) / 255;
  const blue = parseInt(color.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    switch (max) {
      case red:
        hue = ((green - blue) / delta) % 6;
        break;
      case green:
        hue = (blue - red) / delta + 2;
        break;
      default:
        hue = (red - green) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  hue = (hue + hueShift + (randomAt(seed, `${domain}-hue`, index) - 0.5) * 5 + 360) % 360;
  const nextSaturation = clamp(
    saturation * (0.86 + randomAt(seed, `${domain}-saturation`) * 0.28),
    0,
    1,
  );
  const nextLightness = clamp(
    lightness + (randomAt(seed, `${domain}-lightness`, index) - 0.5) * 0.09,
    0.04,
    0.96,
  );
  const chroma = (1 - Math.abs(2 * nextLightness - 1)) * nextSaturation;
  const section = hue / 60;
  const second = chroma * (1 - Math.abs((section % 2) - 1));
  const offset = nextLightness - chroma / 2;
  const channels =
    section < 1
      ? [chroma, second, 0]
      : section < 2
        ? [second, chroma, 0]
        : section < 3
          ? [0, chroma, second]
          : section < 4
            ? [0, second, chroma]
            : section < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  return `#${channels
    .map((channel) =>
      Math.round((channel! + offset) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function varyGradient(stops: GradientStop[], seed: string, domain: string): GradientStop[] {
  const hueShift = (randomAt(seed, `${domain}-palette`) - 0.5) * 30;
  return stops.map((stop, index) => {
    const color = variedColor(stop.color, seed, domain, index, hueShift);
    return { ...stop, color };
  });
}

/** Apply a seed-selected biome with small, stable per-tile palette and ecology variations. */
export function randomizeBiomePreset(
  config: TileConfig,
  id: BiomePresetId,
  seed: string,
  continuousNoise: boolean,
): TileConfig {
  const preset = BIOME_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unbekanntes Biomprofil „${id}“.`);
  const draft = applyBiomePreset(config, id);
  draft.terrain.gradient = varyGradient(draft.terrain.gradient, seed, 'terrain');
  draft.terrain.wallGradient = varyGradient(draft.terrain.wallGradient, seed, 'walls');
  draft.paths.gradient = varyGradient(draft.paths.gradient, seed, 'paths');
  const species = preset.species.filter((kind) => randomAt(seed, 'biome-species', kind) > 0.23);
  draft.decoration.species = species.length ? species : [preset.species[0]!];
  draft.decoration.density = Number(
    clamp(preset.density + (randomAt(seed, 'biome-density') - 0.5) * 0.2, 0.28, 0.9).toFixed(3),
  );
  draft.decoration.sourceDensity = draft.decoration.density;
  for (const kind of DECORATION_KINDS) {
    const profile = draft.decoration.sizeProfiles[kind];
    profile.scale = Number(
      clamp(
        profile.scale * (0.9 + randomAt(seed, 'biome-object-size', kind) * 0.2),
        0.1,
        3,
      ).toFixed(3),
    );
    profile.variation = Number(
      clamp(
        profile.variation + (randomAt(seed, 'biome-object-size-variation', kind) - 0.5) * 0.05,
        0,
        0.5,
      ).toFixed(3),
    );
  }
  draft.decoration.maxPerCell = 3 + Math.floor(randomAt(seed, 'biome-object-cluster') * 4);
  draft.paths.detail = {
    pebbleDensity: Number((0.2 + randomAt(seed, 'biome-pebbles') * 0.55).toFixed(3)),
    centerLight: Number((0.12 + randomAt(seed, 'biome-path-light') * 0.3).toFixed(3)),
    edgeShade: Number((0.06 + randomAt(seed, 'biome-path-shade') * 0.22).toFixed(3)),
  };
  if (!continuousNoise) {
    draft.terrain.scale = Number(
      clamp(
        config.terrain.scale * (0.9 + randomAt(seed, 'biome-height-scale') * 0.2),
        0.1,
        12,
      ).toFixed(3),
    );
    draft.terrain.elevation = Number(
      clamp(
        config.terrain.elevation * (0.85 + randomAt(seed, 'biome-elevation') * 0.3),
        0,
        0.6,
      ).toFixed(3),
    );
    draft.terrain.terraces = 4 + Math.floor(randomAt(seed, 'biome-terraces') * 7);
    draft.terrain.texture.scale = Number(
      clamp(
        config.terrain.texture.scale * (0.82 + randomAt(seed, 'biome-texture-scale') * 0.36),
        1,
        32,
      ).toFixed(3),
    );
  }
  draft.name = `${preset.name} ${config.name.split(' ').at(-1) ?? ''}`.trim().slice(0, 80);
  return draft;
}
