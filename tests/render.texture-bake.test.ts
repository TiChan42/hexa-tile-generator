import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { defaultConfig } from '../src/core/config';
import {
  createMaterialBakeShader,
  createTileMaterial,
  updateTileMaterial,
} from '../src/render/material';
import { packAtlasSquares } from '../src/render/textureBake';

describe('export texture atlases', () => {
  it('packs deterministically without overlap, including full-size faces and multiple pages', () => {
    const sizes = [16, 70, 30, 128, ...Array<number>(80).fill(12)];
    const layout = packAtlasSquares(sizes, 128);
    expect(packAtlasSquares(sizes, 128)).toEqual(layout);
    expect(layout[3]).toEqual({ size: 128, page: 0, x: 0, y: 0 });
    expect(new Set(layout.map((square) => square.page)).size).toBeGreaterThan(1);
    layout.forEach((square, index) => {
      expect(square.size).toBe(sizes[index]);
      expect(square.x + square.size).toBeLessThanOrEqual(128);
      expect(square.y + square.size).toBeLessThanOrEqual(128);
      expect(square.x).toBeGreaterThanOrEqual(0);
      expect(square.y).toBeGreaterThanOrEqual(0);
      layout.slice(index + 1).forEach((other) => {
        if (square.page !== other.page) return;
        expect(
          square.x + square.size <= other.x ||
            other.x + other.size <= square.x ||
            square.y + square.size <= other.y ||
            other.y + other.size <= square.y,
        ).toBe(true);
      });
    });
    expect(packAtlasSquares([], 128)).toEqual([]);
    for (const size of [0, -1, 1.5, 129])
      expect(() => packAtlasSquares([size], 128)).toThrow(/Texturatlas/);
  });

  it('bakes the same shader inputs with frozen uniforms and no illumination', () => {
    const config = defaultConfig;
    const material = createTileMaterial(
      { vertexColors: true },
      config.terrain.texture,
      0.07,
      'bake',
      config.paths.detail,
      { x: 1.5, y: 0.4 },
    );
    const matrix = new THREE.Matrix4().makeTranslation(3, 0, 1);
    const bake = createMaterialBakeShader(material, matrix)!;
    expect(bake.uniforms.tileGrain!.value).toBe(0.07);
    expect(bake.uniforms.tileNoiseOrigin!.value).toEqual(new THREE.Vector2(1.5, 0.4));
    expect(bake.uniforms.tileBakeTransform!.value).toEqual(matrix);
    updateTileMaterial(material, config.terrain.texture, 0.01, 'changed', config.paths.detail, {
      x: 0,
      y: 0,
    });
    expect(bake.uniforms.tileGrain!.value).toBe(0.07);
    expect(bake.uniforms.tileNoiseOrigin!.value).toEqual(new THREE.Vector2(1.5, 0.4));
    expect(bake.fragmentShader).toContain('tileBroad=tileFbm');
    expect(bake.fragmentShader).toContain('tilePathCenterLight*tileCenter');
    expect(bake.fragmentShader).toContain('sRGBTransferOETF');
    expect(bake.lights).toBe(false);
    expect(bake.toneMapped).toBe(false);
    expect(createMaterialBakeShader(new THREE.MeshBasicMaterial(), matrix)).toBeNull();
    expect(createMaterialBakeShader(new THREE.MeshStandardMaterial(), matrix)).toBeNull();
    bake.dispose();
    material.dispose();
  });
});
