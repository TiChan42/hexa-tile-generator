import { test, expect } from '@playwright/test';
import type * as Three from 'three';
import type * as MaterialModule from '../../src/render/material';
import type * as ExportModule from '../../src/render/modelExport';
import type * as PaletteModule from '../../src/render/objectPalettes';

test('GLB round trip preserves field, landscape and voxel colors with baked world-space textures', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  const samples = await page.evaluate(async () => {
    const bakeUrl = '/src/render/textureBake.ts';
    const moduleText = await (await fetch(bakeUrl)).text();
    const threeUrl = moduleText.match(/import \* as THREE from ["']([^"']+)["']/)![1]!;
    const THREE: typeof Three = await import(/* @vite-ignore */ threeUrl);
    const materialUrl = moduleText.match(/from ["']([^"']+\/material\.ts[^"']*)["']/)![1]!;
    const exportUrl = '/src/render/modelExport.ts';
    const paletteUrl = '/src/render/objectPalettes.ts';
    const loaderUrl = '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
    const {
      createTileMaterial,
      sampleMaterial,
      samplePathFinish,
      samplePathCrack,
    }: typeof MaterialModule = await import(/* @vite-ignore */ materialUrl);
    const { exportGlb }: typeof ExportModule = await import(/* @vite-ignore */ exportUrl);
    const { setInstancePalettes }: typeof PaletteModule = await import(
      /* @vite-ignore */ paletteUrl
    );
    const { GLTFLoader } = await import(/* @vite-ignore */ loaderUrl);
    const renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(32, 24);
    renderer.setClearColor('#123456', 0.3);
    const initialViewport = renderer.getViewport(new THREE.Vector4()).toArray();
    const initialColor = renderer.getClearColor(new THREE.Color()).getHexString();
    const texture = { scale: 7, octaves: 3, strength: 0.35, detailScale: 31, detailStrength: 0.2 };
    // Avoid exact grain-lattice planes, whose float rounding differs between CPU and GPU.
    const origin = { x: 0.35123, y: -0.70123 };
    const seed = 'baked-color-reference';
    const group = new THREE.Group();
    group.position.set(1.5, 0.012345, 0.8);
    const baseColors = {
      Testfeld: new THREE.Color('#ca673d'),
      Wegrand: new THREE.Color('#a98553'),
      Riss: new THREE.Color('#c8a37d'),
      Landschaft: new THREE.Color('#426c3d'),
      Testvoxel: new THREE.Color('#ba2288'),
    };
    let crack: { x: number; z: number } | undefined;
    for (let x = -4; x <= 4 && !crack; x++)
      for (let z = -4; z <= 4 && !crack; z++) {
        for (let u = 0.45; u <= 0.55 && !crack; u += 0.01)
          for (let v = 0.45; v <= 0.55; v += 0.01) {
            const point = { x: (x + u) / 5.5, y: 0, z: (z + v) / 5.5 };
            if (samplePathCrack(seed, point) > 0.99) {
              crack = point;
              break;
            }
          }
      }
    if (!crack) throw new Error('Kein Riss für den Farbvergleich gefunden.');
    for (const [name, color] of Object.entries(baseColors)) {
      const path = name === 'Testfeld' || name === 'Wegrand' || name === 'Riss';
      const geometry =
        name === 'Riss'
          ? new THREE.BoxGeometry(0.001, 0.001, 0.001)
          : new THREE.BoxGeometry(0.8, 0.3, 0.6);
      const count = geometry.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      for (let index = 0; index < count; index++)
        (name === 'Testvoxel' ? new THREE.Color('#777777') : color).toArray(colors, index * 3);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const material = createTileMaterial(
        { vertexColors: true },
        texture,
        0.07,
        seed,
        { centerLight: path ? 0.3 : 0, edgeShade: 0.2 },
        origin,
      );
      let mesh: Three.Mesh;
      if (name === 'Testvoxel') {
        geometry.userData.objectPaletteFamily = 'foliage';
        geometry.setAttribute(
          'objectPaletteSlot',
          new THREE.Float32BufferAttribute(new Float32Array(count).fill(1), 1),
        );
        setInstancePalettes(geometry, [{ id: 'pink', foliage: ['#ba2288', '#441133', '#ddaacc'] }]);
        const instances = new THREE.InstancedMesh(geometry, material, 1);
        instances.setMatrixAt(0, new THREE.Matrix4().makeRotationY(0.4).setPosition(0.7, 0.4, 0.6));
        mesh = instances;
      } else {
        geometry.setAttribute(
          'tilePathWeight',
          new THREE.Float32BufferAttribute(new Float32Array(count).fill(path ? 1 : 0), 1),
        );
        geometry.setAttribute(
          'tileBorderDistance',
          new THREE.Float32BufferAttribute(
            new Float32Array(count).fill(name === 'Wegrand' ? 0.12 : 0.65),
            1,
          ),
        );
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(name === 'Testfeld' ? -0.4 : 0.5, 0.2, -0.3);
        if (name === 'Riss')
          mesh.position.set(
            crack.x - group.position.x - origin.x,
            0.2,
            crack.z - group.position.z - origin.y,
          );
      }
      mesh.name = name;
      group.add(mesh);
    }
    const blob = await exportGlb(group, renderer);
    const result = await new GLTFLoader().parseAsync(await blob.arrayBuffer(), '');
    result.scene.updateMatrixWorld(true);
    const samples: { name: string; actual: number[]; expected: number[] }[] = [];
    result.scene.traverse((object: Three.Object3D) => {
      if (
        !(object instanceof THREE.Mesh) ||
        !(object.material instanceof THREE.MeshStandardMaterial)
      )
        return;
      let ancestor: Three.Object3D | null = object;
      while (ancestor && !(ancestor.name in baseColors)) ancestor = ancestor.parent;
      if (!ancestor) throw new Error('Exportierte Oberfläche fehlt.');
      const name = ancestor.name as keyof typeof baseColors;
      const image = object.material.map!.image as ImageBitmap;
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const uv = object.geometry.getAttribute('uv');
      const position = object.geometry.getAttribute('position');
      for (const start of [0, 6, 12]) {
        const barycentric = [0.23, 0.34, 0.43];
        const u = barycentric.reduce(
          (sum, weight, offset) => sum + uv.getX(start + offset) * weight,
          0,
        );
        const v = barycentric.reduce(
          (sum, weight, offset) => sum + uv.getY(start + offset) * weight,
          0,
        );
        const x = Math.floor(u * image.width),
          y = Math.floor(v * image.height);
        const actualU = (x + 0.5) / image.width,
          actualV = (y + 0.5) / image.height;
        const ub = uv.getX(start + 1) - uv.getX(start),
          uc = uv.getX(start + 2) - uv.getX(start);
        const vb = uv.getY(start + 1) - uv.getY(start),
          vc = uv.getY(start + 2) - uv.getY(start);
        const du = actualU - uv.getX(start),
          dv = actualV - uv.getY(start);
        const determinant = ub * vc - uc * vb;
        const b = (du * vc - uc * dv) / determinant,
          c = (ub * dv - du * vb) / determinant;
        const weights = [1 - b - c, b, c];
        const point = new THREE.Vector3();
        weights.forEach((weight, offset) =>
          point.addScaledVector(
            new THREE.Vector3().fromBufferAttribute(position, start + offset),
            weight,
          ),
        );
        point.applyMatrix4(object.matrixWorld);
        const sample = sampleMaterial(seed, point, texture, 0.07, origin);
        const path =
          name === 'Testfeld' || name === 'Wegrand' || name === 'Riss'
            ? samplePathFinish(
                seed,
                point,
                name === 'Wegrand' ? 0.12 : 0.65,
                0.07,
                { centerLight: 0.3, edgeShade: 0.2 },
                origin,
              )
            : 1;
        const color = baseColors[name].clone().multiplyScalar(sample.multiplier * path);
        color.r = Math.min(1, color.r);
        color.g = Math.min(1, color.g);
        color.b = Math.min(1, color.b);
        color.convertLinearToSRGB();
        const pixel = (y * image.width + x) * 4;
        samples.push({
          name,
          actual: Array.from(pixels.slice(pixel, pixel + 3)),
          expected: color.toArray().map((value) => Math.round(value * 255)),
        });
      }
    });
    if (renderer.getViewport(new THREE.Vector4()).toArray().join() !== initialViewport.join())
      throw new Error('Viewport wurde beim Backen verändert.');
    if (renderer.getClearColor(new THREE.Color()).getHexString() !== initialColor)
      throw new Error('Hintergrundfarbe wurde beim Backen verändert.');
    renderer.dispose();
    renderer.forceContextLoss();
    return samples;
  });
  expect(new Set(samples.map((sample) => sample.name))).toEqual(
    new Set(['Testfeld', 'Wegrand', 'Riss', 'Landschaft', 'Testvoxel']),
  );
  for (const sample of samples)
    sample.actual.forEach((value, index) =>
      expect(Math.abs(value - sample.expected[index]!), JSON.stringify(sample)).toBeLessThanOrEqual(
        3,
      ),
    );
  expect(new Set(samples.map((sample) => sample.actual.join(','))).size).toBeGreaterThan(6);
  expect(errors).toEqual([]);
});
