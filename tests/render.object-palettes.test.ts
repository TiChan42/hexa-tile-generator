import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ASSET_LIBRARY, voxelGeometry } from '../src/render/voxels';
import {
  bakeInstancePalette,
  enableInstancePalettes,
  setInstancePalettes,
} from '../src/render/objectPalettes';

describe('instanced object palettes and portable colors', () => {
  it.each(['tree', 'pine', 'oak', 'birch', 'willow', 'maple', 'mushrooms', 'rock'])(
    '%s shares its mesh while exported colors match the original per-variant geometry exactly',
    (id) => {
      const model = ASSET_LIBRARY.find((asset) => asset.id === id)!;
      const variants = [
        {
          id: 'warm',
          foliage: ['#123456', '#789abc', '#ef1212'] as [string, string, string],
          mushroomCap: ['#223344', '#abcdef', '#dd2233'] as [string, string, string],
        },
        {
          id: 'cold',
          foliage: ['#111111', '#222222', '#333333'] as [string, string, string],
          mushroomCap: ['#ff0000', '#00ff00', '#0000ff'] as [string, string, string],
        },
        null,
      ];
      const geometry = voxelGeometry(model);
      const original = geometry.getAttribute('color').array.slice();
      setInstancePalettes(geometry, variants);
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshStandardMaterial({ vertexColors: true }),
        3,
      );
      const cache = new Map<string, THREE.BufferGeometry>();
      variants.forEach((variant, index) => {
        const expected = voxelGeometry(model, variant);
        const baked = bakeInstancePalette(mesh, index, cache);
        expect(baked.getAttribute('position').array).toEqual(
          expected.getAttribute('position').array,
        );
        expect(baked.getAttribute('color').array).toEqual(expected.getAttribute('color').array);
        expect(baked.getAttribute('objectPaletteEnabled')).toBeUndefined();
        expect(bakeInstancePalette(mesh, index, cache)).toBe(baked);
        expected.dispose();
      });
      expect(geometry.getAttribute('color').array).toEqual(original);
      expect(cache.size).toBe(id === 'rock' ? 1 : 3);
      cache.forEach((entry) => entry.dispose());
      geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    },
  );

  it('adds the palette shader without replacing earlier material hooks or their cache keys', () => {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    material.customProgramCacheKey = () => 'original';
    material.onBeforeCompile = (shader) => {
      shader.vertexShader += '\n// original hook';
    };
    enableInstancePalettes(material);
    const shader = { vertexShader: '#include <common>\n#include <color_vertex>' } as Parameters<
      typeof material.onBeforeCompile
    >[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('// original hook');
    expect(shader.vertexShader).toContain('objectPaletteEnabled > 0.5');
    expect(shader.vertexShader).toContain('vColor.xyz =');
    expect(material.customProgramCacheKey()).toBe('original-instance-palettes-v1');
    material.dispose();
  });
});
