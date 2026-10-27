import * as THREE from 'three';
import type { DecorationColorVariant } from '../core/object-colors';

const PALETTE_ATTRIBUTES = [
  'objectPaletteShadow',
  'objectPaletteMain',
  'objectPaletteLight',
] as const;

export function objectPaletteSlots(roles: readonly string[] = []): number[] {
  const foliage = roles.flatMap((role, index) => (role === 'foliage' ? [index] : []));
  return roles.map((role, index) => {
    if (role === 'foliage')
      return 1 + Math.round((foliage.indexOf(index) / Math.max(1, foliage.length - 1)) * 2);
    return ['mushroom-cap-shadow', 'mushroom-cap-main', 'mushroom-cap-light'].indexOf(role) + 1;
  });
}

/** One mesh per model: palette choices are instance attributes, never extra draw calls. */
export function setInstancePalettes(
  geometry: THREE.BufferGeometry,
  variants: readonly (DecorationColorVariant | null)[],
): void {
  const enabled = new Float32Array(variants.length);
  const colors = PALETTE_ATTRIBUTES.map(() => new Float32Array(variants.length * 3));
  const color = new THREE.Color();
  const family = geometry.userData.objectPaletteFamily as 'foliage' | 'mushroomCap' | null;
  variants.forEach((variant, index) => {
    const palette = family ? variant?.[family] : null;
    if (!palette) return;
    enabled[index] = 1;
    palette.forEach((hex, slot) => color.set(hex).toArray(colors[slot]!, index * 3));
  });
  geometry.setAttribute('objectPaletteEnabled', new THREE.InstancedBufferAttribute(enabled, 1));
  PALETTE_ATTRIBUTES.forEach((name, index) =>
    geometry.setAttribute(name, new THREE.InstancedBufferAttribute(colors[index]!, 3)),
  );
}

export function enableInstancePalettes(material: THREE.MeshStandardMaterial): void {
  const compile = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
#if defined(USE_INSTANCING) && defined(USE_COLOR)
attribute float objectPaletteSlot;
attribute float objectPaletteEnabled;
attribute vec3 objectPaletteShadow;
attribute vec3 objectPaletteMain;
attribute vec3 objectPaletteLight;
#endif`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
#if defined(USE_INSTANCING) && defined(USE_COLOR)
if(objectPaletteEnabled > 0.5 && objectPaletteSlot > 0.5) {
  vColor.xyz = objectPaletteSlot < 1.5 ? objectPaletteShadow : (objectPaletteSlot < 2.5 ? objectPaletteMain : objectPaletteLight);
}
#endif`,
      );
  };
  material.customProgramCacheKey = () => `${key}-instance-palettes-v1`;
}

/** Bake the same linear colors into portable meshes for GLB; the viewport stays instanced. */
export function bakeInstancePalette(
  mesh: THREE.InstancedMesh,
  index: number,
  cache: Map<string, THREE.BufferGeometry>,
): THREE.BufferGeometry {
  const source = mesh.geometry;
  const enabled = source.getAttribute('objectPaletteEnabled');
  if (!enabled) return source;
  const active = enabled.getX(index) > 0.5;
  const palette = PALETTE_ATTRIBUTES.map((name) => {
    const attribute = source.getAttribute(name);
    return [attribute.getX(index), attribute.getY(index), attribute.getZ(index)];
  });
  const key = JSON.stringify([source.uuid, active ? palette : null]);
  let geometry = cache.get(key);
  if (geometry) return geometry;
  geometry = source.clone();
  const slots = geometry.getAttribute('objectPaletteSlot');
  const colors = geometry.getAttribute('color');
  if (active && slots && colors)
    for (let vertex = 0; vertex < colors.count; vertex++) {
      const slot = slots.getX(vertex);
      if (slot > 0) {
        const rgb = palette[slot - 1]!;
        colors.setXYZ(vertex, rgb[0]!, rgb[1]!, rgb[2]!);
      }
    }
  for (const name of [...PALETTE_ATTRIBUTES, 'objectPaletteEnabled', 'objectPaletteSlot'])
    geometry.deleteAttribute(name);
  cache.set(key, geometry);
  return geometry;
}
