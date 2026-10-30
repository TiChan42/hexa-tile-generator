import type { BiomePresetId } from './biomes';
import type { ActionProbabilities } from './action-probabilities';
import type { DecorationKind } from './objects';
import type { ObjectSizeProfiles } from './object-sizes';

/** Generator-space coordinates; renderer maps y to world z. Tile radius is exactly 1. */
export interface Point {
  x: number;
  y: number;
}
export interface GradientStop {
  at: number;
  color: string;
}
export type ActionId =
  | 'rotate'
  | 'shift'
  | 'event'
  | 'shop'
  | 'scrap'
  | 'jump'
  | 'alb'
  | 'amethyst'
  | 'platinum'
  | 'gem'
  | 'gold'
  | 'none'
  | 'custom';
export type { DecorationKind } from './objects';
export interface FieldEdit {
  id: string;
  cellIds: string[];
  action: ActionId;
  resourceAmount?: number;
  color?: string;
  label?: string;
  heightOffset?: number;
  heightMode?: 'flat' | 'terraced';
}
export interface DecorationPlacement {
  id: string;
  kind: DecorationKind;
  cellId: string;
  offset: Point;
  scale: number;
  rotation: number;
}
export interface TreeColorProfile {
  id: string;
  name: string;
  foliage: [string, string, string];
}
export interface MushroomColorProfile {
  id: string;
  name: string;
  cap: [string, string, string];
}
export interface TileConfig {
  schemaVersion: 19;
  /** Preserve historical initial action recipes when importing older projects. */
  actionRecipe?: 16 | 17;
  /** Preserve V13 raster fragments and automatic output until an explicit rebuild. */
  legacyLayout?: true;
  /** Preserve V14 organic field shapes until an explicit rebuild. */
  layoutVersion?: 14;
  generatorVersion: '19.0.0';
  name: string;
  seed: string;
  editing: { regeneratePathsOnCenterChange: boolean };
  actions: { biome: BiomePresetId | null; revision: number; distribution?: ActionProbabilities };
  rules: {
    minFieldArea: number;
    requireFieldConnectivity: boolean;
    requirePathConnectivity: boolean;
    exportPolicy: 'warn' | 'block';
  };
  border: {
    enabled: boolean;
    width: number;
    mode: 'black' | 'custom' | 'fields' | 'transparent';
    color: string;
  };
  grid: {
    kind: 'hex' | 'diamond';
    divisions: number;
    subDivisions: number;
    showGrid: boolean;
    showSubgrid: boolean;
  };
  terrain: {
    noise: { seed: string; origin: Point };
    scale: number;
    octaves: number;
    persistence: number;
    lacunarity: number;
    elevation: number;
    terraces: number;
    grain: number;
    overhang: number;
    skirtDepth: number;
    texture: {
      scale: number;
      octaves: number;
      strength: number;
      detailScale: number;
      detailStrength: number;
    };
    gradient: GradientStop[];
    wallGradient: GradientStop[];
  };
  center: {
    shape: 'regular' | 'organic';
    scale: number;
    rotation: number;
    irregularity: number;
    offset: Point;
    portalWidth: number;
  };
  paths: {
    enabled: boolean;
    auto: boolean;
    /** Kept for historical JSON compatibility; current configurations require all six true. */
    enabledSides: boolean[];
    loop: boolean;
    fieldSize: number;
    /** Requested total number, including the pentagon. */
    fieldCount: number;
    heightMode: 'flat' | 'terraced';
    detail: { pebbleDensity: number; centerLight: number; edgeShade: number };
    gradient: GradientStop[];
    fields: FieldEdit[];
  };
  decoration: {
    enabled: boolean;
    density: number;
    maxPerCell: number;
    species: DecorationKind[];
    sizeProfiles: ObjectSizeProfiles;
    colorProfiles: {
      trees: { enabled: boolean; profiles: TreeColorProfile[] };
      mushrooms: { enabled: boolean; profiles: MushroomColorProfile[] };
    };
    /** Distribution to restore when a frozen seed layout is rebuilt structurally. */
    sourceDensity?: number;
    placements: DecorationPlacement[];
    modelSlots?: Partial<Record<DecorationKind, string>>;
  };
  camera: {
    mode: 'top' | 'orbit' | 'perspective';
    azimuth: number;
    elevation: number;
    fov: number;
    zoom: number;
  };
  export: { size: number; transparent: boolean };
  palette: string[];
}
export interface TileCell {
  id: string;
  /** Source raster identity for exact fragments at the center. */
  rasterId?: string;
  rasterCenter?: Point;
  center: Point;
  /** Complete clipped raster polygon. */
  polygon: Point[];
  /** Exact cell area outside the reserved pentagon, split into convex pieces. */
  surfacePolygons: Point[][];
  neighbors: string[];
  baseHeight: number;
  height: number;
  color: string;
  fieldId?: string;
  reserved: boolean;
  /** Corner guards and fixed entrance buffers cannot be claimed by ordinary path growth. */
  landscapeOnly?: boolean;
  centerPort?: number;
  /** Whole untouched raster cell at the outer end of a V14 center transition. */
  portalTargetId?: string;
  entranceSide?: number;
}
export interface GameField {
  id: string;
  cellIds: string[];
  center: Point;
  height: number;
  maxHeight: number;
  symbolHeight: number;
  color: string;
  action: ActionId;
  resourceAmount?: number;
  label: string;
  isCenter: boolean;
  /** True visible ground area; a main hexagon side has length 1. */
  area: number;
  /** Present for center; other fields consist of their cell polygons. */
  polygon?: Point[];
}
export interface CenterSide {
  index: number;
  start: Point;
  end: Point;
  portalStart: Point;
  portalEnd: Point;
  /** Ownership of the centered portal; the corner zones stay landscape. */
  fieldId: string | null;
}
export interface Entrance {
  side: number;
  cellIds: string[];
  footprintCellIds: string[];
  center: Point;
  widthCells: number;
  fieldId: string | null;
}
export interface FieldConnection {
  id: string;
  from: string;
  to: string;
  segments: { start: Point; end: Point; fromHeight: number; toHeight: number }[];
  sharedLength: number;
  heightDelta: number;
  kind: 'path' | 'center';
}
export interface PathDetail {
  id: string;
  fieldId: string;
  position: Point;
  height: number;
  scale: number;
  rotation: number;
  kind: 'pebble';
}
export interface Decoration {
  id: string;
  kind: DecorationKind;
  cellId: string;
  position: Point;
  height: number;
  scale: number;
  rotation: number;
}
export interface GeneratedTile {
  cells: TileCell[];
  fields: GameField[];
  entrances: Entrance[];
  center: { polygon: Point[]; height: number; sides: CenterSide[] };
  decorations: Decoration[];
  connections: FieldConnection[];
  pathDetails: PathDetail[];
  warnings: string[];
  stats: { cells: number; fields: number; decorations: number; connected: boolean };
}
export const ACTIONS: { id: ActionId; label: string; description: string }[] = [
  { id: 'rotate', label: 'Drehen', description: 'Gebiet drehen' },
  { id: 'shift', label: 'Verschieben', description: 'Gebiet verschieben' },
  { id: 'event', label: 'Ereignis', description: 'Ereigniskarte ziehen' },
  { id: 'shop', label: 'Laden', description: 'Handeln und einkaufen' },
  { id: 'scrap', label: 'Metallschrott', description: 'Altmetall einsammeln' },
  { id: 'jump', label: 'Zufallssprung', description: 'Zufällig das Gebiet wechseln' },
  { id: 'alb', label: 'Wandernder Alb', description: 'Begegnung mit dem Alb' },
  { id: 'amethyst', label: 'Amethyst', description: 'Wertvollste Ressource' },
  { id: 'platinum', label: 'Platin', description: 'Platinvorkommen' },
  { id: 'gem', label: 'Edelstein', description: 'Edelsteine sammeln' },
  { id: 'gold', label: 'Gold', description: 'Gold sammeln' },
  { id: 'custom', label: 'Eigene Aktion', description: 'Eigene Ereigniskarte verwenden' },
  { id: 'none', label: 'Kein Symbol', description: 'Leeres Spielfeld' },
];
/** Historical custom fields remain readable; new custom events use the question-mark card. */
export const SELECTABLE_ACTIONS = ACTIONS.filter(({ id }) => id !== 'custom');
