import { describe, expect, it } from 'vitest';
import {
  builtinObjectPreviewUrl,
  voxelPreviewSvg,
  voxelPreviewUrl,
} from '../src/render/objectPreview';
import type { VoxelModel } from '../src/render/voxels';

const cube: VoxelModel = {
  id: 'cube',
  name: 'One cube',
  size: [1, 1, 1],
  palette: ['#808080'],
  voxels: [[0, 0, 0, 0]],
};
const polygons = (svg: string) => (svg.match(/<polygon /g) ?? []).length;

describe('code-native isometric voxel thumbnails', () => {
  it('projects three visible cube faces with distinct directional lighting', () => {
    const svg = voxelPreviewSvg(cube);
    expect(polygons(svg)).toBe(3);
    expect(svg).toContain('fill="#8a8a8a"');
    expect(svg).toContain('fill="#6d6d6d"');
    expect(svg).toContain('fill="#535353"');
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });
  it('culls shared internal faces and remains deterministic across source-voxel order', () => {
    const model: VoxelModel = {
      ...cube,
      size: [2, 1, 2],
      voxels: [
        [0, 0, 0, 0],
        [1, 0, 0, 0],
        [0, 0, 1, 0],
      ],
    };
    const svg = voxelPreviewSvg(model);
    expect(polygons(svg)).toBe(7);
    expect(voxelPreviewSvg({ ...model, voxels: [...model.voxels].reverse() })).toBe(svg);
  });
  it('fits occupied geometry even when declared dimensions are much larger', () => {
    const svg = voxelPreviewSvg({
      ...cube,
      size: [1024, 1024, 1024],
      voxels: [[101, 200, 150, 0]],
    });
    const viewBox = svg
      .match(/viewBox="([^"]+)"/)![1]!
      .split(' ')
      .map(Number);
    expect(viewBox.every(Number.isFinite)).toBe(true);
    expect(viewBox[2]).toBeLessThan(5);
    expect(viewBox[3]).toBeLessThan(5);
  });
  it('escapes names, validates palette colors and handles an empty model without invalid geometry', () => {
    const svg = voxelPreviewSvg({
      ...cube,
      name: '<script>&"',
      palette: ['red" onload="alert(1)'],
    });
    expect(svg).toContain('&lt;script&gt;&amp;&quot;');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('onload=');
    expect(voxelPreviewSvg({ ...cube, voxels: [] })).not.toMatch(/NaN|Infinity|undefined/);
  });
  it('handles the full API limit of16,384 isolated voxels without exceeding engine argument limits', () => {
    const model: VoxelModel = {
      ...cube,
      size: [64, 64, 64],
      voxels: Array.from({ length: 16_384 }, (_, index) => [
        (index % 32) * 2,
        (Math.floor(index / 32) % 32) * 2,
        Math.floor(index / 1024) * 2,
        0,
      ]),
    };
    let svg = '';
    expect(() => {
      svg = voxelPreviewSvg(model);
    }).not.toThrow();
    expect(polygons(svg)).toBe(49_152);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
    expect(
      svg
        .match(/viewBox="([^"]+)"/)![1]!
        .split(' ')
        .map(Number)
        .every(Number.isFinite),
    ).toBe(true);
  });
  it('provides decodable cached image URLs without a canvas or WebGL context', () => {
    const url = voxelPreviewUrl(cube);
    expect(url).toMatch(/^data:image\/svg\+xml;charset=UTF-8,/);
    expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toBe(voxelPreviewSvg(cube));
    expect(voxelPreviewUrl(cube)).toBe(url);
    expect(builtinObjectPreviewUrl('tree')).toMatch(/^data:image\/svg\+xml/);
  });
});
