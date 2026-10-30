import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { hexagon } from '../core/geometry';
import { boardOrigin } from '../core/bulk';
import { decorationColorVariant } from '../core/object-colors';
import type { DecorationColorVariant } from '../core/object-colors';
import type { ActionId, DecorationKind, GeneratedTile, TileConfig } from '../core/types';
import { ASSET_LIBRARY, voxelGeometry } from './voxels';
import type { VoxelModel } from './voxels';
import { actionTexture } from './icons';
import { createTileMaterial } from './material';
import { buildFieldBorders } from './borders';
import { buildTileSurfaces } from './surfaces';
import { buildTileBorder, tileBorderColor } from './tileBorder';
import { fieldSymbolLayout } from './symbols';
import { enableInstancePalettes, setInstancePalettes } from './objectPalettes';
import { fitSeriesCamera } from './seriesCamera';
import { buildPathAccents } from './pathAccents';
import { rasterGridSegments, rasterLineGeometry, rasterSubgridSegments } from './grid';

export interface SeriesPreviewTile {
  id: string;
  config: TileConfig;
  tile: GeneratedTile;
}
export interface SeriesTileBounds {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}
interface Options {
  mode: '2d' | '3d';
  tiles: SeriesPreviewTile[];
  columns: number;
  models?: VoxelModel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onTileBounds?: (bounds: SeriesTileBounds) => void;
}

