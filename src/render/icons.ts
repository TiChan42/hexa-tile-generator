import * as THREE from 'three';
import type { ActionId } from '../core/types';

export const ACTION_ICON_SIZE = 24;
export const ACTION_ICON_SCALE = 4;
const OUTLINE = '#26373f';
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
  rotate: { m: '#348f91', s: '#65c1b3', d: '#21676d', h: '#b2e2ce', b: PAPER, '1': OUTLINE },
  shift: { m: '#397db8', s: '#7cbbe2', d: '#24547f', h: '#d0ecf7', b: PAPER, '1': OUTLINE },
  event: { m: '#8150ae', s: '#b89bd1', d: '#633b8b', h: '#ffffff', b: PAPER, '1': OUTLINE },
  shop: { m: '#c75c4d', s: '#86bfcb', d: '#6c4436', h: '#fff1c5', b: '#e8cca2', '1': OUTLINE },
  scrap: { m: '#8c9aa0', s: '#c5d0cf', d: '#94674c', h: '#eef2e7', b: PAPER, '1': OUTLINE },
  jump: { m: '#8561b2', s: '#d2b8f0', d: '#d5a13e', h: '#f4e3a3', b: PAPER, '1': OUTLINE },
  alb: { m: '#525777', s: '#85849b', d: '#d26f58', h: '#f0efdb', b: '#d4d8d3', '1': OUTLINE },
  amethyst: { m: '#9654ca', s: '#c38ce5', d: '#643b91', h: '#e9c8f5', b: PAPER, '1': OUTLINE },
  platinum: { m: '#a2b2bd', s: '#cedde1', d: '#5c7384', h: '#f5faf4', b: PAPER, '1': OUTLINE },
  gem: { m: '#3fadb9', s: '#8bd2d8', d: '#286b94', h: '#d3f1ed', b: PAPER, '1': OUTLINE },
  gold: { m: '#e2ad35', s: '#f4cc5c', d: '#a66c28', h: '#fff0a6', b: PAPER, '1': OUTLINE },
  custom: { m: '#d88453', s: '#67a99a', d: '#9c513a', h: '#ffe4b1', b: PAPER, '1': OUTLINE },
  none: { m: OUTLINE, s: OUTLINE, d: OUTLINE, h: OUTLINE, b: PAPER, '1': OUTLINE },
};

export const ACTION_ICON_META: Record<ActionId, { label: string; description: string }> = {
  rotate: { label: 'Drehen', description: 'Türkiser Kreispfeil: das Gebiet drehen.' },
  shift: {
    label: 'Verschieben',
    description: 'Vier blaue Richtungspfeile: das Gebiet verschieben.',
  },
  event: { label: 'Ereignis', description: 'Helle Ereigniskarte mit violettem Fragezeichen.' },
  shop: {
    label: 'Laden',
    description: 'Ladenfront mit rot gestreifter Markise, Tür und Schaufenster.',
  },
  scrap: { label: 'Metallschrott', description: 'Graues Zahnrad und rostiges Metallstück.' },
  jump: {
    label: 'Zufallssprung',
    description: 'Violettes Portal, goldener Sprungpfeil und Würfel.',
  },
  alb: {
    label: 'Wandernder Alb',
    description: 'Dunkle Geistergestalt mit heller Maske und glühenden Augen.',
  },
  amethyst: { label: 'Amethyst', description: 'Gruppe aus drei violetten, spitzen Kristallen.' },
  platinum: { label: 'Platin', description: 'Zwei silberne Barren mit erkennbarer Pt-Markierung.' },
  gem: {
    label: 'Edelstein',
    description: 'Ein einzelner türkisblauer Diamant mit sichtbaren Facetten.',
  },
  gold: { label: 'Gold', description: 'Drei goldene Münzstapel mit hellen Oberseiten.' },
  custom: {
    label: 'Eigene Aktion',
    description: 'Orangefarbener Stern mit grünem Plus für eine eigene Aktion.',
  },
  none: { label: 'Kein Symbol', description: 'Vollständig transparente Symbolfläche.' },
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
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = Math.round(x0 + (x1 - x0) * t),
      y = Math.round(y0 + (y1 - y0) * t);
    rect(image, x - Math.floor(width / 2), y - Math.floor(width / 2), width, width, color);
  }
}
function stamp(
  image: PixelGrid,
  pattern: string[],
  x: number,
  y: number,
  color: string,
  scale = 1,
): void {
  pattern.forEach((row, py) =>
    [...row].forEach((value, px) => {
      if (value === '1') rect(image, x + px * scale, y + py * scale, scale, scale, color);
    }),
  );
}
function outlined(image: PixelGrid): string[] {
  const result = image.map((row) => [...row]);
  image.forEach((row, y) =>
    row.forEach((value, x) => {
      if (value === '0') return;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (result[y + dy]?.[x + dx] === '0') result[y + dy][x + dx] = '1';
    }),
  );
  return result.map((row) => row.join(''));
}

