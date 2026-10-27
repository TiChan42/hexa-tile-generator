import * as THREE from 'three';
import { createMaterialBakeShader } from './material';

interface BakeSource {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  shader: THREE.ShaderMaterial;
}
interface Face {
  source: BakeSource;
  vertices: [number, number, number];
  size: number;
}
export interface AtlasSquare {
  size: number;
  page: number;
  x: number;
  y: number;
}

/** Stable shelf packing, with separate bounded pages instead of silently shrinking textures. */
export function packAtlasSquares(sizes: readonly number[], pageSize: number): AtlasSquare[] {
  let x = 0,
    y = 0,
    shelf = 0,
    page = 0;
  const output: AtlasSquare[] = Array(sizes.length);
  const order = sizes
    .map((size, index) => ({ size, index }))
    .sort((a, b) => b.size - a.size || a.index - b.index);
  for (const { size, index } of order) {
    if (!Number.isInteger(size) || size < 1 || size > pageSize)
      throw new Error('Ungültige Texturatlas-Größe.');
    if (x + size > pageSize) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    if (y + size > pageSize) {
      page++;
      x = 0;
      y = 0;
      shelf = 0;
    }
    output[index] = { size, page, x, y };
    x += size;
    shelf = Math.max(shelf, size);
  }
  return output;
}

const ATTRIBUTES = ['position', 'normal', 'color', 'tilePathWeight', 'tileBorderDistance'] as const;

function faceGeometry(faces: { face: Face; square: AtlasSquare }[], pageSize: number) {
  const attributes = new Map<string, number[]>();
  const uvs: number[] = [];
  const bakePositions: number[] = [];
  // The bake triangles extend into their gutter. UVs still reference the exact original triangle.
  for (const { face, square } of faces) {
    const inner = square.size - 6;
    const uv = [
      [square.x + 3, square.y + 3],
      [square.x + square.size - 3, square.y + 3],
      [square.x + 3, square.y + square.size - 3],
    ];
    const center = [
      (uv[0]![0]! + uv[1]![0]! + uv[2]![0]!) / 3,
      (uv[0]![1]! + uv[1]![1]! + uv[2]![1]!) / 3,
    ];
    const expansion = 1 + 4 / inner;
    for (const point of uv) {
      uvs.push(point[0]! / pageSize, point[1]! / pageSize);
      bakePositions.push(
        (center[0]! + (point[0]! - center[0]!) * expansion) / pageSize,
        (center[1]! + (point[1]! - center[1]!) * expansion) / pageSize,
      );
    }
    for (const name of ATTRIBUTES) {
      const attribute = face.source.mesh.geometry.getAttribute(name);
      if (!attribute) continue;
      const values = attributes.get(name) ?? [];
      for (const vertex of face.vertices)
        for (let component = 0; component < attribute.itemSize; component++)
          values.push(attribute.getComponent(vertex, component));
      attributes.set(name, values);
    }
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, values] of attributes) {
    const original = faces[0]!.face.source.mesh.geometry.getAttribute(name);
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, original.itemSize));
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const bake = geometry.clone();
  bake.setAttribute('bakePosition', new THREE.Float32BufferAttribute(bakePositions, 2));
  for (let triangle = 0; triangle < faces.length; triangle++) {
    const expansion = 1 + 4 / (faces[triangle]!.square.size - 6);
    for (const name of ['position', 'color', 'tilePathWeight', 'tileBorderDistance']) {
      const attribute = bake.getAttribute(name);
      if (!attribute) continue;
      for (let component = 0; component < attribute.itemSize; component++) {
        const start = triangle * 3;
        const values = [0, 1, 2].map((offset) => attribute.getComponent(start + offset, component));
        const mean = (values[0]! + values[1]! + values[2]!) / 3;
        values.forEach((value, offset) =>
          attribute.setComponent(start + offset, component, mean + (value - mean) * expansion),
        );
      }
    }
  }
  geometry.deleteAttribute('color');
  geometry.deleteAttribute('tilePathWeight');
  geometry.deleteAttribute('tileBorderDistance');
  return { geometry, bake };
}