export function createSeriesRenderer(
  container: HTMLElement,
  {
    mode,
    tiles,
    columns,
    models = [],
    selectedId: initialSelectedId,
    onSelect,
    onTileBounds,
  }: Options,
) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor('#e8ede5', 1);
  renderer.domElement.setAttribute(
    'aria-label',
    mode === '2d' ? '2D-Ansicht der gesamten Kachelserie' : '3D-Ansicht der gesamten Kachelserie',
  );
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const content = new THREE.Group();
  scene.add(content);
  scene.background = new THREE.Color('#e8ede5');
  scene.add(new THREE.HemisphereLight('#fffdf1', '#68715f', 2.1));
  const sun = new THREE.DirectionalLight('#fff5dd', 2.4);
  sun.position.set(-7, 13, 8);
  scene.add(sun);

  const camera =
    mode === '2d'
      ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.03, 500)
      : new THREE.PerspectiveCamera(42, 1, 0.03, 500);
  if (mode === '2d') camera.up.set(0, 0, -1);
  const controls = new OrbitControls(camera, container);
  controls.enableDamping = false;
  controls.enablePan = true;
  controls.enableRotate = mode === '3d';
  controls.screenSpacePanning = true;
  controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
  controls.mouseButtons.RIGHT = mode === '2d' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  controls.touches.ONE = mode === '2d' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.minZoom = 0.15;
  controls.maxZoom = 16;
  controls.minDistance = 0.8;
  const placed = tiles.map((entry, index) => {
    const origin = boardOrigin(index, columns);
    return { ...entry, x: origin.x, z: origin.y };
  });
  const outlineMaterials = new Map<string, THREE.LineBasicMaterial>();
  const actionEntries = new Map<
    string,
    { action: ActionId; amount: number; items: { matrix: THREE.Matrix4; tileId: string }[] }
  >();
  const decorationEntries = new Map<
    string,
    {
      kind: DecorationKind;
      items: { matrix: THREE.Matrix4; tileId: string; variant: DecorationColorVariant | null }[];
    }
  >();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const actionGeometry = new THREE.PlaneGeometry(1, 1);
  actionGeometry.rotateX(-Math.PI / 2);
  geometries.add(actionGeometry);
  const transform = new THREE.Object3D();

  for (const entry of placed) {
    const group = new THREE.Group();
    group.position.set(entry.x, 0, entry.z);
    group.userData.tileId = entry.id;
    content.add(group);

    const surfaces = buildTileSurfaces(entry.tile, entry.config);
    geometries.add(surfaces.geometry);
    const terrain = createTileMaterial(
      { vertexColors: true, roughness: 1, side: THREE.DoubleSide },
      entry.config.terrain.texture,
      entry.config.terrain.grain,
      entry.config.terrain.noise.seed,
      entry.config.paths.detail,
      {
        x: entry.config.terrain.noise.origin.x - entry.x,
        y: entry.config.terrain.noise.origin.y - entry.z,
      },
    );
    materials.add(terrain);
    group.add(new THREE.Mesh(surfaces.geometry, terrain));

    for (const [enabled, segments, color, opacity] of [
      [
        entry.config.grid.showGrid,
        () => rasterGridSegments(entry.tile, entry.config.grid),
        '#304c42',
        0.11,
      ],
      [
        entry.config.grid.showSubgrid,
        () => rasterSubgridSegments(entry.tile, entry.config.grid),
        '#e4e7c5',
        0.19,
      ],
    ] as const) {
      if (!enabled) continue;
      const geometry = rasterLineGeometry(segments());
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      geometries.add(geometry);
      materials.add(material);
      group.add(new THREE.LineSegments(geometry, material));
    }

    const borders = buildFieldBorders(entry.tile, surfaces.geometry);
    geometries.add(borders.geometry);
    const fieldInk = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    materials.add(fieldInk);
    group.add(new THREE.Mesh(borders.geometry, fieldInk));

    const rimColor = tileBorderColor(entry.config.border);
    if (rimColor) {
      const rimGeometry = buildTileBorder(
        entry.tile,
        entry.config.border,
        surfaces.geometry,
        surfaces.regions,
      );
      geometries.add(rimGeometry);
      if (rimGeometry.getAttribute('position').count) {
        const rim = new THREE.MeshBasicMaterial({
          color: rimColor,
          side: THREE.DoubleSide,
          toneMapped: false,
        });
        materials.add(rim);
        group.add(new THREE.Mesh(rimGeometry, rim));
      }
    }

    const outlineGeometry = new THREE.BufferGeometry();
    const outlinePoints = hexagon().map((point) => new THREE.Vector3(point.x, 0.5, point.y));
    outlineGeometry.setFromPoints(outlinePoints);
    geometries.add(outlineGeometry);
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: '#f3cb58',
      transparent: true,
      opacity: 0,
      depthTest: false,
      toneMapped: false,
    });
    materials.add(outlineMaterial);
    const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial);
    outline.renderOrder = 10;
    group.add(outline);
    outlineMaterials.set(entry.id, outlineMaterial);

    for (const field of entry.tile.fields) {
      if (field.action === 'none') continue;
      const { center, size, height } = fieldSymbolLayout(entry.tile, field);
      transform.position.set(entry.x + center.x, height + 0.0045, entry.z + center.y);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(size, size, size);
      transform.updateMatrix();
      const amount = field.resourceAmount ?? 1,
        key = `${field.action}:${amount}`;
      const icons = actionEntries.get(key) ?? { action: field.action, amount, items: [] };
      icons.items.push({ matrix: transform.matrix.clone(), tileId: entry.id });
      actionEntries.set(key, icons);
    }

    if (entry.config.decoration.enabled) {
      for (const decoration of entry.tile.decorations) {
        const modelId = entry.config.decoration.modelSlots?.[decoration.kind] ?? decoration.kind;
        const variant = !ASSET_LIBRARY.some((model) => model.id === modelId)
          ? null
          : decorationColorVariant(entry.config, decoration.kind, decoration.id);
        const key = modelId;
        let colorGroup = decorationEntries.get(key);
        if (!colorGroup) {
          colorGroup = { kind: decoration.kind, items: [] };
          decorationEntries.set(key, colorGroup);
        }
        transform.position.set(
          entry.x + decoration.position.x,
          decoration.height,
          entry.z + decoration.position.y,
        );
        transform.rotation.set(0, decoration.rotation * (Math.PI / 180), 0);
        transform.scale.setScalar(decoration.scale);
        transform.updateMatrix();
        colorGroup.items.push({ matrix: transform.matrix.clone(), tileId: entry.id, variant });
      }
    }
  }

  actionEntries.forEach(({ items, action, amount }) => {
    const material = new THREE.MeshBasicMaterial({
      map: actionTexture(action, amount),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    materials.add(material);
    if (material.map) textures.add(material.map);
    const mesh = new THREE.InstancedMesh(actionGeometry, material, items.length);
    mesh.userData.tileIds = items.map((item) => item.tileId);
    items.forEach((item, index) => mesh.setMatrixAt(index, item.matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 2;
    content.add(mesh);
  });

  const assets = new Map([...ASSET_LIBRARY, ...models].map((model) => [model.id, model]));
  const voxelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  enableInstancePalettes(voxelMaterial);
  materials.add(voxelMaterial);
  decorationEntries.forEach(({ items, kind }, modelId) => {
    const model = assets.get(modelId) ?? assets.get(kind);
    if (!model || !items.length) return;
    const geometry = voxelGeometry(model);
    setInstancePalettes(
      geometry,
      items.map((item) => item.variant),
    );
    geometries.add(geometry);
    const mesh = new THREE.InstancedMesh(geometry, voxelMaterial, items.length);
    mesh.userData.tileIds = items.map((item) => item.tileId);
    items.forEach((item, index) => mesh.setMatrixAt(index, item.matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    content.add(mesh);
  });

  const accents = placed.flatMap((entry) =>
    buildPathAccents(entry.tile, entry.config).map((item) => ({
      ...item,
      tileId: entry.id,
      x: entry.x + item.position.x,
      z: entry.z + item.position.y,
    })),
  );
  if (accents.length) {
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    const material = new THREE.MeshStandardMaterial({ color: '#a89f8a', roughness: 1 });
    geometries.add(geometry);
    materials.add(material);
    const mesh = new THREE.InstancedMesh(geometry, material, accents.length);
    mesh.userData.tileIds = accents.map(({ tileId }) => tileId);
    accents.forEach((item, index) => {
      transform.position.set(item.x, item.height + item.scale * 0.3, item.z);
      transform.rotation.set(0, (item.rotation * Math.PI) / 180, 0);
      transform.scale.set(item.scale * 0.5, item.scale * 0.3, item.scale * 0.38);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.computeBoundingSphere();
    content.add(mesh);
  }

  let disposed = false;
  let frame = 0;
  let width = 0;
  let height = 0;
  let selectedId = initialSelectedId;
  const point = new THREE.Vector3();
  function render() {
    if (disposed) return;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (disposed) return;
      renderer.render(scene, camera);
      if (mode === '2d') {
        for (const entry of placed) {
          point.set(entry.x, 0, entry.z).project(camera);
          const tileWidth = width * camera.projectionMatrix.elements[0]!;
          onTileBounds?.({
            id: entry.id,
            left: ((point.x + 1) * width) / 2 - tileWidth / 2,
            top: ((1 - point.y) * height) / 2 - (tileWidth * Math.sqrt(3)) / 4,
            width: tileWidth,
            height: (tileWidth * Math.sqrt(3)) / 2,
          });
        }
      }
      renderer.domElement.dataset.zoom = String(camera.zoom);
      renderer.domElement.dataset.triangles = String(renderer.info.render.triangles);
    });
  }
  function fit() {
    controls.target.copy(fitSeriesCamera(content, camera, width / height));
    controls.maxDistance = Math.max(20, camera.position.distanceTo(controls.target) * 10);
    controls.update();
    render();
  }
  function setSelected(id: string | null) {
    selectedId = id;
    outlineMaterials.forEach((material, tileId) => {
      material.opacity = tileId === selectedId ? 1 : 0;
    });
    render();
  }
  const resize = () => {
    const nextWidth = Math.max(1, container.clientWidth);
    const nextHeight = Math.max(1, container.clientHeight);
    if (width === nextWidth && height === nextHeight) return;
    width = nextWidth;
    height = nextHeight;
    renderer.setSize(width, height, false);
    fit();
  };
  controls.addEventListener('change', render);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  setSelected(initialSelectedId);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down: THREE.Vector2 | null = null;
  let dragged = false;
  const pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    dragged = false;
    down = new THREE.Vector2(event.clientX, event.clientY);
  };
  const pointerMove = (event: PointerEvent) => {
    if (down && down.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5)
      dragged = true;
  };
  const pointerCancel = () => {
    down = null;
  };
  const pointerUp = (event: PointerEvent) => {
    if (
      !down ||
      dragged ||
      event.button !== 0 ||
      down.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5
    ) {
      down = null;
      return;
    }
    down = null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster
      .intersectObjects(content.children, true)
      .find(({ object }) => object instanceof THREE.Mesh);
    if (!hit) return;
    let object: THREE.Object3D | null = hit.object;
    if (Array.isArray(object.userData.tileIds)) {
      const id = object.userData.tileIds[hit.instanceId ?? -1];
      if (typeof id === 'string') onSelect(id);
      return;
    }
    while (object && !object.userData.tileId) object = object.parent;
    const id = object?.userData.tileId;
    if (typeof id === 'string') onSelect(id);
  };
  container.addEventListener('pointerdown', pointerDown);
  container.addEventListener('pointermove', pointerMove);
  container.addEventListener('pointercancel', pointerCancel);
  container.addEventListener('pointerup', pointerUp);

  return {
    fit,
    setSelected,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      container.removeEventListener('pointerdown', pointerDown);
      container.removeEventListener('pointermove', pointerMove);
      container.removeEventListener('pointercancel', pointerCancel);
      container.removeEventListener('pointerup', pointerUp);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      content.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      scene.clear();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