function glyph(action: ActionId): string[] {
  const image = grid();
  switch (action) {
    case 'rotate': {
      for (let angle = 25; angle <= 315; angle += 5) {
        const a = (angle * Math.PI) / 180,
          b = ((angle + 5) * Math.PI) / 180;
        line(
          image,
          Math.round(11 + Math.cos(a) * 7),
          Math.round(12 + Math.sin(a) * 7),
          Math.round(11 + Math.cos(b) * 7),
          Math.round(12 + Math.sin(b) * 7),
          'm',
          3,
        );
      }
      polygon(
        image,
        [
          [22, 7],
          [15, 2],
          [15, 12],
        ],
        'm',
      );
      line(image, 6, 8, 9, 6, 'h');
      break;
    }
    case 'shift': {
      rect(image, 10, 5, 4, 14, 'm');
      rect(image, 5, 10, 14, 4, 'm');
      polygon(
        image,
        [
          [12, 2],
          [9, 7],
          [15, 7],
        ],
        'm',
      );
      polygon(
        image,
        [
          [12, 22],
          [9, 17],
          [15, 17],
        ],
        'm',
      );
      polygon(
        image,
        [
          [2, 12],
          [7, 9],
          [7, 15],
        ],
        'm',
      );
      polygon(
        image,
        [
          [22, 12],
          [17, 9],
          [17, 15],
        ],
        'm',
      );
      rect(image, 11, 8, 1, 8, 'h');
      rect(image, 8, 11, 8, 1, 's');
      break;
    }
    case 'event': {
      polygon(
        image,
        [
          [5, 3],
          [18, 3],
          [20, 20],
          [6, 21],
        ],
        'b',
      );
      line(image, 7, 4, 16, 4, 'h');
      stamp(image, ['01110', '10001', '00001', '00010', '00100', '00000', '00100'], 7, 5, 'm', 2);
      break;
    }
    case 'shop': {
      rect(image, 5, 9, 14, 12, 'b');
      rect(image, 7, 14, 4, 7, 'd');
      rect(image, 13, 14, 5, 4, 's');
      polygon(
        image,
        [
          [5, 4],
          [18, 4],
          [21, 10],
          [2, 10],
        ],
        'm',
      );
      rect(image, 6, 5, 3, 5, 'h');
      rect(image, 12, 5, 3, 5, 'h');
      rect(image, 3, 10, 4, 2, 'm');
      rect(image, 7, 10, 4, 2, 'h');
      rect(image, 11, 10, 4, 2, 'm');
      rect(image, 15, 10, 5, 2, 'h');
      rect(image, 14, 14, 1, 3, 'h');
      pixel(image, 9, 17, 'h');
      break;
    }
    case 'scrap': {
      ellipse(image, 9, 10, 6, 6, 'm');
      rect(image, 7, 2, 4, 4, 'm');
      rect(image, 7, 14, 4, 4, 'm');
      rect(image, 1, 8, 4, 4, 'm');
      rect(image, 13, 8, 4, 4, 'm');
      ellipse(image, 9, 10, 2, 2, '0');
      line(image, 5, 7, 8, 5, 'h');
      polygon(
        image,
        [
          [15, 11],
          [21, 14],
          [18, 21],
          [11, 18],
        ],
        'd',
      );
      polygon(
        image,
        [
          [16, 12],
          [20, 14],
          [18, 17],
          [14, 15],
        ],
        's',
      );
      line(image, 13, 18, 17, 20, 'm');
      break;
    }
    case 'jump': {
      ellipse(image, 8, 12, 5, 8, 'm');
      ellipse(image, 8, 12, 3, 6, '0');
      line(image, 5, 9, 6, 6, 's');
      rect(image, 7, 11, 11, 4, 'd');
      polygon(
        image,
        [
          [21, 13],
          [16, 7],
          [16, 19],
        ],
        'd',
      );
      line(image, 9, 11, 15, 11, 'h');
      rect(image, 15, 3, 5, 5, 'b');
      pixel(image, 16, 4, '1');
      pixel(image, 18, 6, '1');
      break;
    }
    case 'alb': {
      ellipse(image, 12, 9, 6, 6, 'm');
      polygon(
        image,
        [
          [6, 9],
          [18, 9],
          [20, 21],
          [15, 18],
          [12, 21],
          [9, 18],
          [4, 21],
        ],
        'm',
      );
      line(image, 5, 12, 3, 16, 's', 2);
      ellipse(image, 12, 9, 4, 4, 'b');
      rect(image, 8, 8, 3, 2, '1');
      rect(image, 13, 8, 3, 2, '1');
      pixel(image, 9, 9, 'd');
      pixel(image, 14, 9, 'd');
      rect(image, 11, 11, 2, 2, '1');
      break;
    }
    case 'amethyst': {
      polygon(
        image,
        [
          [4, 8],
          [8, 5],
          [11, 19],
          [5, 20],
        ],
        'd',
      );
      polygon(
        image,
        [
          [16, 7],
          [21, 10],
          [18, 21],
          [12, 20],
        ],
        's',
      );
      polygon(
        image,
        [
          [11, 2],
          [15, 6],
          [14, 20],
          [8, 20],
          [8, 6],
        ],
        'm',
      );
      polygon(
        image,
        [
          [11, 3],
          [11, 18],
          [9, 18],
          [9, 6],
        ],
        'h',
      );
      line(image, 17, 10, 15, 18, 'h');
      line(image, 5, 9, 7, 17, 's');
      break;
    }
    case 'platinum': {
      polygon(
        image,
        [
          [5, 12],
          [18, 12],
          [21, 17],
          [18, 21],
          [3, 21],
          [2, 17],
        ],
        'd',
      );
      polygon(
        image,
        [
          [5, 12],
          [18, 12],
          [21, 17],
          [2, 17],
        ],
        'm',
      );
      line(image, 4, 16, 18, 16, 's');
      polygon(
        image,
        [
          [5, 4],
          [17, 4],
          [20, 8],
          [17, 13],
          [3, 13],
          [2, 8],
        ],
        'm',
      );
      polygon(
        image,
        [
          [5, 4],
          [17, 4],
          [20, 8],
          [2, 8],
        ],
        's',
      );
      line(image, 5, 5, 16, 5, 'h');
      stamp(image, ['110', '101', '110', '100', '100'], 6, 7, 'd');
      stamp(image, ['010', '111', '010', '010', '011'], 11, 7, 'd');
      break;
    }
    case 'gem': {
      polygon(
        image,
        [
          [7, 3],
          [16, 3],
          [22, 9],
          [12, 22],
          [1, 9],
        ],
        'm',
      );
      polygon(
        image,
        [
          [7, 3],
          [16, 3],
          [22, 9],
          [1, 9],
        ],
        's',
      );
      polygon(
        image,
        [
          [7, 3],
          [12, 9],
          [16, 3],
        ],
        'h',
      );
      polygon(
        image,
        [
          [12, 10],
          [21, 9],
          [12, 21],
        ],
        'd',
      );
      line(image, 3, 9, 20, 9, '1');
      line(image, 7, 4, 12, 19, 'h');
      break;
    }
    case 'gold': {
      ellipse(image, 12, 18, 9, 3, 'd');
      rect(image, 3, 14, 19, 4, 'm');
      ellipse(image, 12, 14, 9, 3, 'd');
      ellipse(image, 12, 14, 8, 2, 's');
      line(image, 5, 17, 19, 17, 'd');
      line(image, 6, 13, 18, 13, 'h');
      rect(image, 3, 9, 11, 5, 'd');
      ellipse(image, 8, 13, 5, 2, 'm');
      ellipse(image, 8, 9, 5, 2, 'd');
      ellipse(image, 8, 9, 4, 1, 's');
      line(image, 5, 8, 10, 8, 'h');
      rect(image, 13, 7, 8, 6, 'd');
      ellipse(image, 17, 12, 4, 2, 'm');
      ellipse(image, 17, 7, 4, 2, 'd');
      ellipse(image, 17, 7, 3, 1, 's');
      line(image, 15, 6, 18, 6, 'h');
      break;
    }
    case 'custom': {
      const points: [number, number][] = Array.from({ length: 10 }, (_, i) => {
        const radius = i % 2 === 0 ? 9 : 4;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        return [11 + Math.cos(angle) * radius, 11 + Math.sin(angle) * radius];
      });
      polygon(image, points, 'm');
      line(image, 10, 6, 8, 12, 'h');
      rect(image, 16, 15, 4, 7, 's');
      rect(image, 14, 17, 8, 3, 's');
      break;
    }
    case 'none':
      return image.map((row) => row.join(''));
  }
  return outlined(image);
}

