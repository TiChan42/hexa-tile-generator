import * as THREE from 'three';
import { hash32 } from '../core/random';
import { enableInstancePalettes } from './objectPalettes';

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

/** Appearance is versioned separately from the unchanged deterministic tile generator. */
export const RENDER_STYLE_VERSION = 2;

const smoothstep = (a: number, b: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** CPU reference for the sparse painted cracks; these never change the surface geometry. */
export function samplePathCrack(seed: string, point: MaterialPoint): number {
  const x = point.x * 5.5,
    z = point.z * 5.5;
  const h = materialLatticeHash(
    hash32(`${seed}:material:path-cracks:v2`),
    Math.floor(x),
    0,
    Math.floor(z),
  );
  if (h % 13 !== 0) return 0;
  let px = x - Math.floor(x) - 0.5,
    py = z - Math.floor(z) - 0.5;
  if ((h & 16) !== 0) [px, py] = [py, px];
  if ((h & 32) !== 0) px = -px;
  const bend = (((h >>> 8) & 255) / 255) * 0.14 - 0.07;
  const segment = (ax: number, ay: number, bx: number, by: number): number => {
    const dx = bx - ax,
      dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  const main = Math.min(segment(-0.23, -0.08, -0.02, bend), segment(-0.02, bend, 0.21, 0.09));
  const branch = segment(-0.02, bend, 0.045, bend - 0.13);
  return Math.max(
    1 - smoothstep(0.003, 0.009, main),
    (1 - smoothstep(0.001, 0.005, branch)) * 0.65,
  );
}

/** Shared reference for edge grit, center light and sparse cracks in preview/PNG/GLB. */
export function samplePathFinish(
  seed: string,
  point: MaterialPoint,
  borderDistance: number,
  grain: number,
  detail: { centerLight: number; edgeShade: number },
  origin: { x: number; y: number } = { x: 0, y: 0 },
): number {
  const world = { x: point.x + origin.x, y: point.y, z: point.z + origin.y };
  const edge = 1 - smoothstep(0, 0.55, borderDistance);
  const grit =
    (materialLatticeHash(
      hash32(`${seed}:material:path-grit:v2`),
      Math.floor(world.x * 210),
      Math.floor(world.y * 210),
      Math.floor(world.z * 210),
    ) /
      4294967296) *
      2 -
    1;
  const shade =
    1 +
    detail.centerLight * smoothstep(0, 0.9, borderDistance) -
    detail.edgeShade * (1 - smoothstep(0, 0.35, borderDistance));
  return (
    shade *
    (1 + grit * Math.min(0.45, grain * 1.6 + detail.edgeShade) * edge) *
    (1 - samplePathCrack(seed, world) * 0.38 * smoothstep(0.08, 0.28, borderDistance))
  );
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
  origin: { x: number; y: number } = { x: 0, y: 0 },
): MaterialSample {
  const domains = seeds(seed);
  const worldPoint = { x: point.x + origin.x, y: point.y, z: point.z + origin.y };
  const broad = materialFbm(domains.broad, scaled(worldPoint, texture.scale), texture.octaves);
  const detail = materialFbm(
    domains.detail,
    scaled(worldPoint, texture.detailScale),
    Math.max(1, Math.ceil(texture.octaves / 2)),
  );
  const pixel =
    (materialLatticeHash(
      domains.grain,
      Math.floor(worldPoint.x * 540),
      Math.floor(worldPoint.y * 540),
      Math.floor(worldPoint.z * 540),
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
uniform uint tilePathGritSeed;
uniform uint tilePathCrackSeed;
uniform vec2 tileNoiseOrigin;
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
float tileCrackSegment(vec2 p,vec2 a,vec2 b) {
  vec2 delta=b-a;
  return length(p-a-delta*clamp(dot(p-a,delta)/dot(delta,delta),0.0,1.0));
}
float tilePathCrack(vec2 world) {
  vec2 p=world*5.5;
  uint h=tileLatticeHash(ivec3(int(floor(p.x)),0,int(floor(p.y))),tilePathCrackSeed);
  if(h%13u!=0u)return 0.0;
  p=fract(p)-0.5;
  if((h&16u)!=0u)p=p.yx;
  if((h&32u)!=0u)p.x=-p.x;
  float bend=float((h>>8u)&255u)/255.0*0.14-0.07;
  float main=min(tileCrackSegment(p,vec2(-0.23,-0.08),vec2(-0.02,bend)),tileCrackSegment(p,vec2(-0.02,bend),vec2(0.21,0.09)));
  float branch=tileCrackSegment(p,vec2(-0.02,bend),vec2(0.045,bend-0.13));
  return max(1.0-smoothstep(0.003,0.009,main),(1.0-smoothstep(0.001,0.005,branch))*0.65);
}
`;

const TILE_COLOR_GLSL = `
      float tileBroad=0.0,tileDetail=0.0;
      if(tileTextureStrength>0.0)tileBroad=tileFbm(vTilePosition*tileTextureScale+vec3(13.37,7.11,-19.83),tileBroadSeed,tileTextureOctaves);
      if(tileDetailStrength>0.0)tileDetail=tileFbm(vTilePosition*tileDetailScale+vec3(13.37,7.11,-19.83),tileDetailSeed,max(1,(tileTextureOctaves+1)/2));
      diffuseColor.rgb*=max(0.1,1.0+tileBroad*tileTextureStrength+tileDetail*tileDetailStrength);
      if(vTilePathWeight>0.0) {
        float tileCenter=smoothstep(0.0,0.9,vTileBorderDistance);
        float tileEdge=1.0-smoothstep(0.0,0.35,vTileBorderDistance);
        diffuseColor.rgb*=1.0+vTilePathWeight*(tilePathCenterLight*tileCenter-tilePathEdgeShade*tileEdge);
        float tileGrit=float(tileLatticeHash(ivec3(floor(vTilePosition*210.0)),tilePathGritSeed))/4294967296.0*2.0-1.0;
        diffuseColor.rgb*=1.0+tileGrit*min(0.45,tileGrain*1.6+tilePathEdgeShade)*(1.0-smoothstep(0.0,0.55,vTileBorderDistance))*vTilePathWeight;
        diffuseColor.rgb*=1.0-tilePathCrack(vTilePosition.xz)*0.38*smoothstep(0.08,0.28,vTileBorderDistance)*vTilePathWeight;
      }
      float tilePixel=float(tileLatticeHash(ivec3(floor(vTilePosition*540.0)),tileGrainSeed))/4294967296.0*2.0-1.0;
      diffuseColor.rgb*=1.0+tilePixel*tileGrain;
`;

interface MaterialUniform {
  value: number | THREE.Vector2;
}
const materialBindings = new WeakMap<THREE.MeshStandardMaterial, Record<string, MaterialUniform>>();

/** Change seed and texture settings without invalidating the already compiled program. */
export function updateTileMaterial(
  material: THREE.MeshStandardMaterial,
  texture: MaterialTextureSettings,
  grain: number,
  seed: string,
  pathDetail: { centerLight: number; edgeShade: number } = { centerLight: 0, edgeShade: 0 },
  noiseOrigin: { x: number; y: number } = { x: 0, y: 0 },
): void {
  const bindings = materialBindings.get(material);
  if (!bindings) throw new Error('Material ist kein Kachelmaterial.');
  const domains = seeds(seed);
  const values = {
    tileBroadSeed: domains.broad,
    tileDetailSeed: domains.detail,
    tileGrainSeed: domains.grain,
    tilePathGritSeed: hash32(`${seed}:material:path-grit:v2`),
    tilePathCrackSeed: hash32(`${seed}:material:path-cracks:v2`),
    tileNoiseOrigin: new THREE.Vector2(noiseOrigin.x, noiseOrigin.y),
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
  noiseOrigin: { x: number; y: number } = { x: 0, y: 0 },
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial(parameters);
  const bindings: Record<string, MaterialUniform> = {};
  materialBindings.set(material, bindings);
  updateTileMaterial(material, texture, grain, seed, pathDetail, noiseOrigin);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, bindings);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec2 tileNoiseOrigin;\nvarying vec3 vTilePosition;\nattribute float tilePathWeight;\nattribute float tileBorderDistance;\nvarying float vTilePathWeight;\nvarying float vTileBorderDistance;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec4 tilePosition=vec4(transformed,1.0);
#ifdef USE_INSTANCING
tilePosition=instanceMatrix*tilePosition;
#endif
vTilePosition=(modelMatrix*tilePosition).xyz+vec3(tileNoiseOrigin.x,0.0,tileNoiseOrigin.y);
vTilePathWeight=tilePathWeight;vTileBorderDistance=tileBorderDistance;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${MATERIAL_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${TILE_COLOR_GLSL}
    `,
      );
  };
  material.customProgramCacheKey = () =>
    `tile-material-gradient-perlin-style-${RENDER_STYLE_VERSION}`;
  enableInstancePalettes(material);
  return material;
}
