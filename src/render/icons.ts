import * as THREE from 'three';
import { isResource } from '../core/resources';
import type { ActionId } from '../core/types';

export const ACTION_ICON_SIZE = 72;
export const ACTION_ICON_SCALE = 4;
const OUTLINE = '#172c3b';
const PAPER = '#fff6dd';
type PixelGrid = string[][];
interface IconPalette {
  m: string;
  s: string;
  d: string;
  h: string;
  b: string;
  '1': string;
}
export const ACTION_PALETTES: Record<ActionId, IconPalette> = {
  rotate: { m: '#198c88', s: '#64c9b3', d: '#126461', h: '#c3f5df', b: PAPER, '1': OUTLINE },
  shift: { m: '#287dcc', s: '#83c8fa', d: '#174c8a', h: '#d6f3ff', b: PAPER, '1': OUTLINE },
  event: { m: '#7734b3', s: '#c6a0e4', d: '#512477', h: '#ffffff', b: PAPER, '1': OUTLINE },
  shop: { m: '#ca493e', s: '#75bdce', d: '#744532', h: '#fff1c5', b: '#ead0a5', '1': OUTLINE },
  scrap: { m: '#8799a3', s: '#c9d9de', d: '#a36540', h: '#f2f8f9', b: PAPER, '1': OUTLINE },
  jump: { m: '#8744c6', s: '#ce9cfa', d: '#df9d22', h: '#fff1ae', b: PAPER, '1': OUTLINE },
  alb: { m: '#424968', s: '#858caa', d: '#ed654c', h: '#ffffff', b: '#e0e6ed', '1': OUTLINE },
  amethyst: { m: '#9645ca', s: '#ca81ec', d: '#582483', h: '#f6cfff', b: PAPER, '1': OUTLINE },
  platinum: { m: '#a6b8c6', s: '#d6e8ef', d: '#526f87', h: '#ffffff', b: PAPER, '1': OUTLINE },
  gem: { m: '#19aaba', s: '#77e0e6', d: '#18578b', h: '#ddffff', b: PAPER, '1': OUTLINE },
  gold: { m: '#e7ae27', s: '#ffdb66', d: '#a36413', h: '#fff5bb', b: PAPER, '1': OUTLINE },
  custom: { m: '#7734b3', s: '#c6a0e4', d: '#512477', h: '#ffffff', b: PAPER, '1': OUTLINE },
  none: { m: OUTLINE, s: OUTLINE, d: OUTLINE, h: OUTLINE, b: PAPER, '1': OUTLINE },
};
export const ACTION_ICON_META: Record<ActionId, { label: string; description: string }> = {
  rotate: { label: 'Drehen', description: 'Großer Kreispfeil um ein Sechseck: Gebiet drehen.' },
  shift: {
    label: 'Verschieben',
    description: 'Vier breite Richtungspfeile um ein Sechseck: Gebiet verschieben.',
  },
  event: { label: 'Ereignis', description: 'Ereigniskarte mit großem violettem Fragezeichen.' },
  shop: { label: 'Laden', description: 'Laden mit roter Streifenmarkise und großem L-Schild.' },
  scrap: {
    label: 'Metallschrott',
    description: 'Stahlgraues Zahnrad mit rostiger Schraube; Mengenangabe unten.',
  },
  jump: {
    label: 'Zufallssprung',
    description: 'Zwei violette Portale, Sprungpfeil und weißer Zufallswürfel.',
  },
  alb: {
    label: 'Wandernder Alb',
    description: 'Dunkler wandernder Geist mit heller Maske und roten Augen.',
  },
  amethyst: {
    label: 'Amethyst',
    description: 'Violette spitze Kristallgruppe; Mengenangabe unten.',
  },
  platinum: {
    label: 'Platin',
    description: 'Silberner Barren mit großer Pt-Prägung; Mengenangabe unten.',
  },
  gem: {
    label: 'Edelstein',
    description: 'Breiter türkisblauer Diamant mit klaren Facetten; Mengenangabe unten.',
  },
  gold: {
    label: 'Gold',
    description: 'Goldene Münzen mit geprägtem G; Mengenangabe unten. Separate Ressource.',
  },
  custom: {
    label: 'Ereignis',
    description: 'Historische eigene Aktion, dargestellt als Ereigniskarte mit Fragezeichen.',
  },
  none: { label: 'Kein Symbol', description: 'Vollständig transparente Symbolfläche ohne Aktion.' },
};

