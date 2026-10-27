import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildTileSurfaces, type BatchedSurfaces, type SurfaceRegion } from './surfaces';
import { decorationClearsBorder } from '../core/tile-border';
import { decorationColorVariant } from '../core/object-colors';
import type { DecorationColorVariant } from '../core/object-colors';
import type { DecorationKind, GeneratedTile, Point, TileConfig } from '../core/types';
import { actionTexture } from './icons';
import { createTileMaterial, RENDER_STYLE_VERSION, updateTileMaterial } from './material';
import { fieldSymbolLayout } from './symbols';
import { buildFieldBorders } from './borders';
import { buildTileBorder, tileBorderColor } from './tileBorder';
import { buildSelectionOutline, landscapeSelectionColor, selectionOutlineKey } from './selection';
import { renderGeometryKey, renderMaterialKey, renderSurfaceKey } from './state';
import { detectPreviewPixelRatio } from './preview';
import {
  CAMERA_TARGET,
  captureCameraState,
  captureCameraView,
  configureTileCamera,
  restoreCameraState,
  type CameraGroundPoint,
} from './camera';
import { rasterGridSegments, rasterLineGeometry, rasterSubgridSegments } from './grid';
import { ASSET_LIBRARY, syncModelSlots, voxelGeometry, type VoxelModel } from './voxels';
import { projectionRay, pickTileSurface, isSelectionClick } from './picking';
import { boardCamera, exportGlb, snapshotContent } from './modelExport';
import { setInstancePalettes } from './objectPalettes';
import { buildPathAccents } from './pathAccents';

export interface RendererCallbacks {
  onCellClick?: (cellId: string, point?: Point) => void;
  onFieldClick?: (fieldId: string) => void;
  onError?: (message: string) => void;
}

const BOTTOM = -0.16;
const TARGET = CAMERA_TARGET;
const RAD = Math.PI / 180;

function releaseGroup(
  group: THREE.Group,
  preserved?: ReadonlySet<THREE.Material>,
  preservedGeometries?: ReadonlySet<THREE.BufferGeometry>,
): void {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      if (!preservedGeometries?.has(object.geometry)) geometries.add(object.geometry);
      if (object instanceof THREE.InstancedMesh) object.dispose();
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => {
        if (preserved?.has(material)) return;
        materials.add(material);
        if (material instanceof THREE.MeshBasicMaterial && material.map) textures.add(material.map);
      });
    }
  });
  geometries.forEach((item) => item.dispose());
  materials.forEach((item) => item.dispose());
  textures.forEach((item) => item.dispose());
  group.clear();
}

