import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { hexagon } from '../core/geometry';
import { decorationColorVariant } from '../core/object-colors';
import type { DecorationColorVariant } from '../core/object-colors';
import type { ActionId, DecorationKind, GeneratedTile, TileConfig } from '../core/types';
import { ASSET_LIBRARY, voxelGeometry } from '../render/voxels';
import { actionTexture } from '../render/icons';
import { createTileMaterial } from '../render/material';
import { buildFieldBorders, fieldOutlineSegments, FIELD_BORDER_COLOR } from '../render/borders';
import { buildTileSurfaces } from '../render/surfaces';
import { buildTileBorder, tileBorderColor } from '../render/tileBorder';
import { fieldSymbolLayout } from '../render/symbols';

export interface SeriesPreviewTile {
  id: string;
  config: TileConfig;
  tile: GeneratedTile;
}

interface Props {
  mode: '2d' | '3d';
  tiles: SeriesPreviewTile[];
  columns: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function TileMapCanvas({ tile, config }: { tile: GeneratedTile; config: TileConfig }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const width = 240;
    const height = 210;
    element.width = width;
    element.height = height;
    context.clearRect(0, 0, width, height);
    context.setTransform(91, 0, 0, -91, width / 2, height / 2);
    const outer = hexagon();
    context.beginPath();
    outer.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.save();
    context.clip();
    context.fillStyle = config.terrain.gradient[0]?.color ?? '#496247';
    context.fill();
    for (const cell of tile.cells) {
      for (const polygon of cell.surfacePolygons) {
        if (polygon.length < 3) continue;
        context.beginPath();
        polygon.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.closePath();
        context.fillStyle = cell.color;
        context.fill();
        context.strokeStyle = 'rgba(34, 48, 38, .22)';
        context.lineWidth = 0.003;
        context.stroke();
      }
    }
    if (tile.center.polygon.length > 2) {
      context.beginPath();
      tile.center.polygon.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.closePath();
      context.fillStyle = tile.fields.find((field) => field.isCenter)?.color ?? '#d4b975';
      context.fill();
    }
    for (const field of tile.fields) {
      context.beginPath();
      for (const edge of fieldOutlineSegments(tile, field)) {
        context.moveTo(edge.start.x, edge.start.y);
        context.lineTo(edge.end.x, edge.end.y);
      }
      context.strokeStyle = '#202922';
      context.lineWidth = field.isCenter ? 0.019 : 0.014;
      context.lineCap = 'round';
      context.stroke();
    }
    context.restore();
    context.beginPath();
    outer.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.strokeStyle = tileBorderColorFor2D(config);
    context.lineWidth = config.border.enabled ? Math.max(0.014, config.border.width * 2) : 0.008;
    context.stroke();
    context.setTransform(1, 0, 0, 1, 0, 0);
  }, [tile, config]);
  return <canvas ref={canvas} className="bulk-map-canvas" aria-hidden="true" />;
}

function tileBorderColorFor2D(config: TileConfig) {
  if (!config.border.enabled || config.border.mode === 'transparent') return '#63715d';
  if (config.border.mode === 'custom') return config.border.color;
  if (config.border.mode === 'fields') return FIELD_BORDER_COLOR;
  return '#171a17';
}

function Series2D({ tiles, columns, selectedId, onSelect }: Props) {
  return (
    <div className="bulk-series-2d" style={{ '--bulk-columns': columns } as React.CSSProperties}>
      {tiles.map(({ id, config, tile }, index) => {
        return (
          <button
            className={`bulk-map-tile ${selectedId === id ? 'selected' : ''}`}
            key={id}
            style={{ '--bulk-column': index % columns } as React.CSSProperties}
            onClick={() => onSelect(id)}
            aria-label={`${config.name} auswählen`}
          >
            <TileMapCanvas tile={tile} config={config} />
            <strong>{config.name}</strong>
            <small>
              {config.paths.fieldCount} Felder · {config.seed}
            </small>
          </button>
        );
      })}
    </div>
  );
}

interface PositionedTile extends SeriesPreviewTile {
  x: number;
  z: number;
}

function boardPositions(tiles: SeriesPreviewTile[], columns: number): PositionedTile[] {
  return tiles.map((entry, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return { ...entry, x: column * 1.5, z: Math.sqrt(3) * (row + column / 2) };
  });
}

