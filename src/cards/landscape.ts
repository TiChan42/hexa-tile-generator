import { defaultConfig } from '../core/config';
import { generateTile } from '../core/generate';
import { hash32, randomAt } from '../core/random';

/** Renderer version 5: embedded landscape images also support SVG 1.1 readers. */
export const CARD_LANDSCAPE_VERSION = 5;
const palettes = [
  ['#314b40', '#587952', '#91ab70', '#d6ce9d'],
  ['#3b3e59', '#716b83', '#a597ac', '#dbc9b7'],
  ['#3d5860', '#718f8b', '#a7c1aa', '#e5dfba'],
  ['#5a4939', '#8e7651', '#c1a36d', '#eddbab'],
];
function cardLandscapeConfig(seed: string, divisions: number) {
  const config = structuredClone(defaultConfig),
    colors = palettes[Math.floor(randomAt(seed, 'card-map-biome') * palettes.length)]!;
  config.seed = seed;
  config.terrain.noise.seed = seed;
  config.grid.divisions = divisions;
  config.grid.subDivisions = 6;
  config.paths.fieldCount = 9;
  config.decoration.density = 0.22;
  config.decoration.maxPerCell = 2;
  config.terrain.gradient = colors.map((color, index) => ({ at: index / 3, color }));
  return config;
}
export function cardFrontScene(seed: string, cardId: string) {
  const tileSeed = seedFor(seed, 'front', cardId);
  const config = cardLandscapeConfig(tileSeed, 18);
  config.decoration.density = 0.55;
  config.decoration.species = ['oak', 'pine', 'birch', 'fern', 'mushrooms', 'rock', 'quartz'];
  config.grid.showGrid = false;
  config.paths.fields = [];
  config.rules.exportPolicy = 'warn';
  config.export = { size: 1536, transparent: true };
  config.camera = { mode: 'orbit', azimuth: -25, elevation: 42, fov: 35, zoom: 1 };
  return { config, tile: generateTile(config) };
}
export function cardBackScene(seed: string, revision: number, column: number, row: number) {
  const config = cardLandscapeConfig(
    seedFor(seed, `back-board-${revision}`, `${column}:${row}`),
    24,
  );
  config.decoration.species = ['oak', 'pine', 'birch', 'fern', 'mushrooms', 'rock', 'quartz'];
  config.grid.showGrid = false;
  config.rules.exportPolicy = 'warn';
  return { config, tile: generateTile(config) };
}
function seedFor(seed: string, domain: string, key: string | number) {
  return `card-${hash32(JSON.stringify([seed, domain, key]))
    .toString(16)
    .padStart(8, '0')}`;
}
