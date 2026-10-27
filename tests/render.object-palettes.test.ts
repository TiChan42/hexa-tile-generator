import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ASSET_LIBRARY, voxelGeometry } from '../src/render/voxels';
import {
  bakeInstancePalette,
  enableInstancePalettes,
  setInstancePalettes,
} from '../src/render/objectPalettes';
import { portableModel, snapshotContent } from '../src/render/modelExport';

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

  it('preserves per-instance transforms and baked colors through snapshot and portable export', () => {
    const geometry = voxelGeometry(ASSET_LIBRARY[0]!);
    const variants = [
      { id: 'red', foliage: ['#ff0000', '#aa0000', '#660000'] as [string, string, string] },
      null,
    ];
    setInstancePalettes(geometry, variants);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    const mesh = new THREE.InstancedMesh(geometry, material, 2);
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1, 2, 3));
    mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(4, 5, 6));
    const content = new THREE.Group();
    content.add(mesh);
    const snapshot = snapshotContent(content);
    const cache = new Map<string, THREE.BufferGeometry>();
    const portable = portableModel(snapshot, cache);
    const meshes: THREE.Mesh[] = [];
    portable.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    expect(meshes).toHaveLength(2);
    expect(meshes[0]!.matrix.elements.slice(12, 15)).toEqual([1, 2, 3]);
    expect(meshes[1]!.matrix.elements.slice(12, 15)).toEqual([4, 5, 6]);
    expect(meshes[0]!.geometry.getAttribute('color').array).not.toEqual(
      meshes[1]!.geometry.getAttribute('color').array,
    );
    expect(mesh.geometry.getAttribute('objectPaletteEnabled')).toBeDefined();
    cache.forEach((entry) => entry.dispose());
    geometry.dispose();
    material.dispose();
    mesh.dispose();
  });

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