export class TileRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly content = new THREE.Group();
  private readonly ground = new THREE.Group();
  private readonly selection = new THREE.Group();
  private readonly orthographic = new THREE.OrthographicCamera(-1.3, 1.3, 1.3, -1.3, 0.01, 40);
  private readonly perspective = new THREE.PerspectiveCamera(35, 1, 0.01, 40);
  private camera: THREE.Camera = this.orthographic;
  private controls: OrbitControls;
  private readonly controlsUp = new THREE.Vector3(0, 1, 0);
  private cameraGround: CameraGroundPoint[] = [];
  private pickRegions: SurfaceRegion[] = [];
  private pointerButton = -1;
  private readonly observer: ResizeObserver;
  private readonly models = new Map<string, VoxelModel>();
  private readonly modelGeometries = new Map<string, THREE.BufferGeometry>();
  private modelGeometryBuilds = 0;
  private readonly slots = new Map<DecorationKind, string>();
  private tile?: GeneratedTile;
  private config?: TileConfig;
  private width = 1;
  private height = 1;
  private pointerStart = new THREE.Vector2();
  private pointerMoved = false;
  private disposed = false;
  private exporting = false;
  private pendingFrame: number | null = null;
  private geometryKey?: string;
  private cameraKey?: string;
  private materialKey?: string;
  private selectionKey?: string;
  private selectionGeometryKey?: string;
  private selectedFieldId?: string;
  private selectionColor = '';
  private terrainGeometry?: THREE.BufferGeometry;
  private cachedSurfaces?: BatchedSurfaces;
  private cachedBorders?: THREE.BufferGeometry;
  private surfaceKey?: string;
  private surfaceRevision = 0;
  private readonly surfaceGeometries = new Set<THREE.BufferGeometry>();
  private tileBorderTriangles = 0;
  private selectedIds: readonly string[] = [];
  private modelRevision = 0;
  private geometryRevision = 0;
  private readonly preservedMaterials = new Set<THREE.Material>();
  private terrainMaterial?: THREE.MeshStandardMaterial;
  private voxelMaterial?: THREE.MeshStandardMaterial;
  private readonly iconMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly lineMaterials = new Map<string, THREE.LineBasicMaterial>();
  private readonly fieldBorderMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  private readonly tileBorderMaterial = new THREE.MeshBasicMaterial({
    color: '#000000',
    side: THREE.DoubleSide,
    toneMapped: false,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  private readonly selectionMaterial = new THREE.MeshBasicMaterial({
    color: '#ff00ff',
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: RendererCallbacks = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(detectPreviewPixelRatio(this.renderer.getContext()));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute(
      'aria-label',
      'Interaktive 3D-Kachel. Rechte Maustaste zum Drehen, Mausrad zum Zoomen, Linksklick zum Auswählen.',
    );
    this.canvas.setAttribute('role', 'img');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.container.appendChild(this.canvas);
    this.scene.add(this.ground, this.content, this.selection);
    this.preservedMaterials.add(this.fieldBorderMaterial);
    this.preservedMaterials.add(this.tileBorderMaterial);
    this.preservedMaterials.add(this.selectionMaterial);
    this.scene.add(new THREE.HemisphereLight('#fffbe9', '#626b69', 2.7));
    const sunlight = new THREE.DirectionalLight('#fff2d0', 3.2);
    sunlight.position.set(-3, 5, 3);
    this.scene.add(sunlight);
    const fill = new THREE.DirectionalLight('#cce2dc', 1.2);
    fill.position.set(3, 2, -3);
    this.scene.add(fill);
    this.controls = this.createControls(this.orthographic);
    this.canvas.addEventListener('pointerdown', this.pointerDown);
    this.canvas.addEventListener('pointermove', this.pointerMove);
    this.canvas.addEventListener('pointerup', this.pointerUp);
    this.canvas.addEventListener('contextmenu', this.contextMenu);
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.container);
    ASSET_LIBRARY.forEach((model) => this.models.set(model.id, model));
    this.addGround();
    this.resize();
  }

  private readonly contextLost = (event: Event): void => {
    event.preventDefault();
    this.callbacks.onError?.('Die 3D-Verbindung wurde unterbrochen. Bitte lade den Editor neu.');
  };

  private createControls(camera: THREE.Camera): OrbitControls {
    const controls = new OrbitControls(camera, this.canvas);
    controls.target.copy(TARGET);
    controls.enablePan = false;
    controls.mouseButtons = { LEFT: null, MIDDLE: null, RIGHT: THREE.MOUSE.ROTATE };
    controls.enableDamping = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 12;
    controls.minZoom = 0.4;
    controls.maxZoom = 3;
    controls.minPolarAngle = 0.01;
    controls.maxPolarAngle = Math.PI - 5 * RAD;
    controls.addEventListener('change', this.draw);
    return controls;
  }

  private addGround(): void {
    // Soft radial shadow anchors the island; it never appears in exports.
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return;
    const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(52,66,53,.26)');
    gradient.addColorStop(0.55, 'rgba(52,66,53,.12)');
    gradient.addColorStop(1, 'rgba(52,66,53,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 2.8),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = BOTTOM - 0.03;
    this.ground.add(plane);
  }

  registerModel(model: VoxelModel, slot?: DecorationKind): void {
    const previous = this.models.get(model.id);
    if (!previous || JSON.stringify(previous) !== JSON.stringify(model)) {
      this.modelRevision++;
      this.modelGeometries.get(model.id)?.dispose();
      this.modelGeometries.delete(model.id);
    }
    this.models.set(model.id, model);
    if (slot) this.slots.set(slot, model.id);
  }

  private lineMaterial(
    key: string,
    parameters: THREE.LineBasicMaterialParameters,
  ): THREE.LineBasicMaterial {
    let material = this.lineMaterials.get(key);
    if (!material) {
      material = new THREE.LineBasicMaterial(parameters);
      this.lineMaterials.set(key, material);
      this.preservedMaterials.add(material);
    }
    return material;
  }

  update(tile: GeneratedTile, config: TileConfig, selected?: readonly string[]): void {
    const cameraKey = JSON.stringify(config.camera);
    const cameraChanged = cameraKey !== this.cameraKey;
    this.cameraKey = cameraKey;
    this.tile = tile;
    this.config = config;
    const borderColor = tileBorderColor(config.border);
    const borderMaterialChanged =
      !!borderColor &&
      `#${this.tileBorderMaterial.color.getHexString()}` !== borderColor.toLowerCase();
    if (borderColor) this.tileBorderMaterial.color.set(borderColor);
    syncModelSlots(this.slots, config.decoration.modelSlots);
    const materialKey = renderMaterialKey(config);
    const materialChanged = materialKey !== this.materialKey;
    if (!this.terrainMaterial) {
      this.terrainMaterial = createTileMaterial(
        { vertexColors: true, roughness: 1, side: THREE.DoubleSide },
        config.terrain.texture,
        config.terrain.grain,
        config.terrain.noise.seed,
        config.paths.detail,
        config.terrain.noise.origin,
      );
      this.voxelMaterial = createTileMaterial(
        { vertexColors: true, roughness: 1 },
        config.terrain.texture,
        config.terrain.grain * 0.4,
        config.terrain.noise.seed,
        { centerLight: 0, edgeShade: 0 },
        config.terrain.noise.origin,
      );
      this.preservedMaterials.add(this.terrainMaterial);
      this.preservedMaterials.add(this.voxelMaterial);
    } else if (materialChanged) {
      updateTileMaterial(
        this.terrainMaterial,
        config.terrain.texture,
        config.terrain.grain,
        config.terrain.noise.seed,
        config.paths.detail,
        config.terrain.noise.origin,
      );
      if (this.voxelMaterial)
        updateTileMaterial(
          this.voxelMaterial,
          config.terrain.texture,
          config.terrain.grain * 0.4,
          config.terrain.noise.seed,
          { centerLight: 0, edgeShade: 0 },
          config.terrain.noise.origin,
        );
    }
    this.materialKey = materialKey;
    const geometryKey = renderGeometryKey(tile, config, this.modelRevision);
    if (geometryKey === this.geometryKey) {
      if (selected !== undefined) this.setSelection(selected, this.selectedFieldId);
      if (cameraChanged) this.setView(config.camera);
      if (materialChanged || borderMaterialChanged) this.draw();
      return;
    }
    this.geometryKey = geometryKey;
    this.geometryRevision++;
    releaseGroup(this.content, this.preservedMaterials, this.surfaceGeometries);
    const surfaceKey = renderSurfaceKey(tile, config);
    if (surfaceKey !== this.surfaceKey) {
      this.surfaceGeometries.forEach((geometry) => geometry.dispose());
      this.surfaceGeometries.clear();
      this.cachedSurfaces = buildTileSurfaces(tile, config);
      this.cachedBorders = buildFieldBorders(tile, this.cachedSurfaces.geometry).geometry;
      this.surfaceGeometries.add(this.cachedSurfaces.geometry);
      this.surfaceGeometries.add(this.cachedBorders);
      this.surfaceKey = surfaceKey;
      this.surfaceRevision++;
    }
    const surfaces = this.cachedSurfaces!;
    this.terrainGeometry = surfaces.geometry;
    this.cameraGround = surfaces.ground;
    this.pickRegions = surfaces.regions;
    this.content.add(new THREE.Mesh(surfaces.geometry, this.terrainMaterial));
    const merge = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry | undefined => {
      if (!parts.length) return undefined;
      const result = mergeGeometries(parts, false) ?? undefined;
      parts.forEach((part) => part.dispose());
      return result;
    };
    const addLines = (
      parts: THREE.BufferGeometry[],
      key: string,
      parameters: THREE.LineBasicMaterialParameters,
    ): void => {
      const joined = merge(parts);
      if (joined)
        this.content.add(new THREE.LineSegments(joined, this.lineMaterial(key, parameters)));
    };
    if (config.grid.showGrid)
      addLines([rasterLineGeometry(rasterGridSegments(tile, config.grid))], 'grid', {
        color: '#304c42',
        transparent: true,
        opacity: 0.11,
        depthWrite: false,
      });
    if (config.grid.showSubgrid)
      addLines([rasterLineGeometry(rasterSubgridSegments(tile, config.grid))], 'subgrid', {
        color: '#e4e7c5',
        transparent: true,
        opacity: 0.19,
        depthWrite: false,
      });
    this.content.add(new THREE.Mesh(this.cachedBorders, this.fieldBorderMaterial));
    const tileBorder = buildTileBorder(tile, config.border, surfaces.geometry, surfaces.regions);
    this.tileBorderTriangles = tileBorder.getAttribute('position').count / 3;
    if (this.tileBorderTriangles)
      this.content.add(new THREE.Mesh(tileBorder, this.tileBorderMaterial));
    else tileBorder.dispose();
    const iconParts = new Map<string, THREE.BufferGeometry[]>();
    const symbolLayouts = new Map<string, ReturnType<typeof fieldSymbolLayout>>();
    tile.fields.forEach((field) => {
      if (field.action === 'none') return;
      const layout = fieldSymbolLayout(tile, field);
      symbolLayouts.set(field.id, layout);
      const { center, size, height: symbolHeight } = layout;
      const part = new THREE.PlaneGeometry(size, size);
      part.rotateX(-Math.PI / 2);
      part.translate(center.x, symbolHeight + 0.0045, center.y);
      let parts = iconParts.get(field.action);
      if (!parts) {
        parts = [];
        iconParts.set(field.action, parts);
      }
      parts.push(part);
      if (!this.iconMaterials.has(field.action)) {
        const material = new THREE.MeshBasicMaterial({
          map: actionTexture(field.action),
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          forceSinglePass: true,
        });
        this.iconMaterials.set(field.action, material);
        this.preservedMaterials.add(material);
      }
    });

    iconParts.forEach((parts, action) => {
      const joined = merge(parts);
      if (joined) {
        const mesh = new THREE.Mesh(joined, this.iconMaterials.get(action));
        mesh.renderOrder = 2;
        this.content.add(mesh);
      }
    });
    if (config.decoration.enabled) {
      const groups = new Map<
        string,
        {
          modelId: string;
          variants: (DecorationColorVariant | null)[];
          items: GeneratedTile['decorations'];
        }
      >();
      tile.decorations.forEach((decoration) => {
        if (
          !decorationClearsBorder(
            config,
            decoration.position,
            decoration.scale,
            decoration.rotation,
          )
        )
          return;
        const modelId = this.slots.get(decoration.kind) ?? decoration.kind;
        const variant = decorationColorVariant(config, decoration.kind, decoration.id);
        const key = modelId;
        let group = groups.get(key);
        if (!group) {
          group = { modelId, variants: [], items: [] };
          groups.set(key, group);
        }
        group.items.push(decoration);
        group.variants.push(variant);
      });
      const transform = new THREE.Object3D();
      groups.forEach(({ modelId, variants, items }) => {
        const model = this.models.get(modelId) ?? this.models.get(items[0]?.kind ?? 'tree');
        if (!model) return;
        let template = this.modelGeometries.get(model.id);
        if (!template) {
          template = voxelGeometry(model);
          this.modelGeometries.set(model.id, template);
          this.modelGeometryBuilds++;
        }
        // Instances own their attributes and GPU buffers; templates stay CPU-only.
        const geometry = template.clone();
        setInstancePalettes(geometry, variants);
        const mesh = new THREE.InstancedMesh(geometry, this.voxelMaterial, items.length);
        items.forEach((item, i) => {
          transform.position.set(item.position.x, item.height, item.position.y);
          transform.rotation.set(0, item.rotation * RAD, 0);
          transform.scale.setScalar(item.scale);
          transform.updateMatrix();
          mesh.setMatrixAt(i, transform.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.content.add(mesh);
      });
    }
    if (tile.pathDetails?.length) {
      const accents = buildPathAccents(tile, config, symbolLayouts);
      const pebble = new THREE.IcosahedronGeometry(1, 0);
      const colors: number[] = [];
      const rgb = new THREE.Color('#a89f8a');
      for (let i = 0; i < pebble.getAttribute('position').count; i++)
        colors.push(rgb.r, rgb.g, rgb.b);
      pebble.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const mesh = new THREE.InstancedMesh(pebble, this.voxelMaterial, accents.length),
        transform = new THREE.Object3D();
      accents.forEach((item, i) => {
        transform.position.set(item.position.x, item.height + item.scale * 0.3, item.position.y);
        transform.rotation.set(0, item.rotation * RAD, 0);
        transform.scale.set(item.scale * 0.5, item.scale * 0.3, item.scale * 0.38);
        transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.content.add(mesh);
    }
    this.selectionKey = undefined;
    this.setSelection(selected ?? this.selectedIds, this.selectedFieldId);
    if (cameraChanged || config.camera.mode !== 'orbit') this.setView(config.camera);
    this.draw();
  }

  setSelection(ids: readonly string[], fieldId?: string): void {
    const color = this.tile ? landscapeSelectionColor(this.tile) : '#ff00ff';
    const key = selectionOutlineKey(ids, fieldId, this.geometryRevision, color);
    if (key === this.selectionKey) return;
    this.selectionKey = key;
    this.selectedIds = [...new Set(ids)];
    this.selectedFieldId = fieldId;
    this.selectionMaterial.color.set(color);
    const geometryKey = selectionOutlineKey(ids, fieldId, this.geometryRevision);
    if (geometryKey !== this.selectionGeometryKey) {
      this.selectionGeometryKey = geometryKey;
      releaseGroup(this.selection, this.preservedMaterials);
      if (this.tile && (ids.length || fieldId)) {
        const { geometry } = buildSelectionOutline(this.tile, ids, fieldId, this.terrainGeometry);
        if (geometry.getAttribute('position').count) {
          const mesh = new THREE.Mesh(geometry, this.selectionMaterial);
          // Cover the ordinary ink at exactly the same union boundary while preserving occlusion.
          mesh.position.y = 0.001;
          mesh.renderOrder = 5;
          this.selection.add(mesh);
        } else geometry.dispose();
      }
    }
    this.selectionColor = this.selection.children.length ? color : '';
    this.draw();
  }

  setView(view: TileConfig['camera']): void {
    this.camera = configureTileCamera(
      this.orthographic,
      this.perspective,
      view,
      this.width / this.height,
      this.exporting,
      this.cameraGround,
    );
    // OrbitControls caches the camera's up axis at construction; overhead pan uses a different axis.
    if (!this.controlsUp.equals(this.camera.up)) {
      this.controls.removeEventListener('change', this.draw);
      this.controls.dispose();
      this.controls = this.createControls(this.camera);
      this.controlsUp.copy(this.camera.up);
    }
    this.controls.object = this.camera;
    this.controls.target.copy(TARGET);
    this.controls.enabled = !this.exporting && view.mode !== 'perspective';
    this.controls.enableRotate = view.mode === 'orbit';
    this.controls.enablePan = view.mode === 'top';
    this.controls.screenSpacePanning = true;
    this.controls.mouseButtons = {
      LEFT: view.mode === 'top' ? THREE.MOUSE.PAN : null,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: view.mode === 'top' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
    };
    this.controls.touches.ONE = view.mode === 'top' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.canvas.setAttribute(
      'aria-label',
      view.mode === 'top'
        ? 'Interaktive 2D-Kachel. Ziehen zum Verschieben, Mausrad zum Zoomen, Linksklick zum Auswählen.'
        : 'Interaktive 3D-Kachel. Rechte Maustaste zum Drehen, Mausrad zum Zoomen, Linksklick zum Auswählen.',
    );
    if (this.controls.enabled) this.controls.update();
    this.draw();
  }

  captureView(): TileConfig['camera'] {
    if (!this.config) throw new Error('Noch keine Kamera zum Übernehmen vorhanden.');
    return captureCameraView(this.camera, this.config.camera);
  }

  resetView(): void {
    if (this.config) this.setView(this.config.camera);
  }

  resize(): void {
    if (this.disposed || this.exporting) return;
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    if (this.config) this.setView(this.config.camera);
    this.draw();
  }

  private readonly draw = (): void => {
    if (this.disposed || this.pendingFrame !== null) return;
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = null;
      this.renderNow();
    });
  };

  private renderNow(): void {
    if (this.pendingFrame !== null) {
      cancelAnimationFrame(this.pendingFrame);
      this.pendingFrame = null;
    }
    if (!this.disposed) {
      this.renderer.render(this.scene, this.camera);
      const diagnostics = this.getDiagnostics();
      this.canvas.dataset.drawCalls = String(diagnostics.drawCalls);
      this.canvas.dataset.triangles = String(diagnostics.triangles);
      this.canvas.dataset.sceneObjects = String(diagnostics.sceneObjects);
      this.canvas.dataset.geometryRevision = String(this.geometryRevision);
      this.canvas.dataset.pixelRatio = String(diagnostics.pixelRatio);
      this.canvas.dataset.selectedField = diagnostics.selectedField;
      this.canvas.dataset.selectionColor = diagnostics.selectionColor;
      this.canvas.dataset.selectionCells = String(diagnostics.selectionCells);
      this.canvas.dataset.selectionVisible = String(diagnostics.selectionVisible);
      this.canvas.dataset.tileBorderTriangles = String(diagnostics.tileBorderTriangles);
      this.canvas.dataset.tileBorderColor = diagnostics.tileBorderColor;
      this.canvas.dataset.tileBorderMode = diagnostics.tileBorderMode;
      this.canvas.dataset.modelGeometryBuilds = String(diagnostics.modelGeometryBuilds);
      this.canvas.dataset.cameraZoom = String(this.orthographic.zoom);
      this.canvas.dataset.cameraX = String(this.camera.position.x);
      this.canvas.dataset.cameraZ = String(this.camera.position.z);
      this.canvas.dataset.surfaceRevision = String(diagnostics.surfaceRevision);
      this.canvas.dataset.renderStyleVersion = String(RENDER_STYLE_VERSION);
    }
  }

  private readonly pointerDown = (event: PointerEvent): void => {
    this.pointerButton = event.button;
    this.pointerStart.set(event.clientX, event.clientY);
    this.pointerMoved = false;
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    if (
      event.buttons &&
      this.pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5
    )
      this.pointerMoved = true;
  };

  private readonly contextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    if (
      !this.tile ||
      this.pointerMoved ||
      !isSelectionClick(
        { x: this.pointerStart.x, y: this.pointerStart.y, button: this.pointerButton },
        { x: event.clientX, y: event.clientY, button: event.button },
      )
    )
      return;
    const rectangle = this.canvas.getBoundingClientRect();
    const pointer = {
      x: ((event.clientX - rectangle.left) / rectangle.width) * 2 - 1,
      y: (-(event.clientY - rectangle.top) / rectangle.height) * 2 + 1,
    };
    const result = pickTileSurface(
      projectionRay(this.camera, pointer),
      this.tile,
      this.pickRegions,
    );
    if (!result) return;
    if (result.cellId) this.callbacks.onCellClick?.(result.cellId, result.point);
    if (result.fieldId) this.callbacks.onFieldClick?.(result.fieldId);
  };

  getDiagnostics(): {
    drawCalls: number;
    triangles: number;
    sceneObjects: number;
    programs: number;
    pixelRatio: number;
    selectedField: string;
    selectionColor: string;
    selectionCells: number;
    selectionVisible: boolean;
    tileBorderTriangles: number;
    tileBorderColor: string;
    tileBorderMode: string;
    modelGeometryBuilds: number;
    surfaceRevision: number;
  } {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      sceneObjects: this.content.children.length,
      programs: this.renderer.info.programs?.length ?? 0,
      pixelRatio: this.renderer.getPixelRatio(),
      selectedField: this.selection.children.length ? (this.selectedFieldId ?? '') : '',
      selectionColor: this.selectionColor,
      selectionCells: this.selectedIds.length,
      selectionVisible: this.selection.visible && this.selection.children.length > 0,
      tileBorderTriangles: this.tileBorderTriangles,
      tileBorderColor: this.tileBorderTriangles
        ? `#${this.tileBorderMaterial.color.getHexString()}`
        : '',
      tileBorderMode: this.tileBorderTriangles ? (this.config?.border.mode ?? '') : '',
      modelGeometryBuilds: this.modelGeometryBuilds,
      surfaceRevision: this.surfaceRevision,
    };
  }

  exportGlb(content: THREE.Group): Promise<Blob> {
    return exportGlb(content, this.renderer);
  }

  snapshotForExport(x = 0, z = 0): THREE.Group {
    const config = this.config;
    if (!config) throw new Error('Noch keine Kachel zum Exportieren vorhanden.');
    const group = snapshotContent(this.content, (material) => {
      if (material === this.terrainMaterial || material === this.voxelMaterial) {
        const terrain = material === this.terrainMaterial;
        return createTileMaterial(
          { vertexColors: true, roughness: 1, side: material.side },
          config.terrain.texture,
          config.terrain.grain * (terrain ? 1 : 0.4),
          config.terrain.noise.seed,
          terrain ? config.paths.detail : { centerLight: 0, edgeShade: 0 },
          { x: config.terrain.noise.origin.x - x, y: config.terrain.noise.origin.y - z },
        );
      }
      return material.clone();
    });
    group.name = config.name;
    group.userData.renderStyleVersion = RENDER_STYLE_VERSION;
    group.children[0]!.name = 'Terrain und Spielfelder';
    group.position.set(x, 0, z);
    return group;
  }

  async exportBoardPng(
    board: THREE.Group,
    size: number,
    transparent: boolean,
    view: TileConfig['camera'],
  ): Promise<Blob> {
    const scene = new THREE.Scene();
    scene.background = transparent ? null : new THREE.Color('#eeede4');
    this.scene.children.forEach((child) => {
      if (child instanceof THREE.Light) scene.add(child.clone());
    });
    const previousParent = board.parent;
    scene.add(board);
    const previousPixelRatio = this.renderer.getPixelRatio();
    try {
      const camera = boardCamera(board, view);
      this.exporting = true;
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(size, size, false);
      this.renderer.setClearAlpha(transparent ? 0 : 1);
      this.renderer.render(scene, camera);
      return await new Promise<Blob>((resolve, reject) =>
        this.canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Gesamtbild-Export fehlgeschlagen.'))),
          'image/png',
        ),
      );
    } finally {
      board.removeFromParent();
      previousParent?.add(board);
      this.exporting = false;
      this.renderer.setPixelRatio(previousPixelRatio);
      this.renderer.setSize(this.width, this.height, false);
      this.renderer.setClearAlpha(0);
      this.resize();
    }
  }

  async exportPng(
    size: number,
    transparent: boolean,
    view: TileConfig['camera'] = this.config?.camera ?? {
      mode: 'top',
      azimuth: 0,
      elevation: 90,
      fov: 0,
      zoom: 1,
    },
  ): Promise<Blob> {
    if (!this.config) throw new Error('Noch keine Kachel zum Exportieren vorhanden.');
    const previousPixelRatio = this.renderer.getPixelRatio();
    const previousWidth = this.width,
      previousHeight = this.height;
    const cameraState = captureCameraState(this.camera);
    const controlsTarget = this.controls.target.clone();
    const configuredCameraKey = JSON.stringify(this.config.camera);
    const exportGeometryRevision = this.geometryRevision;
    const previousBackground = this.scene.background;
    const previousGround = this.ground.visible,
      previousSelection = this.selection.visible;
    try {
      this.exporting = true;
      this.width = size;
      this.height = size;
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(size, size, false);
      this.scene.background = transparent ? null : new THREE.Color('#eeede4');
      this.renderer.setClearAlpha(transparent ? 0 : 1);
      this.ground.visible = false;
      this.selection.visible = false;
      // The saved config, rather than transient orbit gestures, defines reproducible output.
      this.setView(view);
      this.renderNow();
      const result = await new Promise<Blob>((resolve, reject) =>
        this.canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('PNG-Export fehlgeschlagen.'))),
          'image/png',
        ),
      );
      return result;
    } finally {
      this.exporting = false;
      this.width = this.container.clientWidth > 0 ? this.container.clientWidth : previousWidth;
      this.height = this.container.clientHeight > 0 ? this.container.clientHeight : previousHeight;
      this.renderer.setPixelRatio(previousPixelRatio);
      this.renderer.setSize(this.width, this.height, false);
      this.scene.background = previousBackground;
      this.renderer.setClearAlpha(0);
      this.ground.visible = previousGround;
      this.selection.visible = previousSelection;
      this.setView(this.config.camera);
      if (
        JSON.stringify(this.config.camera) === configuredCameraKey &&
        (this.config.camera.mode === 'orbit' || this.geometryRevision === exportGeometryRevision)
      ) {
        restoreCameraState(this.camera, cameraState);
        this.controls.target.copy(controlsTarget);
      }
      this.renderNow();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pendingFrame !== null) cancelAnimationFrame(this.pendingFrame);
    this.observer.disconnect();
    this.controls.removeEventListener('change', this.draw);
    this.controls.dispose();
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('contextmenu', this.contextMenu);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    releaseGroup(this.content, this.preservedMaterials, this.surfaceGeometries);
    this.surfaceGeometries.forEach((geometry) => geometry.dispose());
    this.surfaceGeometries.clear();
    releaseGroup(this.selection, this.preservedMaterials);
    releaseGroup(this.ground);
    this.iconMaterials.forEach((material) => material.map?.dispose());
    this.preservedMaterials.forEach((material) => material.dispose());
    this.preservedMaterials.clear();
    this.iconMaterials.clear();
    this.lineMaterials.clear();
    this.modelGeometries.forEach((geometry) => geometry.dispose());
    this.modelGeometries.clear();
    this.models.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