/** Embed unlit base color and procedural detail; lighting stays editable in the receiving app. */
export function bakeModelTextures(renderer: THREE.WebGLRenderer, model: THREE.Group): () => void {
  const geometries: THREE.BufferGeometry[] = [];
  const bakeGeometries = new Set<THREE.BufferGeometry>();
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const cleanup = () => {
    geometries.forEach((geometry) => geometry.dispose());
    bakeGeometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
  };
  const previousTarget = renderer.getRenderTarget();
  const previousViewport = renderer.getViewport(new THREE.Vector4());
  const previousScissor = renderer.getScissor(new THREE.Vector4());
  const previousScissorTest = renderer.getScissorTest();
  const previousClear = renderer.getClearColor(new THREE.Color());
  const previousAlpha = renderer.getClearAlpha();
  const pageSize = Math.min(2048, renderer.capabilities.maxTextureSize);
  const target = new THREE.WebGLRenderTarget(pageSize, pageSize, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  try {
    model.updateMatrixWorld(true);
    const tiles = model.children.some((child) => child.userData.tileId) ? model.children : [model];
    for (const tile of tiles) {
      const sources: BakeSource[] = [];
      tile.traverse((object) => {
        if (
          !(object instanceof THREE.Mesh) ||
          !(object.material instanceof THREE.MeshStandardMaterial)
        )
          return;
        const shader = createMaterialBakeShader(object.material, object.matrixWorld);
        if (!shader) return;
        materials.push(shader);
        sources.push({ mesh: object, shader });
      });
      const faces: Face[] = [];
      const a = new THREE.Vector3(),
        b = new THREE.Vector3(),
        c = new THREE.Vector3();
      for (const source of sources) {
        const geometry = source.mesh.geometry;
        const position = geometry.getAttribute('position');
        const indices = geometry.index;
        const count = indices ? indices.count : position.count;
        for (let index = 0; index < count; index += 3) {
          const vertices: [number, number, number] = indices
            ? [indices.getX(index), indices.getX(index + 1), indices.getX(index + 2)]
            : [index, index + 1, index + 2];
          a.fromBufferAttribute(position, vertices[0]).applyMatrix4(source.mesh.matrixWorld);
          b.fromBufferAttribute(position, vertices[1]).applyMatrix4(source.mesh.matrixWorld).sub(a);
          c.fromBufferAttribute(position, vertices[2]).applyMatrix4(source.mesh.matrixWorld).sub(a);
          const area = b.cross(c).length() / 2;
          const size = Math.max(10, Math.min(pageSize, Math.ceil(Math.sqrt(area * 2) * 512) + 6));
          faces.push({ source, vertices, size });
        }
      }
      const layout = packAtlasSquares(
        faces.map((face) => face.size),
        pageSize,
      );
      const pages = new Map<number, Map<BakeSource, { face: Face; square: AtlasSquare }[]>>();
      faces.forEach((face, index) => {
        const square = layout[index]!;
        const page = pages.get(square.page) ?? new Map();
        const entries = page.get(face.source) ?? [];
        entries.push({ face, square });
        page.set(face.source, entries);
        pages.set(square.page, page);
      });
      const replacements = new Map<BakeSource, THREE.Mesh[]>();
      for (const entries of pages.values()) {
        const scene = new THREE.Scene();
        const fragments: { source: BakeSource; geometry: THREE.BufferGeometry }[] = [];
        for (const [source, triangles] of entries) {
          const { geometry, bake } = faceGeometry(triangles, pageSize);
          geometries.push(geometry);
          bakeGeometries.add(bake);
          const mesh = new THREE.Mesh(bake, source.shader);
          mesh.frustumCulled = false;
          scene.add(mesh);
          fragments.push({ source, geometry });
        }
        renderer.setRenderTarget(target);
        renderer.setViewport(0, 0, pageSize, pageSize);
        renderer.setScissorTest(false);
        renderer.setClearColor('#000000', 1);
        renderer.clear();
        renderer.render(scene, new THREE.Camera());
        const pixels = new Uint8Array(pageSize * pageSize * 4);
        renderer.readRenderTargetPixels(target, 0, 0, pageSize, pageSize, pixels);
        const texture = new THREE.DataTexture(pixels, pageSize, pageSize, THREE.RGBAFormat);
        texture.name = 'Kachelfarben und prozedurale Texturen';
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        textures.push(texture);
        const pageMaterials = new Map<THREE.Material, THREE.MeshStandardMaterial>();
        for (const { source, geometry } of fragments) {
          let material = pageMaterials.get(source.mesh.material);
          if (!material) {
            material = source.mesh.material.clone();
            material.vertexColors = false;
            material.color.set('#ffffff');
            material.map = texture;
            materials.push(material);
            pageMaterials.set(source.mesh.material, material);
          }
          const output = new THREE.Mesh(geometry, material);
          const meshes = replacements.get(source) ?? [];
          meshes.push(output);
          replacements.set(source, meshes);
        }
        scene.clear();
        bakeGeometries.forEach((geometry) => geometry.dispose());
        bakeGeometries.clear();
      }
      for (const [source, meshes] of replacements) {
        const group = new THREE.Group();
        group.name = source.mesh.name;
        group.userData = { ...source.mesh.userData };
        group.matrix.copy(source.mesh.matrix);
        group.matrixAutoUpdate = false;
        group.visible = source.mesh.visible;
        group.add(...meshes);
        const parent = source.mesh.parent!;
        const index = parent.children.indexOf(source.mesh);
        parent.add(group);
        source.mesh.removeFromParent();
        parent.children.splice(parent.children.indexOf(group), 1);
        parent.children.splice(index, 0, group);
      }
    }
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  } finally {
    target.dispose();
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(previousViewport);
    renderer.setScissor(previousScissor);
    renderer.setScissorTest(previousScissorTest);
    renderer.setClearColor(previousClear, previousAlpha);
  }
}