/** Glyph pixels only; 0 is transparent, remaining codes address each semantic palette. */
export const ACTION_PIXELS: Record<ActionId, string[]> = Object.fromEntries(
  (Object.keys(ACTION_PALETTES) as ActionId[]).map((action) => [action, glyph(action)]),
) as Record<ActionId, string[]>;
const MONO_INK: Partial<Record<ActionId, string>> = {
  event: '1m',
  shop: '1mds',
  platinum: '1d',
  gold: '1d',
  alb: '1mds',
};

function badge(context: CanvasRenderingContext2D): void {
  const scale = ACTION_ICON_SCALE;
  context.fillStyle = '#24363f';
  context.fillRect(2 * scale, 2 * scale, 20 * scale, 21 * scale);
  context.fillRect(scale, 4 * scale, 22 * scale, 17 * scale);
  context.fillStyle = '#f7efd7';
  context.fillRect(3 * scale, 2 * scale, 18 * scale, 20 * scale);
  context.fillRect(2 * scale, 4 * scale, 20 * scale, 16 * scale);
  context.fillStyle = '#fff9e9';
  context.fillRect(4 * scale, 2 * scale, 16 * scale, scale);
}

/** Default is semantic color; an explicit foreground requests a transparent monochrome glyph. */
export function actionCanvas(action: ActionId, foreground?: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ACTION_ICON_SIZE * ACTION_ICON_SCALE;
  canvas.height = ACTION_ICON_SIZE * ACTION_ICON_SCALE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Die Pixelart konnte nicht erstellt werden.');
  context.imageSmoothingEnabled = false;
  if (action === 'none') return canvas;
  if (foreground === undefined) badge(context);
  const ink = MONO_INK[action] ?? '1msdh';
  ACTION_PIXELS[action].forEach((row, y) =>
    [...row].forEach((value, x) => {
      if (value === '0' || (foreground !== undefined && !ink.includes(value))) return;
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

export function actionIconUrl(action: ActionId, foreground?: string): string {
  return actionCanvas(action, foreground).toDataURL('image/png');
}
export function actionTexture(action: ActionId): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(actionCanvas(action));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}