function Series3D({ tiles, columns, selectedId, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const selected = useRef(selectedId);
  const select = useRef(onSelect);
  useEffect(() => {
    selected.current = selectedId;
    select.current = onSelect;
  }, [selectedId, onSelect]);

  useEffect(() => {
    const container = host.current;
    if (!container || !tiles.length) return;
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
    renderer.domElement.setAttribute('aria-label', '3D-Ansicht der gesamten Kachelserie');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e8ede5');
    scene.add(new THREE.HemisphereLight('#fffdf1', '#68715f', 2.1));
    const sun = new THREE.DirectionalLight('#fff5dd', 2.4);
    sun.position.set(-7, 13, 8);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = true;
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;

    const placed = boardPositions(tiles, columns);
    const minX = Math.min(...placed.map((tile) => tile.x - 1));
    const maxX = Math.max(...placed.map((tile) => tile.x + 1));
    const minZ = Math.min(...placed.map((tile) => tile.z - 0.87));
    const maxZ = Math.max(...placed.map((tile) => tile.z + 0.87));
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ, 2);
    const distance = span * 1.25;
    controls.target.set(centerX, 0, centerZ);
    camera.position.set(centerX + distance * 0.86, distance * 0.98, centerZ + distance * 0.86);
    camera.near = Math.max(0.03, distance / 500);
    camera.far = distance * 12;
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    controls.minDistance = 1.8;
    controls.maxDistance = distance * 5;

    const tileGroups = new Map<string, THREE.Group>();
    const outlineMaterials = new Map<string, THREE.LineBasicMaterial>();
    const actionEntries = new Map<ActionId, { matrix: THREE.Matrix4; tileId: string }[]>();
    const decorationEntries = new Map<
      string,
      {
        kind: DecorationKind;
        variant: DecorationColorVariant | null;
        items: { matrix: THREE.Matrix4; tileId: string }[];
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
      tileGroups.set(entry.id, group);
      scene.add(group);

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

      const borders = buildFieldBorders(entry.tile, surfaces.geometry, {
        openOuterEntrances: entry.config.border.enabled && entry.config.border.width > 0,
      });
      geometries.add(borders.geometry);
      const fieldInk = new THREE.MeshBasicMaterial({
        color: FIELD_BORDER_COLOR,
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
        const { size, height } = fieldSymbolLayout(entry.tile, field);
        transform.position.set(entry.x + field.center.x, height + 0.0045, entry.z + field.center.y);
        transform.rotation.set(0, 0, 0);
        transform.scale.set(size, size, size);
        transform.updateMatrix();
        const items = actionEntries.get(field.action) ?? [];
        items.push({ matrix: transform.matrix.clone(), tileId: entry.id });
        actionEntries.set(field.action, items);
      }

      if (entry.config.decoration.enabled) {
        for (const decoration of entry.tile.decorations) {
          const variant = decorationColorVariant(entry.config, decoration.kind, decoration.id);
          const key = JSON.stringify([decoration.kind, variant]);
          let colorGroup = decorationEntries.get(key);
          if (!colorGroup) {
            colorGroup = { kind: decoration.kind, variant, items: [] };
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
          colorGroup.items.push({ matrix: transform.matrix.clone(), tileId: entry.id });
        }
      }
    }

    actionEntries.forEach((items, action) => {
      const material = new THREE.MeshBasicMaterial({
        map: actionTexture(action),
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
      scene.add(mesh);
    });

    const assets = new Map(ASSET_LIBRARY.map((model) => [model.id as DecorationKind, model]));
    const voxelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    materials.add(voxelMaterial);
    decorationEntries.forEach(({ items, kind, variant }) => {
      const model = assets.get(kind);
      if (!model || !items.length) return;
      const geometry = voxelGeometry(model, variant);
      geometries.add(geometry);
      const mesh = new THREE.InstancedMesh(geometry, voxelMaterial, items.length);
      mesh.userData.tileIds = items.map((item) => item.tileId);
      items.forEach((item, index) => mesh.setMatrixAt(index, item.matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
    });

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let frame = 0;
    let disposed = false;
    let lastSelected: string | null = null;
    const render = () => {
      if (disposed) return;
      frame = requestAnimationFrame(render);
      if (lastSelected !== selected.current) {
        outlineMaterials.forEach((material, id) => {
          material.opacity = id === selected.current ? 1 : 0;
        });
        lastSelected = selected.current;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    render();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down: THREE.Vector2 | null = null;
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      down = new THREE.Vector2(event.clientX, event.clientY);
    };
    const pointerUp = (event: PointerEvent) => {
      if (!down || down.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) {
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
      const hit = raycaster.intersectObjects(scene.children, true)[0];
      if (!hit) return;
      let object: THREE.Object3D | null = hit.object;
      if (Array.isArray(object.userData.tileIds)) {
        const id = object.userData.tileIds[hit.instanceId ?? -1];
        if (typeof id === 'string') select.current(id);
        return;
      }
      while (object && !object.userData.tileId) object = object.parent;
      const id = object?.userData.tileId;
      if (typeof id === 'string') select.current(id);
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      scene.clear();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [tiles, columns]);

  useEffect(() => {
    // Kept separate from scene creation so clicking a tile does not rebuild the board.
    selected.current = selectedId;
  }, [selectedId]);

  return <div ref={host} className="bulk-series-canvas" />;
}

export default function BulkSeriesViewer(props: Props) {
  return props.mode === '2d' ? <Series2D {...props} /> : <Series3D {...props} />;
}