const FONT: Record<string, string[]> = {
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  x: ['00000', '00000', '10001', '01010', '00100', '01010', '10001'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  t: ['00100', '00100', '11111', '00100', '00100', '00101', '00010'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
};
function grid(): PixelGrid {
  return Array.from({ length: ACTION_ICON_SIZE }, () => Array<string>(ACTION_ICON_SIZE).fill('0'));
}
function pixel(image: PixelGrid, x: number, y: number, color: string): void {
  if (x >= 0 && x < ACTION_ICON_SIZE && y >= 0 && y < ACTION_ICON_SIZE) image[y][x] = color;
}
function rect(
  image: PixelGrid,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  for (let py = y; py < y + height; py++)
    for (let px = x; px < x + width; px++) pixel(image, px, py, color);
}
function ellipse(
  image: PixelGrid,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) pixel(image, x, y, color);
}
function polygon(image: PixelGrid, points: [number, number][], color: string): void {
  for (let y = 0; y < ACTION_ICON_SIZE; y++)
    for (let x = 0; x < ACTION_ICON_SIZE; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [ax, ay] = points[i],
          [bx, by] = points[j];
        if (
          ay > y + 0.5 !== by > y + 0.5 &&
          x + 0.5 < ((bx - ax) * (y + 0.5 - ay)) / (by - ay) + ax
        )
          inside = !inside;
      }
      if (inside) pixel(image, x, y, color);
    }
}
function line(
  image: PixelGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  width = 1,
): void {
  const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    rect(
      image,
      Math.round(x0 + (x1 - x0) * t) - Math.floor(width / 2),
      Math.round(y0 + (y1 - y0) * t) - Math.floor(width / 2),
      width,
      width,
      color,
    );
  }
}
function text(
  image: PixelGrid,
  value: string,
  x: number,
  y: number,
  color: string,
  scale = 2,
): void {
  [...value].forEach((letter, i) =>
    FONT[letter]!.forEach((row, py) =>
      [...row].forEach((bit, px) => {
        if (bit === '1') rect(image, x + (i * 6 + px) * scale, y + py * scale, scale, scale, color);
      }),
    ),
  );
}
function outlined(image: PixelGrid): string[] {
  const result = image.map((row) => [...row]);
  image.forEach((row, y) =>
    row.forEach((value, x) => {
      if (value === '0') return;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if (dx * dx + dy * dy <= 5 && result[y + dy]?.[x + dx] === '0')
            result[y + dy][x + dx] = '1';
    }),
  );
  return result.map((row) => row.join(''));
}
function hexagon(image: PixelGrid, cx: number, cy: number, radius: number, color: string): void {
  polygon(
    image,
    Array.from(
      { length: 6 },
      (_, i) =>
        [cx + radius * Math.cos((i * Math.PI) / 3), cy + radius * Math.sin((i * Math.PI) / 3)] as [
          number,
          number,
        ],
    ),
    color,
  );
}
function glyph(action: ActionId): string[] {
  const image = grid();
  switch (action) {
    case 'rotate': {
      for (let a = 40; a <= 312; a += 2) {
        const radians = (a * Math.PI) / 180;
        ellipse(
          image,
          Math.round(35 + Math.cos(radians) * 23),
          Math.round(36 + Math.sin(radians) * 23),
          4,
          4,
          'm',
        );
      }
      polygon(
        image,
        [
          [49, 8],
          [66, 26],
          [43, 29],
        ],
        'm',
      );
      line(image, 17, 25, 23, 18, 'h', 2);
      hexagon(image, 35, 36, 9, 'd');
      hexagon(image, 35, 35, 6, 's');
      break;
    }
    case 'shift': {
      rect(image, 32, 15, 8, 42, 'm');
      rect(image, 15, 32, 42, 8, 'm');
      polygon(
        image,
        [
          [36, 5],
          [24, 20],
          [48, 20],
        ],
        'm',
      );
      polygon(
        image,
        [
          [36, 67],
          [24, 52],
          [48, 52],
        ],
        'm',
      );
      polygon(
        image,
        [
          [5, 36],
          [20, 24],
          [20, 48],
        ],
        'm',
      );
      polygon(
        image,
        [
          [67, 36],
          [52, 24],
          [52, 48],
        ],
        'm',
      );
      line(image, 35, 17, 35, 54, 'h', 2);
      line(image, 17, 35, 54, 35, 's', 2);
      hexagon(image, 36, 36, 10, 'd');
      hexagon(image, 36, 35, 6, 'h');
      break;
    }
    case 'event':
    case 'custom': {
      polygon(
        image,
        [
          [15, 7],
          [56, 7],
          [61, 62],
          [13, 65],
        ],
        'd',
      );
      polygon(
        image,
        [
          [17, 8],
          [54, 8],
          [57, 60],
          [15, 62],
        ],
        'b',
      );
      line(image, 20, 12, 50, 12, 'h', 2);
      text(image, '?', 22, 18, 'm', 5);
      break;
    }
    case 'shop': {
      rect(image, 13, 27, 46, 35, 'b');
      rect(image, 19, 40, 14, 22, 'd');
      rect(image, 40, 40, 13, 15, 's');
      line(image, 43, 42, 43, 50, 'h', 2);
      rect(image, 27, 51, 2, 3, 'h');
      polygon(
        image,
        [
          [15, 20],
          [57, 20],
          [65, 34],
          [7, 34],
        ],
        'm',
      );
      for (let x = 16; x < 57; x += 12) rect(image, x, 23, 6, 14, 'h');
      rect(image, 26, 5, 22, 17, 'm');
      text(image, 'L', 32, 6, 'h', 2);
      break;
    }
    case 'scrap': {
      ellipse(image, 29, 25, 16, 16, 'm');
      for (let a = 0; a < 360; a += 45) {
        const r = (a * Math.PI) / 180;
        rect(
          image,
          Math.round(29 + Math.cos(r) * 17) - 4,
          Math.round(25 + Math.sin(r) * 17) - 4,
          8,
          8,
          'm',
        );
      }
      ellipse(image, 29, 25, 9, 9, 's');
      ellipse(image, 29, 25, 5, 5, '0');
      line(image, 18, 17, 22, 13, 'h', 2);
      polygon(
        image,
        [
          [45, 18],
          [57, 25],
          [51, 36],
          [39, 29],
        ],
        'd',
      );
      line(image, 45, 30, 36, 43, 'd', 7);
      line(image, 42, 35, 47, 39, 's', 2);
      line(image, 39, 39, 44, 43, 's', 2);
      break;
    }
    case 'jump': {
      ellipse(image, 17, 45, 9, 17, 'm');
      ellipse(image, 17, 45, 4, 12, '0');
      ellipse(image, 53, 24, 10, 17, 'm');
      ellipse(image, 53, 24, 5, 12, '0');
      line(image, 12, 34, 13, 31, 's', 2);
      line(image, 46, 14, 48, 11, 's', 2);
      line(image, 17, 45, 46, 26, 'd', 6);
      polygon(
        image,
        [
          [53, 21],
          [37, 23],
          [47, 37],
        ],
        'd',
      );
      rect(image, 42, 49, 19, 17, 'b');
      rect(image, 45, 52, 3, 3, '1');
      rect(image, 50, 56, 3, 3, '1');
      rect(image, 55, 60, 3, 3, '1');
      break;
    }
    case 'alb': {
      ellipse(image, 39, 25, 17, 18, 'm');
      polygon(
        image,
        [
          [23, 25],
          [55, 25],
          [61, 61],
          [48, 56],
          [39, 65],
          [30, 56],
          [19, 61],
        ],
        'm',
      );
      line(image, 20, 31, 10, 38, 's', 4);
      line(image, 16, 47, 7, 47, 's', 3);
      ellipse(image, 39, 25, 11, 12, 'b');
      rect(image, 30, 22, 7, 6, '1');
      rect(image, 42, 22, 7, 6, '1');
      rect(image, 33, 24, 3, 3, 'd');
      rect(image, 43, 24, 3, 3, 'd');
      rect(image, 37, 31, 4, 5, '1');
      break;
    }
    case 'amethyst': {
      polygon(
        image,
        [
          [11, 20],
          [21, 12],
          [29, 40],
          [17, 44],
        ],
        'd',
      );
      polygon(
        image,
        [
          [46, 14],
          [59, 22],
          [51, 44],
          [35, 43],
        ],
        's',
      );
      polygon(
        image,
        [
          [34, 5],
          [44, 15],
          [41, 44],
          [26, 44],
          [25, 15],
        ],
        'm',
      );
      polygon(
        image,
        [
          [34, 7],
          [34, 40],
          [28, 40],
          [28, 16],
        ],
        'h',
      );
      line(image, 48, 22, 42, 39, 'h', 2);
      line(image, 16, 22, 21, 37, 's', 2);
      break;
    }
    case 'platinum': {
      polygon(
        image,
        [
          [16, 12],
          [54, 12],
          [63, 31],
          [57, 44],
          [12, 44],
          [8, 31],
        ],
        'd',
      );
      polygon(
        image,
        [
          [16, 12],
          [54, 12],
          [63, 31],
          [8, 31],
        ],
        's',
      );
      polygon(
        image,
        [
          [8, 31],
          [63, 31],
          [57, 40],
          [12, 40],
        ],
        'm',
      );
      line(image, 18, 15, 51, 15, 'h', 2);
      text(image, 'Pt', 24, 18, 'd', 2);
      break;
    }
    case 'gem': {
      polygon(
        image,
        [
          [21, 8],
          [49, 8],
          [63, 22],
          [36, 46],
          [8, 22],
        ],
        'm',
      );
      polygon(
        image,
        [
          [21, 8],
          [49, 8],
          [63, 22],
          [8, 22],
        ],
        's',
      );
      polygon(
        image,
        [
          [21, 8],
          [36, 22],
          [49, 8],
        ],
        'h',
      );
      polygon(
        image,
        [
          [36, 24],
          [62, 22],
          [36, 45],
        ],
        'd',
      );
      line(image, 10, 22, 60, 22, '1', 2);
      line(image, 21, 10, 35, 42, 'h', 2);
      break;
    }
    case 'gold': {
      rect(image, 12, 29, 34, 12, 'd');
      ellipse(image, 29, 40, 17, 5, 'd');
      ellipse(image, 29, 29, 17, 6, 'm');
      ellipse(image, 29, 28, 14, 3, 's');
      line(image, 15, 36, 40, 36, 's', 2);
      ellipse(image, 47, 24, 15, 19, 'd');
      ellipse(image, 46, 23, 13, 17, 'm');
      ellipse(image, 46, 22, 10, 14, 's');
      text(image, 'G', 41, 15, 'd', 2);
      line(image, 38, 12, 41, 9, 'h', 2);
      break;
    }
    case 'none':
      return image.map((row) => row.join(''));
  }
  return outlined(image);
}

