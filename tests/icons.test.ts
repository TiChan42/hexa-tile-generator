import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  ACTION_ICON_META,
  ACTION_ICON_SCALE,
  ACTION_ICON_SIZE,
  ACTION_PALETTES,
  ACTION_PIXELS,
  actionPixels,
  actionCanvas,
  actionIconUrl,
  actionTexture,
} from '../src/render/icons';
import { RESOURCE_AMOUNTS, RESOURCE_IDS } from '../src/core/resources';
import { ACTIONS } from '../src/core/types';
import type { ActionId } from '../src/core/types';

interface Fill {
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface FakeContext {
  fillStyle: string;
  imageSmoothingEnabled: boolean;
  fillRect: (x: number, y: number, width: number, height: number) => void;
  fills: Fill[];
}
function canvasDocument() {
  const canvases: {
    width: number;
    height: number;
    context: FakeContext;
    getContext: () => FakeContext;
    toDataURL: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const context: FakeContext = {
        fillStyle: '',
        imageSmoothingEnabled: true,
        fills: [],
        fillRect(x, y, width, height) {
          this.fills.push({ color: this.fillStyle, x, y, width, height });
        },
      };
      const canvas = {
        width: 0,
        height: 0,
        context,
        getContext: () => context,
        toDataURL: vi.fn(() => 'data:image/png;base64,deterministic-preview'),
      };
      canvases.push(canvas);
      return canvas;
    },
  });
  return canvases;
}
const actions = ACTIONS.map((action) => action.id);
const visible = actions.filter((action) => action !== 'none' && action !== 'custom');
const pixels = (action: ActionId) => ACTION_PIXELS[action].join('');
afterEach(() => vi.unstubAllGlobals());

