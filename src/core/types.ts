import type { DecorationKind } from './objects';

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
export interface TileConfig {
  schemaVersion: 10;
  generatorVersion: '10.0.0';
  name: string;
  seed: string;
  editing: { regeneratePathsOnCenterChange: boolean };
  actions: { weights: Record<ActionId, number>; revision: number };
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
