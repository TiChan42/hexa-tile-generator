import * as THREE from 'three';
import { hash32 } from '../core/random';

export interface MaterialTextureSettings {
  scale: number;
  octaves: number;
  strength: number;
  detailScale: number;
  detailStrength: number;
}
export interface MaterialPoint {
  x: number;
  y: number;
  z: number;
}
export interface MaterialSample {
  broad: number;
  detail: number;
  grain: number;
  multiplier: number;
}

/** CPU reference for the same uint hash used by the WebGL2 material shader. */
export function materialLatticeHash(seed: number, x: number, y: number, z: number): number {
  let h =
    (seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
function gradient(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return (((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)) * 0.7071067811865476;
}

/** Genuine 3D gradient Perlin: corner gradients dotted with local offsets, quintic fade. */
export function materialPerlin(seed: number, point: MaterialPoint): number {
  const ix = Math.floor(point.x),
    iy = Math.floor(point.y),
    iz = Math.floor(point.z);
  const x = point.x - ix,
    y = point.y - iy,
    z = point.z - iz;
  const u = fade(x),
    v = fade(y),
    w = fade(z);
  const g = (dx: number, dy: number, dz: number): number =>
    gradient(materialLatticeHash(seed, ix + dx, iy + dy, iz + dz), x - dx, y - dy, z - dz);
  return mix(
    mix(mix(g(0, 0, 0), g(1, 0, 0), u), mix(g(0, 1, 0), g(1, 1, 0), u), v),
    mix(mix(g(0, 0, 1), g(1, 0, 1), u), mix(g(0, 1, 1), g(1, 1, 1), u), v),
    w,
  );
}

export function materialFbm(seed: number, point: MaterialPoint, octaves: number): number {
  let amplitude = 1,
    total = 0,
    sum = 0;
  let p = { ...point };
  for (let i = 0; i < octaves; i++) {
    sum += materialPerlin((seed + Math.imul(i, 0x9e3779b9)) >>> 0, p) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    p = { x: p.x * 2.03, y: p.y * 2.03, z: p.z * 2.03 };
  }
  return Math.max(-1, Math.min(1, (sum / total) * 1.6));
}

function seeds(seed: string): { broad: number; detail: number; grain: number } {
  return {
    broad: hash32(`${seed}:material:broad`),
    detail: hash32(`${seed}:material:detail`),
    grain: hash32(`${seed}:material:grain`),
  };
}
function scaled(point: MaterialPoint, frequency: number): MaterialPoint {
  return {
    x: point.x * frequency + 13.37,
    y: point.y * frequency + 7.11,
    z: point.z * frequency - 19.83,
  };
}

/** Broad mottling and finer coherent structure modulate base color before final pixel grain. */
export function sampleMaterial(
  seed: string,
  point: MaterialPoint,
  texture: MaterialTextureSettings,
  grain: number,
): MaterialSample {
  const domains = seeds(seed);
  const broad = materialFbm(domains.broad, scaled(point, texture.scale), texture.octaves);
  const detail = materialFbm(
    domains.detail,
    scaled(point, texture.detailScale),
    Math.max(1, Math.ceil(texture.octaves / 2)),
  );
  const pixel =
    (materialLatticeHash(
      domains.grain,
      Math.floor(point.x * 540),
      Math.floor(point.y * 540),
      Math.floor(point.z * 540),
    ) /
      4294967296) *
      2 -
    1;
  const structured = Math.max(0.1, 1 + broad * texture.strength + detail * texture.detailStrength);
  return { broad, detail, grain: pixel, multiplier: structured * (1 + pixel * grain) };
}

const MATERIAL_GLSL = `
varying vec3 vTilePosition;
uniform uint tileBroadSeed;
uniform uint tileDetailSeed;
uniform uint tileGrainSeed;
uniform float tileTextureScale;
uniform int tileTextureOctaves;
uniform float tileTextureStrength;
uniform float tileDetailScale;
uniform float tileDetailStrength;
uniform float tileGrain;
uniform float tilePathCenterLight;
uniform float tilePathEdgeShade;
varying float vTilePathWeight;
varying float vTileBorderDistance;
uint tileLatticeHash(ivec3 p, uint seed) {
  uint h=seed ^ (uint(p.x)*0x9e3779b1u) ^ (uint(p.y)*0x85ebca77u) ^ (uint(p.z)*0xc2b2ae3du);
  h^=h>>16u;h*=0x7feb352du;h^=h>>15u;h*=0x846ca68bu;h^=h>>16u;
  return h;
}
float tileGradient(uint hash,vec3 p) {
  uint h=hash&15u;
  float u=h<8u ? p.x : p.y;
  float v=h<4u ? p.y : (h==12u || h==14u ? p.x : p.z);
  return (((h&1u)==0u ? u : -u)+((h&2u)==0u ? v : -v))*0.7071067811865476;
}
float tilePerlin(vec3 p,uint seed) {
  ivec3 cell=ivec3(floor(p));
  vec3 f=fract(p);
  vec3 u=f*f*f*(f*(f*6.0-15.0)+10.0);
  float n000=tileGradient(tileLatticeHash(cell+ivec3(0,0,0),seed),f-vec3(0,0,0));
  float n100=tileGradient(tileLatticeHash(cell+ivec3(1,0,0),seed),f-vec3(1,0,0));
  float n010=tileGradient(tileLatticeHash(cell+ivec3(0,1,0),seed),f-vec3(0,1,0));
  float n110=tileGradient(tileLatticeHash(cell+ivec3(1,1,0),seed),f-vec3(1,1,0));
  float n001=tileGradient(tileLatticeHash(cell+ivec3(0,0,1),seed),f-vec3(0,0,1));
  float n101=tileGradient(tileLatticeHash(cell+ivec3(1,0,1),seed),f-vec3(1,0,1));
  float n011=tileGradient(tileLatticeHash(cell+ivec3(0,1,1),seed),f-vec3(0,1,1));
  float n111=tileGradient(tileLatticeHash(cell+ivec3(1,1,1),seed),f-vec3(1,1,1));
  return mix(mix(mix(n000,n100,u.x),mix(n010,n110,u.x),u.y),mix(mix(n001,n101,u.x),mix(n011,n111,u.x),u.y),u.z);
}
float tileFbm(vec3 p,uint seed,int octaves) {
  float sum=0.0,total=0.0,amplitude=1.0;
  for(int i=0;i<6;i++) {
    if(i>=octaves)break;
    sum+=tilePerlin(p,seed+uint(i)*0x9e3779b9u)*amplitude;
    total+=amplitude;
    amplitude*=0.5;
    p*=2.03;
  }
  return clamp(sum/total*1.6,-1.0,1.0);
}
`;

interface MaterialUniform {
  value: number;
}
const materialBindings = new WeakMap<THREE.MeshStandardMaterial, Record<string, MaterialUniform>>();

/** Change seed and texture settings without invalidating the already compiled program. */
export function updateTileMaterial(
  material: THREE.MeshStandardMaterial,
  texture: MaterialTextureSettings,
  grain: number,
  seed: string,
  pathDetail: { centerLight: number; edgeShade: number } = { centerLight: 0, edgeShade: 0 },
): void {
  const bindings = materialBindings.get(material);
  if (!bindings) throw new Error('Material ist kein Kachelmaterial.');
  const domains = seeds(seed);
  const values = {
    tileBroadSeed: domains.broad,
    tileDetailSeed: domains.detail,
    tileGrainSeed: domains.grain,
    tileTextureScale: texture.scale,
    tileTextureOctaves: texture.octaves,
    tileTextureStrength: texture.strength,
    tileDetailScale: texture.detailScale,
    tileDetailStrength: texture.detailStrength,
    tileGrain: grain,
    tilePathCenterLight: pathDetail.centerLight,
    tilePathEdgeShade: pathDetail.edgeShade,
  };
  Object.entries(values).forEach(([key, value]) => {
    const uniform = bindings[key];
    if (uniform) uniform.value = value;
    else bindings[key] = { value };
  });
}

/** Object-space features remain fixed through orbit, resolution changes and seeded re-exports. */
export function createTileMaterial(
  parameters: THREE.MeshStandardMaterialParameters,
  texture: MaterialTextureSettings,
  grain: number,
  seed: string,
  pathDetail: { centerLight: number; edgeShade: number } = { centerLight: 0, edgeShade: 0 },
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial(parameters);
  const bindings: Record<string, MaterialUniform> = {};
  materialBindings.set(material, bindings);
  updateTileMaterial(material, texture, grain, seed, pathDetail);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, bindings);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vTilePosition;\nattribute float tilePathWeight;\nattribute float tileBorderDistance;\nvarying float vTilePathWeight;\nvarying float vTileBorderDistance;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec4 tilePosition=vec4(transformed,1.0);
#ifdef USE_INSTANCING
tilePosition=instanceMatrix*tilePosition;
#endif
vTilePosition=(modelMatrix*tilePosition).xyz;
vTilePathWeight=tilePathWeight;vTileBorderDistance=tileBorderDistance;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${MATERIAL_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float tileBroad=tileFbm(vTilePosition*tileTextureScale+vec3(13.37,7.11,-19.83),tileBroadSeed,tileTextureOctaves);
      float tileDetail=tileFbm(vTilePosition*tileDetailScale+vec3(13.37,7.11,-19.83),tileDetailSeed,max(1,(tileTextureOctaves+1)/2));
      diffuseColor.rgb*=max(0.1,1.0+tileBroad*tileTextureStrength+tileDetail*tileDetailStrength);
      float tileCenter=smoothstep(0.0,0.9,vTileBorderDistance);
      float tileEdge=1.0-smoothstep(0.0,0.35,vTileBorderDistance);
      diffuseColor.rgb*=1.0+vTilePathWeight*(tilePathCenterLight*tileCenter-tilePathEdgeShade*tileEdge);
      float tilePixel=float(tileLatticeHash(ivec3(floor(vTilePosition*540.0)),tileGrainSeed))/4294967296.0*2.0-1.0;
      diffuseColor.rgb*=1.0+tilePixel*tileGrain;
    `,
      );
  };
  material.customProgramCacheKey = () => 'tile-material-gradient-perlin-v3-path-distance';
  return material;
}