describe('semantic pixel-art action atlas', () => {
  it('covers every action with the same fixed atlas and only valid palette codes', () => {
    expect(new Set(Object.keys(ACTION_PIXELS))).toEqual(new Set(actions));
    for (const action of actions) {
      expect(ACTION_PIXELS[action]).toHaveLength(ACTION_ICON_SIZE);
      expect(ACTION_PIXELS[action].every((row) => row.length === ACTION_ICON_SIZE)).toBe(true);
      const palette = ACTION_PALETTES[action];
      expect([...pixels(action)].every((value) => value === '0' || value in palette)).toBe(true);
      expect(Object.values(palette).every((color) => /^#[a-f\d]{6}$/i.test(color))).toBe(true);
      expect(ACTION_ICON_META[action].label.length).toBeGreaterThan(2);
      expect(ACTION_ICON_META[action].description.length).toBeGreaterThan(20);
    }
  });
  it('gives all twelve actions distinct silhouettes and enough readable pixels while none stays blank', () => {
    expect(new Set(visible.map((action) => pixels(action).replace(/[^0]/g, '1'))).size).toBe(
      visible.length,
    );
    for (const action of visible) {
      const body = [...pixels(action)].filter((value) => value !== '0');
      expect(body.length).toBeGreaterThan(70);
      expect(body.length).toBeLessThan(ACTION_ICON_SIZE ** 2 * 0.85);
      expect(pixels(action)).toContain('1');
      expect(new Set(body).size).toBeGreaterThanOrEqual(3);
    }
    expect(pixels('none')).toBe('0'.repeat(ACTION_ICON_SIZE ** 2));
  });
  it('retains recognizable shapes, separated question-mark dots and material markings', () => {
    expect(ACTION_ICON_SIZE).toBe(72);
    // Four arrows surround a central hexagon; the event dot is separated from its hook.
    expect(ACTION_PIXELS.shift[8][35]).toBe('m');
    expect(ACTION_PIXELS.shift[63][35]).toBe('m');
    expect(ACTION_PIXELS.shift[35][8]).toBe('m');
    expect(ACTION_PIXELS.shift[35][63]).toBe('m');
    expect(ACTION_PIXELS.event[48].slice(32, 37)).toBe('mmmmm');
    expect(ACTION_PIXELS.event[44].slice(32, 37)).toBe('bbbbb');
    expect(ACTION_PIXELS.scrap[25][29]).toBe('0');
    expect(ACTION_PIXELS.shop[25][18]).toBe('h');
    expect(ACTION_PIXELS.shop[25][23]).toBe('m');
    expect(ACTION_PIXELS.platinum[18].slice(24, 32)).toBe('dddddddd');
    expect(ACTION_PIXELS.alb[25][34]).toBe('d');
    expect(ACTION_PIXELS.custom).toEqual(ACTION_PIXELS.event);
  });
  it('gives all five resources nine distinct, readable quantity labels on the same atlas', () => {
    for (const resource of RESOURCE_IDS) {
      const variants = RESOURCE_AMOUNTS.map((amount) => actionPixels(resource, amount));
      expect(new Set(variants.map((rows) => rows.join(''))).size).toBe(9);
      for (const rows of variants) {
        expect(rows.slice(0, 49)).toEqual(ACTION_PIXELS[resource].slice(0, 49));
        expect(rows.slice(52, 66).join('')).toContain('h');
      }
      expect(actionPixels(resource)).toEqual(variants[0]);
    }
    expect(actionPixels('rotate', 3)).toEqual(ACTION_PIXELS.rotate);
    for (const value of [0, 10, 1.5, NaN, Infinity])
      expect(() => actionPixels('gold', value)).toThrow('1 bis 9');
  });
  it('uses different material colors for amethyst, platinum, gemstones and gold', () => {
    const rgb = (action: ActionId) =>
      ACTION_PALETTES[action].m.match(/[a-f\d]{2}/gi)!.map((part) => Number.parseInt(part, 16));
    const purple = rgb('amethyst'),
      silver = rgb('platinum'),
      cyan = rgb('gem'),
      yellow = rgb('gold');
    expect(purple[0]).toBeGreaterThan(purple[1]);
    expect(purple[2]).toBeGreaterThan(purple[1]);
    expect(Math.max(...silver) - Math.min(...silver)).toBeLessThan(45);
    expect(cyan[1]).toBeGreaterThan(cyan[0]);
    expect(cyan[2]).toBeGreaterThan(cyan[0]);
    expect(yellow[0]).toBeGreaterThan(yellow[1]);
    expect(yellow[1]).toBeGreaterThan(yellow[2]);
  });
});

describe('canvas, compatibility mode and nearest-filtered textures', () => {
  it.each(actions)(
    'renders %s on the same pixel-aligned canvas with a legible default palette',
    (action) => {
      const canvases = canvasDocument();
      const rendered = actionCanvas(action);
      const canvas = canvases[0];
      expect(rendered).toBe(canvas);
      expect(canvas.width).toBe(ACTION_ICON_SIZE * ACTION_ICON_SCALE);
      expect(canvas.height).toBe(canvas.width);
      expect(canvas.context.imageSmoothingEnabled).toBe(false);
      if (action === 'none') {
        expect(canvas.context.fills).toEqual([]);
        return;
      }
      expect(new Set(canvas.context.fills.map((fill) => fill.color)).size).toBeGreaterThanOrEqual(
        5,
      );
      expect(
        canvas.context.fills.every(
          (fill) =>
            fill.x % ACTION_ICON_SCALE === 0 &&
            fill.y % ACTION_ICON_SCALE === 0 &&
            fill.width % ACTION_ICON_SCALE === 0 &&
            fill.height % ACTION_ICON_SCALE === 0,
        ),
      ).toBe(true);
      expect(
        canvas.context.fills.every(
          (fill) =>
            fill.x >= 0 &&
            fill.y >= 0 &&
            fill.x + fill.width <= canvas.width &&
            fill.y + fill.height <= canvas.height,
        ),
      ).toBe(true);
    },
  );
  it.each(visible)(
    'keeps explicit foreground overrides monochrome and transparent for %s',
    (action) => {
      const canvases = canvasDocument();
      actionCanvas(action, '#112233');
      const fills = canvases[0].context.fills;
      expect(fills.length).toBeGreaterThan(30);
      expect(new Set(fills.map((fill) => fill.color))).toEqual(new Set(['#112233']));
      expect(
        fills.every(
          (fill) => fill.width === ACTION_ICON_SCALE && fill.height === ACTION_ICON_SCALE,
        ),
      ).toBe(true);
    },
  );
  it('exports PNG URLs and keeps semantic-color textures sharp without mipmaps', () => {
    const canvases = canvasDocument();
    expect(actionIconUrl('amethyst')).toBe('data:image/png;base64,deterministic-preview');
    expect(canvases[0].toDataURL).toHaveBeenCalledWith('image/png');
    const texture = actionTexture('gold');
    expect(texture.image).toBe(canvases[1]);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.magFilter).toBe(THREE.NearestFilter);
    expect(texture.minFilter).toBe(THREE.NearestFilter);
    expect(texture.generateMipmaps).toBe(false);
    expect(canvases[1].context.fills.some((fill) => fill.color === ACTION_PALETTES.gold.m)).toBe(
      true,
    );
    texture.dispose();
  });
  it('reports unavailable 2D rendering instead of producing an empty symbol', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    expect(() => actionCanvas('rotate')).toThrow('Pixelart');
  });
});