/** Native 72-pixel drawings, not enlarged copies of the old 24-pixel atlas. */
export const ACTION_PIXELS: Record<ActionId, string[]> = Object.fromEntries(
  (Object.keys(ACTION_PALETTES) as ActionId[]).map((action) => [action, glyph(action)]),
) as Record<ActionId, string[]>;
const MONO_INK: Partial<Record<ActionId, string>> = {
  event: '1m',
  custom: '1m',
  shop: '1mds',
  platinum: '1d',
  gold: '1d',
  alb: '1mds',
};
export function actionPixels(action: ActionId, resourceAmount = 1): string[] {
  if (!isResource(action)) return ACTION_PIXELS[action];
  if (!Number.isInteger(resourceAmount) || resourceAmount < 1 || resourceAmount > 9)
    throw new Error('Ressourcenmenge muss eine ganze Zahl von 1 bis 9 sein.');
  const image = ACTION_PIXELS[action].map((row) => [...row]);
  rect(image, 18, 49, 36, 21, '1');
  rect(image, 20, 51, 32, 17, 'd');
  text(image, `x${resourceAmount}`, 25, 52, 'h', 2);
  return image.map((row) => row.join(''));
}
function badge(context: CanvasRenderingContext2D): void {
  const s = ACTION_ICON_SCALE;
  context.fillStyle = '#172c3b';
  context.fillRect(6 * s, 2 * s, 60 * s, 68 * s);
  context.fillRect(2 * s, 8 * s, 68 * s, 56 * s);
  context.fillStyle = '#fff6dd';
  context.fillRect(7 * s, 4 * s, 58 * s, 64 * s);
  context.fillRect(4 * s, 9 * s, 64 * s, 54 * s);
  context.fillStyle = '#ffffff';
  context.fillRect(10 * s, 4 * s, 52 * s, 2 * s);
}
/** The optional foreground preserves the transparent monochrome API. */
export function actionCanvas(
  action: ActionId,
  foreground?: string,
  resourceAmount = 1,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ACTION_ICON_SIZE * ACTION_ICON_SCALE;
  canvas.height = ACTION_ICON_SIZE * ACTION_ICON_SCALE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Die Pixelart konnte nicht erstellt werden.');
  context.imageSmoothingEnabled = false;
  if (action === 'none') return canvas;
  if (foreground === undefined) badge(context);
  const ink = MONO_INK[action] ?? '1msdh';
  actionPixels(action, resourceAmount).forEach((row, y) =>
    [...row].forEach((value, x) => {
      if (value === '0') return;
      // On monochrome resource labels, keep white digits and omit their solid backing.
      const label = isResource(action) && y >= 49;
      if (foreground !== undefined && (label ? value !== 'h' : !ink.includes(value))) return;
      context.fillStyle = foreground ?? ACTION_PALETTES[action][value as keyof IconPalette];
      context.fillRect(
        x * ACTION_ICON_SCALE,
        y * ACTION_ICON_SCALE,
        ACTION_ICON_SCALE,
        ACTION_ICON_SCALE,
      );
    }),
  );
  return canvas;
}
export function actionIconUrl(action: ActionId, foreground?: string, resourceAmount = 1): string {
  return actionCanvas(action, foreground, resourceAmount).toDataURL('image/png');
}
export function actionTexture(action: ActionId, resourceAmount = 1): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(actionCanvas(action, undefined, resourceAmount));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}
