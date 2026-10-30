import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Grid3X3,
  Hexagon,
  Layers3,
  Leaf,
  LoaderCircle,
  Map,
  Maximize2,
  MousePointer2,
  Move3D,
  Redo2,
  RotateCcw,
  Save,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Undo2,
  X,
} from 'lucide-react';
import {
  decorationSlots,
  decorationClearsBorder,
  decorationScale,
  inTileBorder,
  isResource,
  migrateConfig,
  placementPoint,
  polygonArea,
  prepareFieldShapeEdit,
  validateFieldShapeSelection,
  evaluateTileRules,
  getExportRuleIssues,
  prepareCenterEdit,
  rollFieldActions,
  applyBiomePreset,
  adjustFieldShapeLine,
  BIOME_PRESETS,
  shuffleBulkProject,
  syncBulkTile,
} from './core';
import { ZodError } from 'zod';
import { DECORATION_CATALOG } from './core/objects';
import { builtinObjectPreviewUrl, voxelPreviewUrl } from './render/objectPreview';
import type { ActionId, DecorationKind, GeneratedTile, Point, TileConfig } from './core/types';
import type { BulkProject } from './core';
import type { BiomePresetId } from './core/biomes';
import type { FieldShapeAxis } from './core/field-edit';
import type { TileRenderer } from './render';
import Inspector from './components/Inspector';
import type { Layer, LibraryEntry } from './components/Inspector';
import Viewport from './components/Viewport';
import QuickActions from './components/QuickActions';
import BulkWorkspace from './components/BulkWorkspace';
import { useProject } from './useProject';
import { useTile } from './useTile';
import { useActionProbabilities } from './editor/useActionProbabilities';
import { isDefaultActionProbabilities } from './core/action-probabilities';
import { loadStoredBulkProject, saveStoredBulkProject } from './editor/bulkStorage';
import {
  archiveTilePath,
  archiveBoardPath,
  PngArchiveWriter,
  type BulkExportOption,
} from './editor/bulkArchive';
import { Group } from 'three';
import { boardOrigin } from './core/bulk';
import { disposeExportContent } from './render/modelExport';

const LAYERS = [
  { id: 'grid' as const, title: 'Raster', subtitle: 'Die Grundlage', icon: Grid3X3 },
  { id: 'terrain' as const, title: 'Landschaft', subtitle: 'Höhen & Farben', icon: Leaf },
  { id: 'paths' as const, title: 'Wege', subtitle: 'Verbindungen schaffen', icon: Map },
  {
    id: 'actions' as const,
    title: 'Feldaktionen',
    subtitle: 'Dem Spiel Sinn geben',
    icon: Sparkles,
  },
  { id: 'objects' as const, title: 'Objekte', subtitle: 'Details & Leben', icon: Sprout },
  { id: 'export' as const, title: 'Export', subtitle: 'Bereit fürs Spiel', icon: ArrowUpRight },
];
const BUILTINS: LibraryEntry[] = DECORATION_CATALOG.map((entry) => ({
  id: entry.kind,
  name: entry.label,
  builtin: true,
  preview: builtinObjectPreviewUrl(entry.kind),
}));
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function readResponse<T>(response: Response): Promise<T> {
  const result: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result === 'object' && result !== null && 'error' in result
        ? String(result.error)
        : `Anfrage fehlgeschlagen (${response.status}).`,
    );
  return result as T;
}
function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
export default function App() {
  const probabilities = useActionProbabilities();
  const actionDistribution = isDefaultActionProbabilities(probabilities.profile.probabilities)
    ? undefined
    : probabilities.profile.probabilities;
  const {
    config,
    update,
    replace,
    load,
    undo,
    redo,
    canUndo,
    canRedo,
    remember,
    storageError,
    migrationNotice,
  } = useProject();
  const {
    tile,
    editable,
    fieldEditable,
    pending: generationPending,
    error: generationError,
    buildProject,
    buildBulkProject,
    validateTile,
  } = useTile(config);
  const [bulkProject, setBulkProject] = useState(() => {
    try {
      return loadStoredBulkProject(localStorage);
    } catch {
      return loadStoredBulkProject(null);
    }
  });
  const [workspaceMode, setWorkspaceMode] = useState<'tile' | 'bulk'>(() =>
    bulkProject ? 'bulk' : 'tile',
  );
  const [activeBulkTileId, setActiveBulkTileId] = useState<string | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [bulkExportProgress, setBulkExportProgress] = useState<{
    done: number;
    total: number;
    mode: 'zip' | 'working';
  } | null>(null);
  const [layer, setLayer] = useState<Layer>('grid');
  const [selection, setSelection] = useState<string[]>([]);
  const [fieldId, setFieldId] = useState<string>('center');
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<'fields' | 'objects' | null>(null);
  const [objectKind, setObjectKind] = useState<DecorationKind>('tree');
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [models, setModels] = useState<LibraryEntry[]>(BUILTINS);
  const [busy, setBusy] = useState(false);
  const currentConfig = useRef(config);
  const fieldValidation = useRef(0);
  useEffect(() => {
    currentConfig.current = config;
  }, [config]);
  useEffect(() => {
    if (workspaceMode !== 'tile' || !activeBulkTileId) return;
    if (!bulkProject) return;
    const tileConfig = bulkProject.tiles.find((tile) => tile.id === activeBulkTileId)?.config;
    if (!tileConfig || JSON.stringify(tileConfig) === JSON.stringify(config)) return;
    saveStoredBulkProject(localStorage, syncBulkTile(bulkProject, activeBulkTileId, config));
  }, [config, workspaceMode, activeBulkTileId, bulkProject]);
  useEffect(() => {
    if (!bulkProject) return;
    saveStoredBulkProject(localStorage, bulkProject);
  }, [bulkProject]);
  const [loadedModels, setLoadedModels] = useState<Set<string>>(
    () => new Set(BUILTINS.map((m) => m.id)),
  );
  const requiredModels = Object.values(config.decoration.modelSlots ?? {}).filter(
    (id): id is string => !!id,
  );
  const assetsReady = requiredModels.every((id) => loadedModels.has(id));
  const [notification, setNotification] = useState<{ message: string; error: boolean } | null>(
    () => (migrationNotice ? { message: migrationNotice, error: false } : null),
  );
  const [renderError, setRenderError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [library, setLibrary] = useState<
    { id: string; name: string; seed: string; pngUrl: string }[] | null
  >(null);
  const renderer = useRef<TileRenderer | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const selectedField = tile.fields.find((f) => f.id === fieldId);
  const [fieldCommitError, setFieldCommitError] = useState<{
    selection: string[];
    config: typeof config;
    message: string;
  } | null>(null);
  const selectionArea = useMemo(() => {
    const selected = new Set(selection);
    return tile.cells.reduce(
      (sum, cell) =>
        selected.has(cell.id)
          ? sum + cell.surfacePolygons.reduce((area, polygon) => area + polygonArea(polygon), 0)
          : sum,
      0,
    );
  }, [tile, selection]);
  const shapeLineCounts = useMemo(() => {
    const selected = new Set(selection),
      points = tile.cells
        .filter((cell) => selected.has(cell.id))
        .map((cell) => cell.rasterCenter ?? cell.center);
    return {
      horizontal: new Set(points.map((point) => point.y.toFixed(6))).size,
      vertical: new Set(points.map((point) => point.x.toFixed(6))).size,
    };
  }, [tile, selection]);
  const selectionStatus = useMemo(() => {
    if (placing !== 'fields') return { issue: null, warnings: [] as string[] };
    try {
      const result = validateFieldShapeSelection(config, tile, editingFieldId, selection);
      return { issue: null, warnings: result.warnings.map((warning) => warning.message) };
    } catch (error) {
      return {
        issue: error instanceof Error ? error.message : 'Die Auswahl kann nicht übernommen werden.',
        warnings: [] as string[],
      };
    }
  }, [config, tile, editingFieldId, placing, selection]);
  const fieldIssue =
    fieldCommitError?.selection === selection && fieldCommitError.config === config
      ? fieldCommitError.message
      : selectionStatus.issue;
  const fieldApplyDisabled = busy || !editable || !selection.length || !!fieldIssue;
  const ruleIssues = useMemo(
    () => (tile.cells.length ? evaluateTileRules(config, tile) : []),
    [config, tile],
  );
  const exportIssues = useMemo(
    () => (tile.cells.length ? getExportRuleIssues(config, tile) : []),
    [config, tile],
  );
  const exportDisabled =
    busy ||
    generationPending ||
    !!generationError ||
    !assetsReady ||
    !!renderError ||
    !!exportIssues.length;
  const notify = useCallback(
    (message: string, error = false) => setNotification({ message, error }),
    [],
  );
  const cancelPlacement = useCallback(() => {
    fieldValidation.current++;
    setPlacing(null);
    setSelection([]);
    setEditingFieldId(null);
  }, []);
  useEffect(() => {
    const persist = () => remember(config);
    const timer = setTimeout(persist, 400);
    window.addEventListener('pagehide', persist);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', persist);
    };
  }, [config, remember]);
  useEffect(() => {
    if (!notification || notification.message === migrationNotice) return;
    const timer = setTimeout(() => setNotification(null), 6000);
    return () => clearTimeout(timer);
  }, [notification, migrationNotice]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/models', { signal: controller.signal })
      .then((r) => readResponse<LibraryEntry[]>(r))
      .then((entries) =>
        setModels((previous) =>
          [
            ...BUILTINS,
            ...entries.filter(
              (entry) => !entry.builtin && !BUILTINS.some((builtin) => builtin.id === entry.id),
            ),
          ].map((entry) => ({
            ...entry,
            preview:
              entry.preview ?? previous.find((existing) => existing.id === entry.id)?.preview,
          })),
        ),
      )
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        cancelPlacement();
        setHelp(false);
        setLibrary(null);
        return;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [undo, redo, cancelPlacement]);
  const pickCell = (id: string, point?: Point) => {
    if (!editable || busy) return;
    const cell = tile.cells.find((cell) => cell.id === id);
    if (!cell) return;
    if (placing === 'fields') {
      if (!cell.surfacePolygons.length) {
        notify('Das Pentagon wird über seine Formregler bearbeitet und bleibt reserviert.', true);
        return;
      }
      if (cell.landscapeOnly) {
        notify(
          'Die Ecken am Pentagon bleiben Landschaft. Wähle Zellen an den mittigen Anschlüssen.',
          true,
        );
        return;
      }
      if (cell.fieldId && cell.fieldId !== editingFieldId) {
        notify(
          'Dieses Rasterstück gehört zu einem anderen Spielfeld. Wähle freie Landschaft.',
          true,
        );
        return;
      }
      if (
        editingFieldId &&
        selection.includes(id) &&
        tile.entrances.some(
          (entrance) => entrance.fieldId === editingFieldId && entrance.cellIds.includes(id),
        )
      ) {
        notify(
          'Die mittigen Eingangszellen bleiben fest. Die Form dahinter kannst du ändern.',
          true,
        );
        return;
      }
      setSelection((previous) =>
        previous.includes(id) ? previous.filter((v) => v !== id) : [...previous, id],
      );
      return;
    }
    if (placing === 'objects') {
      if (cell.fieldId || cell.reserved) {
        notify('Objekte brauchen eine freie Landschaftszelle.', true);
        return;
      }
      const click = point ?? cell.center;
      if (inTileBorder(config, click)) {
        notify('Die Randzone bleibt frei von Objekten. Wähle einen Punkt weiter innen.', true);
        return;
      }
      const candidates = decorationSlots(cell, config.grid).sort(
        (a, b) =>
          Math.hypot(a.position.x - click.x, a.position.y - click.y) -
          Math.hypot(b.position.x - click.x, b.position.y - click.y),
      );
      const offset = candidates[0]?.offset ?? { x: 0, y: 0 };
      const idNew = `placed-${crypto.randomUUID().slice(0, 12)}`;
      if (
        !decorationClearsBorder(
          config,
          placementPoint(cell, offset),
          decorationScale(config, objectKind, idNew, 0.8),
          0,
        )
      ) {
        notify('Das Objekt würde in die Randlinie ragen. Wähle einen Punkt weiter innen.', true);
        return;
      }
      const existing = config.decoration.placements.find(
        (p) => p.cellId === id && Math.hypot(p.offset.x - offset.x, p.offset.y - offset.y) < 0.001,
      );
      if (existing) {
        setSelectedObject(existing.id);
        notify('Dieses Subrasterfeld ist belegt. Du kannst das Objekt entfernen.');
        return;
      }
      update((d) => {
        d.decoration.enabled = true;
        d.decoration.placements.push({
          id: idNew,
          kind: objectKind,
          cellId: id,
          offset,
          scale: 0.8,
          rotation: 0,
        });
      });
      setSelectedObject(idNew);
      return;
    }
    const objects = config.decoration.placements.filter((object) => object.cellId === cell.id);
    if (objects.length) {
      const clicked = point ?? cell.center;
      objects.sort((a, b) => {
        const pa = placementPoint(cell, a.offset),
          pb = placementPoint(cell, b.offset);
        return (
          Math.hypot(pa.x - clicked.x, pa.y - clicked.y) -
          Math.hypot(pb.x - clicked.x, pb.y - clicked.y)
        );
      });
      setSelectedObject(objects[0].id);
      setLayer('objects');
      return;
    }
    if (cell.fieldId) {
      setFieldId(cell.fieldId);
      setLayer('actions');
    }
  };
  const createField = async () => {
    if (!editable || busy) return;
    const ids = new Set(selection);
    if (!ids.size) return;
    const previous = tile.fields.find((field) => field.id === editingFieldId);
    const id = editingFieldId ?? `field-${crypto.randomUUID().slice(0, 12)}`;
    const fail = (message: string) => {
      setFieldCommitError({ selection, config, message });
      notify(message, true);
    };
    setBusy(true);
    try {
      const draft = prepareFieldShapeEdit(config, tile, id, selection);
      const revision = ++fieldValidation.current;
      const preview = await validateTile(draft);
      if (fieldValidation.current !== revision) return;
      if (currentConfig.current !== config) {
        fail('Das Projekt wurde inzwischen geändert. Die Feldform wurde nicht übernommen.');
        return;
      }
      const candidates = preview.fields.filter((field) => field.id === id);
      if (
        candidates.length !== 1 ||
        candidates[0].cellIds.length !== selection.length ||
        !candidates[0].cellIds.every((cellId) => ids.has(cellId))
      ) {
        fail(
          preview.warnings.find(
            (warning) => warning.includes(id) || (!!previous && warning.includes(previous.label)),
          ) ??
            'Diese Feldform verletzt die Anschlussregeln. Übernimm den mittigen Pentagon-Anschluss vollständig und lasse die Eckzonen frei.',
        );
        return;
      }
      const stableOthers = tile.fields.every((field) => {
        if (field.id === id) return true;
        const next = preview.fields.find((candidate) => candidate.id === field.id);
        return (
          next &&
          next.cellIds.length === field.cellIds.length &&
          next.cellIds.every((cellId) => field.cellIds.includes(cellId))
        );
      });
      if (!stableOthers || preview.fields.length !== tile.fields.length + (previous ? 0 : 1)) {
        fail('Die Änderung würde ein anderes Spielfeld verändern und wurde nicht übernommen.');
        return;
      }
      replace(draft);
      setFieldId(id);
      setSelection([]);
      setPlacing(null);
      setEditingFieldId(null);
      setLayer('actions');
      const removedObjects =
        config.decoration.placements.length - draft.decoration.placements.length;
      notify(
        (previous ? 'Feldform angepasst.' : 'Spielfeld erstellt.') +
          (removedObjects ? ` ${removedObjects} überdeckte Objekte entfernt.` : ''),
      );
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Feldform konnte nicht geprüft werden.');
    } finally {
      setBusy(false);
    }
  };
  const editFieldShape = () => {
    if (!selectedField || selectedField.isCenter || !editable || busy) return;
    setEditingFieldId(selectedField.id);
    setSelection([...selectedField.cellIds]);
    setLayer('paths');
    setPlacing('fields');
  };
  const adjustShapeLine = (axis: FieldShapeAxis, direction: -1 | 1) => {
    if (placing !== 'fields' || busy) return;
    const next = adjustFieldShapeLine(tile, selection, axis, direction, editingFieldId);
    if (next.length === selection.length && next.every((id) => selection.includes(id))) {
      notify(
        direction > 0
          ? `Am ${axis === 'horizontal' ? 'horizontalen' : 'vertikalen'} Rand ist keine freie Rasterlinie verfügbar.`
          : `Am ${axis === 'horizontal' ? 'horizontalen' : 'vertikalen'} Rand kann keine verbundene Rasterlinie entfernt werden.`,
        true,
      );
      return;
    }
    setSelection(next);
  };
  const newField = () => {
    if (!editable || busy) return;
    cancelPlacement();
    setSelectedObject(null);
    setLayer('paths');
    setPlacing('fields');
  };
  const editCenter = (change: (center: typeof config.center) => void) => {
    if (busy || !tile.cells.length) return;
    try {
      const center = structuredClone(config.center);
      change(center);
      const draft = prepareCenterEdit(config, tile, center);
      cancelPlacement();
      replace(draft);
      if (config.editing.regeneratePathsOnCenterChange) setFieldId('center');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Die Pentagonform konnte nicht geändert werden.',
        true,
      );
    }
  };
  const randomizeActions = () => {
    if (busy || !fieldEditable) return;
    try {
      if (!probabilities.ready)
        throw new Error('Die globale Aktionsverteilung ist noch nicht verfügbar.');
      replace(rollFieldActions(config, tile, probabilities.profile.probabilities));
      notify('Aktionen aller Spielfelder gewürfelt.');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Aktionen konnten nicht gewürfelt werden.',
        true,
      );
    }
  };
  const applyBiome = (id: BiomePresetId) => {
    if (busy || !editable) return;
    try {
      const next = applyBiomePreset(config, id);
      replace(next);
      notify(
        `Biomprofil „${BIOME_PRESETS.find((preset) => preset.id === id)!.name}“ angewendet. Unpassende Objektplatzierungen wurden entfernt; Rückgängig stellt sie wieder her.`,
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Das Biomprofil konnte nicht angewendet werden.',
        true,
      );
    }
  };
  const generateProject = async (seed: string) => {
    if (busy) return;
    setBusy(true);
    try {
      if (!probabilities.ready)
        throw new Error('Die globale Aktionsverteilung ist noch nicht verfügbar.');
      const next = await buildProject(seed, {
        camera: config.camera,
        export: config.export,
        fieldCount: config.paths.fieldCount,
        grid: config.grid,
        heightMode: config.paths.heightMode,
        centerPortalWidth: config.center.portalWidth,
        rules: config.rules,
        border: config.border,
        editing: config.editing,
        actions: { ...config.actions, distribution: actionDistribution },
      });
      if (currentConfig.current !== config) {
        notify(
          'Das Projekt wurde inzwischen geändert. Die Seed-Kachel wurde nicht übernommen.',
          true,
        );
        return;
      }
      replace(next);
      setSelection([]);
      setPlacing(null);
      setEditingFieldId(null);
      setFieldId('center');
      setSelectedObject(null);
      notify(
        'Komplette Kachel aus Seed erstellt. Spielfelder, Aktionen und Objekte sind jetzt einzeln bearbeitbar.',
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Die Kachel konnte nicht generiert werden.',
        true,
      );
    } finally {
      setBusy(false);
    }
  };
  const setField = (value: {
    action?: ActionId;
    resourceAmount?: number;
    color?: string;
    label?: string;
    heightOffset?: number;
    heightMode?: 'flat' | 'terraced';
  }) => {
    if (!selectedField || !fieldEditable || busy) return;
    update((d) => {
      const existing = d.paths.fields.find((f) => f.id === selectedField.id);
      if (existing) Object.assign(existing, value);
      else
        d.paths.fields.push({
          id: selectedField.id,
          cellIds: [],
          action: selectedField.action,
          ...(selectedField.resourceAmount !== undefined
            ? { resourceAmount: selectedField.resourceAmount }
            : {}),
          ...value,
        });
      const edit = d.paths.fields.find((f) => f.id === selectedField.id)!;
      if (value.action !== undefined) {
        if (isResource(value.action))
          edit.resourceAmount = value.resourceAmount ?? selectedField.resourceAmount ?? 1;
        else delete edit.resourceAmount;
      }
    });
  };
  const exportConfig = () =>
    downloadBlob(
      new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }),
      `${config.name}.json`,
    );
  const importConfig = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Konfiguration darf höchstens 2 MB groß sein.');
      const parsed = migrateConfig(JSON.parse(await file.text()));
      replace(parsed.config);
      setSelection([]);
      setPlacing(null);
      setFieldId('center');
      setEditingFieldId(null);
      setSelectedObject(null);
      notify(parsed.migrated ? parsed.notices.join(' ') : 'Konfiguration geladen.');
    } catch (error) {
      notify(
        `Ungültige Konfiguration: ${error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : 'Import fehlgeschlagen.'}`,
        true,
      );
    }
  };
  const renderPng = async (save: boolean) => {
    if (!renderer.current || busy || !assetsReady || generationPending || generationError) return;
    if (exportIssues.length) {
      notify(
        `Export durch Prüfregeln gesperrt: ${exportIssues.map((issue) => issue.message).join(' ')}`,
        true,
      );
      return;
    }
    setBusy(true);
    try {
      renderer.current.update(tile, config, selection);
      const blob = await renderer.current.exportPng(config.export.size, config.export.transparent);
      if (save) {
        const result = await readResponse<{ path: string; existing: boolean }>(
          await fetch('/api/tiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config, png: await blobDataUrl(blob) }),
          }),
        );
        notify(`${result.existing ? 'Bereits gespeichert' : 'Gespeichert'}: ${result.path}`);
      } else {
        downloadBlob(blob, `${config.name}-${config.seed.replace(/[^a-z\d_-]/gi, '_')}.png`);
        notify('PNG exportiert.');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Export fehlgeschlagen.', true);
    } finally {
      setBusy(false);
    }
  };
  const renderModel = async () => {
    if (!renderer.current || exportDisabled) return;
    setBusy(true);
    let snapshot: Group | undefined;
    try {
      renderer.current.update(tile, config, []);
      snapshot = renderer.current.snapshotForExport();
      downloadBlob(
        await renderer.current.exportGlb(snapshot),
        `${config.name}-${config.seed.replace(/[^a-z\d_-]/gi, '_')}.glb`,
      );
      notify('3D-Modell als GLB exportiert.');
    } catch (error) {
      notify(error instanceof Error ? error.message : '3D-Export fehlgeschlagen.', true);
    } finally {
      if (snapshot) disposeExportContent(snapshot);
      setBusy(false);
      const current = latestRender.current;
      renderer.current?.update(current.tile, current.config, current.selection);
    }
  };
  const uploadModel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Modell darf höchstens 2 MB groß sein.');
      const model = await readResponse<LibraryEntry>(
        await fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: await file.text(),
        }),
      );
      setModels((previous) => [...previous.filter((m) => m.id !== model.id), model]);
      assignModel(model.id);
      notify(`„${model.name}“ importiert und normalisiert.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Modellimport fehlgeschlagen.', true);
    }
  };
  const assignModel = (id: string) => {
    update((d) => {
      d.decoration.modelSlots = { ...d.decoration.modelSlots, [objectKind]: id };
    });
  };
  const modelSlotsKey = JSON.stringify(config.decoration.modelSlots ?? {});
  const latestRender = useRef({ tile, config, selection });
  useEffect(() => {
    latestRender.current = { tile, config, selection };
  }, [tile, config, selection]);
  // Models are loaded by id; the saved mapping makes custom model selection reproducible.
  useEffect(() => {
    const slots = JSON.parse(modelSlotsKey) as Partial<Record<DecorationKind, string>>;
    const controller = new AbortController();
    for (const [kind, id] of Object.entries(slots)) {
      if (!id) continue;
      fetch(`/api/models/${encodeURIComponent(id)}`, { signal: controller.signal })
        .then((r) => readResponse<Parameters<TileRenderer['registerModel']>[0]>(r))
        .then((model) => {
          renderer.current?.registerModel(model, kind as DecorationKind);
          setLoadedModels((previous) => new Set([...previous, model.id]));
          setModels((previous) => {
            const found = previous.find((entry) => entry.id === model.id),
              preview = voxelPreviewUrl(model);
            return found
              ? previous.map((entry) => (entry.id === model.id ? { ...entry, preview } : entry))
              : [...previous, { id: model.id, name: model.name, preview }];
          });
          const current = latestRender.current;
          renderer.current?.update(current.tile, current.config, current.selection);
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            notify(
              `Modell „${id}“ konnte nicht geladen werden: ${error instanceof Error ? error.message : 'unbekannter Fehler'}`,
              true,
            );
        });
    }
    return () => controller.abort();
  }, [modelSlotsKey, notify]);
  const openLibrary = async () => {
    try {
      setLibrary(
        await readResponse<{ id: string; name: string; seed: string; pngUrl: string }[]>(
          await fetch('/api/tiles'),
        ),
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Working-Ordner nicht verfügbar.', true);
    }
  };
  const loadSaved = async (id: string) => {
    try {
      const data = await readResponse<unknown>(await fetch(`/api/tiles/${encodeURIComponent(id)}`));
      const parsed = migrateConfig(data);
      replace(parsed.config);
      setSelection([]);
      setPlacing(null);
      setFieldId('center');
      setEditingFieldId(null);
      setSelectedObject(null);
      setLibrary(null);
      notify(parsed.migrated ? parsed.notices.join(' ') : 'Tile aus Working geladen.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Laden fehlgeschlagen.', true);
    }
  };
  const generateBulk = async (options: Parameters<typeof buildBulkProject>[0]) => {
    if (busy || bulkGenerating) return;
    setBulkGenerating(true);
    setBulkMessage(null);
    try {
      if (!probabilities.ready)
        throw new Error('Die globale Aktionsverteilung ist noch nicht verfügbar.');
      const project = await buildBulkProject({ ...options, actionDistribution });
      setBulkProject(project);
      setActiveBulkTileId(null);
      setWorkspaceMode('bulk');
      const message = `${project.tiles.length} Kacheln aus Seed „${project.seed}“ erstellt.`;
      setBulkMessage({ text: message, error: false });
      notify(message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Bulk-Serie konnte nicht erzeugt werden.';
      setBulkMessage({ text: message, error: true });
      notify(message, true);
    } finally {
      setBulkGenerating(false);
    }
  };
  const loadBulkPreviews = async (project: BulkProject): Promise<Record<string, GeneratedTile>> => {
    const previews = await Promise.all(
      project.order.map(async (id) => {
        const item = project.tiles.find((tile) => tile.id === id);
        if (!item) throw new Error(`Tile ${id} fehlt in der Serie.`);
        return [id, await validateTile(item.config)] as const;
      }),
    );
    return Object.fromEntries(previews);
  };
  const editBulkTile = (id: string, candidate: TileConfig) => {
    load(candidate);
    setActiveBulkTileId(id);
    setWorkspaceMode('tile');
    setSelection([]);
    setPlacing(null);
    setEditingFieldId(null);
    setFieldId('center');
    setSelectedObject(null);
  };
  const returnToBulk = () => {
    if (activeBulkTileId && bulkProject)
      setBulkProject(syncBulkTile(bulkProject, activeBulkTileId, config));
    setWorkspaceMode('bulk');
    setActiveBulkTileId(null);
    cancelPlacement();
  };
  const prepareBulkTiles = async (source: BulkProject) => {
    const ordered = source.order.map((id) => source.tiles.find((tile) => tile.id === id)!);
    const prepared: { id: string; config: TileConfig; tile: GeneratedTile }[] = [];
    const registeredSlots = new Set<string>();
    const loadedIds = new Set(loadedModels);
    for (const item of ordered) {
      const generated = await validateTile(item.config);
      const issues = getExportRuleIssues(item.config, generated);
      if (issues.length)
        throw new Error(`${item.config.name}: ${issues.map((issue) => issue.message).join(' ')}`);
      for (const [kind, id] of Object.entries(item.config.decoration.modelSlots ?? {})) {
        const slotKey = `${kind}:${id}`;
        if (!id || registeredSlots.has(slotKey) || BUILTINS.some((entry) => entry.id === id))
          continue;
        const model = await readResponse<Parameters<TileRenderer['registerModel']>[0]>(
          await fetch(`/api/models/${encodeURIComponent(id)}`),
        );
        renderer.current?.registerModel(model, kind as DecorationKind);
        registeredSlots.add(slotKey);
        loadedIds.add(model.id);
      }
      prepared.push({ ...item, tile: generated });
    }
    setLoadedModels(loadedIds);
    return prepared;
  };
  const exportBulk = async () => {
    if (!bulkProject || !renderer.current || busy || bulkExportProgress) return;
    const source = activeBulkTileId
      ? syncBulkTile(bulkProject, activeBulkTileId, config)
      : bulkProject;
    const ordered = source.order.map((id) => source.tiles.find((tile) => tile.id === id)!);
    setBulkProject(source);
    setBusy(true);
    setBulkMessage(null);
    setBulkExportProgress({ done: 0, total: ordered.length + 1, mode: 'working' });
    const board = new Group();
    try {
      const prepared = await prepareBulkTiles(source);
      for (let index = 0; index < prepared.length; index++) {
        const item = prepared[index]!;
        if (!renderer.current) throw new Error('3D-Renderer wurde geschlossen.');
        renderer.current.update(item.tile, item.config, []);
        const position = boardOrigin(index, source.columns);
        const snapshot = renderer.current.snapshotForExport(position.x, position.y);
        snapshot.userData.tileId = item.id;
        board.add(snapshot);
        const png = await renderer.current.exportPng(
          item.config.export.size,
          item.config.export.transparent,
        );
        await readResponse<{ path: string; existing: boolean }>(
          await fetch('/api/tiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: item.config, png: await blobDataUrl(png) }),
          }),
        );
        setBulkExportProgress({ done: index + 1, total: prepared.length + 1, mode: 'working' });
      }
      const first = prepared[0]!.config;
      const overview = await renderer.current!.exportBoardPng(
        board,
        first.export.size,
        first.export.transparent,
        first.camera,
      );
      const result = await readResponse<{ path: string }>(
        await fetch('/api/series', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: 1, project: source, png: await blobDataUrl(overview) }),
        }),
      );
      setBulkExportProgress({
        done: prepared.length + 1,
        total: prepared.length + 1,
        mode: 'working',
      });
      const message = `${prepared.length} Kachel-PNGs und ein Gesamtbild im Working-Ordner gespeichert: ${result.path}`;
      setBulkMessage({ text: message, error: false });
      notify(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bulk-Export fehlgeschlagen.';
      setBulkMessage({ text: message, error: true });
      notify(message, true);
    } finally {
      disposeExportContent(board);
      setBulkExportProgress(null);
      setBusy(false);
      const current = latestRender.current;
      renderer.current?.update(current.tile, current.config, current.selection);
    }
  };
  const exportBulkZip = async (views: BulkExportOption[]) => {
    if (!bulkProject || !renderer.current || busy || bulkExportProgress || !views.length) return;
    const source = activeBulkTileId
      ? syncBulkTile(bulkProject, activeBulkTileId, config)
      : bulkProject;
    const ordered = source.order.map((id) => source.tiles.find((tile) => tile.id === id)!);
    const distinctViews = [...new Set(views)];
    setBulkProject(source);
    setBusy(true);
    setBulkMessage(null);
    setBulkExportProgress({
      done: 0,
      total: (ordered.length + 1) * distinctViews.length,
      mode: 'zip',
    });
    const archiveWriter = new PngArchiveWriter();
    const board = new Group();
    try {
      const prepared = await prepareBulkTiles(source);
      let done = 0;
      for (let index = 0; index < prepared.length; index++) {
        const item = prepared[index]!;
        if (!renderer.current) throw new Error('3D-Renderer wurde geschlossen.');
        renderer.current.update(item.tile, item.config, []);
        const position = boardOrigin(index, source.columns);
        const snapshot = renderer.current.snapshotForExport();
        snapshot.userData.tileId = item.id;
        board.add(snapshot);
        for (const option of distinctViews) {
          const blob =
            option === 'model'
              ? await renderer.current.exportGlb(snapshot)
              : await renderer.current.exportPng(
                  item.config.export.size,
                  item.config.export.transparent,
                  { ...item.config.camera, mode: option },
                );
          await archiveWriter.add(
            archiveTilePath(index, item.config.name, option, distinctViews.length > 1),
            blob,
          );
          done++;
          setBulkExportProgress({
            done,
            total: (ordered.length + 1) * distinctViews.length,
            mode: 'zip',
          });
        }
        // Individual models keep a local origin; the board follows the visible series order.
        const positioned = renderer.current.snapshotForExport(position.x, position.y);
        positioned.userData.tileId = item.id;
        board.remove(snapshot);
        disposeExportContent(snapshot);
        board.add(positioned);
      }
      const first = prepared[0]!.config;
      for (const option of distinctViews) {
        const blob =
          option === 'model'
            ? await renderer.current!.exportGlb(board)
            : await renderer.current!.exportBoardPng(
                board,
                first.export.size,
                first.export.transparent,
                { ...first.camera, mode: option },
              );
        await archiveWriter.add(archiveBoardPath(option), blob);
        done++;
        setBulkExportProgress({
          done,
          total: (ordered.length + 1) * distinctViews.length,
          mode: 'zip',
        });
      }
      const archive = await archiveWriter.finish();
      const seedSlug = source.seed
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      downloadBlob(archive, `hexastudio-serie-${seedSlug || 'export'}.zip`);
      const message = `ZIP mit ${prepared.length} Kacheln und Gesamtfeld heruntergeladen.`;
      setBulkMessage({ text: message, error: false });
      notify(message);
    } catch (error) {
      archiveWriter.abort();
      const message = error instanceof Error ? error.message : 'ZIP-Export fehlgeschlagen.';
      setBulkMessage({ text: message, error: true });
      notify(message, true);
    } finally {
      disposeExportContent(board);
      setBulkExportProgress(null);
      setBusy(false);
      const current = latestRender.current;
      renderer.current?.update(current.tile, current.config, current.selection);
    }
  };
  const activeLayer = LAYERS.find((l) => l.id === layer)!;
  return (
    <div
      className="studio-app"
      style={{ visibility: workspaceMode === 'bulk' ? 'hidden' : 'visible' }}
      aria-hidden={workspaceMode === 'bulk'}
    >
      <header className="app-header">
        <a className="brand" href="/" aria-label="Hexa Studio Startseite">
          <span className="brand-mark">
            <Hexagon size={28} strokeWidth={1.6} />
            <span />
          </span>
          <span>
            hexa<span className="brand-light">studio</span>
            <small>WORLDS, ONE TILE AT A TIME</small>
          </span>
        </a>
        <div className="project-breadcrumb">
          <span>Workspace</span>
          <ChevronRight size={13} />
          <strong>{config.name}</strong>
          <span className="version-tag">EDITOR</span>
        </div>
        <div className="header-actions">
          <a className="subtle-button" href="/cards" aria-label="Ereigniskarten-Editor">
            <Layers3 size={15} />
            <span>Ereigniskarten</span>
          </a>
          {workspaceMode === 'tile' && (
            <button
              className="subtle-button"
              aria-label={activeBulkTileId ? 'Zur Serie' : 'Bulk-Modus'}
              onClick={() => (activeBulkTileId ? returnToBulk() : setWorkspaceMode('bulk'))}
            >
              <Grid3X3 size={15} />
              <span>{activeBulkTileId ? 'Zur Serie' : 'Bulk-Modus'}</span>
            </button>
          )}
          <button className="subtle-button" aria-label="Meine Tiles" onClick={openLibrary}>
            <Layers3 size={15} />
            <span>Meine Tiles</span>
          </button>
          <button className="icon-button" aria-label="Hilfe öffnen" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
          </button>
          <button
            className="button"
            aria-label={assetsReady ? 'PNG exportieren' : 'Modelle laden…'}
            disabled={exportDisabled}
            title={
              exportIssues.length
                ? 'Export durch Prüfregeln gesperrt. Regeln rechts anpassen.'
                : undefined
            }
            onClick={() => void renderPng(false)}
          >
            {busy ? <LoaderCircle size={15} className="spin" /> : <ArrowDownToLine size={15} />}
            <span>{assetsReady ? 'PNG exportieren' : 'Modelle laden…'}</span>
          </button>
        </div>
      </header>
      <nav className="layer-sidebar" aria-label="Editor-Ebenen">
        <div className="sidebar-label">
          DEINE KACHEL <span>6 EBENEN</span>
        </div>
        <div className="layer-list">
          {LAYERS.map((l, i) => (
            <button
              key={l.id}
              aria-label={`${l.title} ${l.subtitle}`}
              aria-current={layer === l.id ? 'step' : undefined}
              className={`layer-item ${layer === l.id ? 'active' : ''}`}
              onClick={() => {
                setLayer(l.id);
                cancelPlacement();
              }}
            >
              <span className="layer-icon">
                <l.icon size={19} />
              </span>
              <span className="layer-copy">
                <strong>{l.title}</strong>
                <small>{l.subtitle}</small>
              </span>
              <span className="layer-number">{String(i + 1).padStart(2, '0')}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="seed-card">
            <span>
              <Sparkles size={13} /> DETERMINISTISCH
            </span>
            <p>
              Ein Seed.
              <br />
              Deine eigene Welt.
            </p>
            <small>Jedes Detail reproduzierbar.</small>
          </div>
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            aria-label="Konfiguration importieren"
            hidden
            onChange={(e) => void importConfig(e)}
          />
          <div className="build-label">
            HEXA STUDIO <span>v0.11</span>
          </div>
        </div>
      </nav>
      <aside className="inspector">
        <div className="inspector-heading">
          <div>
            <span className="eyebrow">
              EBENE {String(LAYERS.indexOf(activeLayer) + 1).padStart(2, '0')}
            </span>
            <h1>{activeLayer.title}</h1>
          </div>
          <SlidersHorizontal size={18} />
        </div>
        <Inspector
          key={layer}
          layer={layer}
          config={config}
          tile={tile}
          update={update}
          editCenter={editCenter}
          applyBiome={applyBiome}
          selectedField={selectedField}
          setField={setField}
          onSelectField={(id) => {
            cancelPlacement();
            setFieldId(id);
            setLayer('actions');
          }}
          removeField={() =>
            update((d) => {
              if (tile.entrances.some((entrance) => entrance.fieldId === fieldId)) return;
              d.paths.fields = d.paths.fields.filter((f) => f.id !== fieldId);
            })
          }
          objectKind={objectKind}
          setObjectKind={setObjectKind}
          selectedObject={selectedObject}
          uploadModel={(e) => void uploadModel(e)}
          models={models}
          assignModel={assignModel}
        />
      </aside>
      <main className="main-workspace" aria-busy={generationPending || busy}>
        <div className="workspace-toolbar">
          <div className="project-name">
            <span className="status-dot" />
            <input
              aria-label="Projektname"
              maxLength={80}
              value={config.name}
              onChange={(e) =>
                update((d) => {
                  d.name = e.target.value;
                })
              }
            />
            <span className="saved-label">
              {storageError ? 'Speicher voll' : 'Lokal gespeichert'}
            </span>
          </div>
          <div className="history-buttons">
            <button
              className="icon-button"
              aria-label="Rückgängig"
              title="Rückgängig (⌘Z)"
              disabled={!canUndo}
              onClick={undo}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Wiederholen"
              title="Wiederholen (⇧⌘Z)"
              disabled={!canRedo}
              onClick={redo}
            >
              <Redo2 size={16} />
            </button>
          </div>
        </div>
        <div className="canvas-area">
          <div className="canvas-topbar">
            <div className="view-switch" role="group" aria-label="Ansicht">
              {[
                { mode: 'top' as const, label: 'Draufsicht', Icon: Grid3X3 },
                { mode: 'orbit' as const, label: '3D-Ansicht', Icon: Box },
                { mode: 'perspective' as const, label: 'Perspektive', Icon: Move3D },
              ].map(({ mode, label, Icon }) => (
                <button
                  key={mode}
                  className={config.camera.mode === mode ? 'selected' : ''}
                  onClick={() =>
                    update((d) => {
                      d.camera.mode = mode;
                    })
                  }
                >
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            {config.camera.mode === 'orbit' && (
              <button
                className="capture-view"
                onClick={() => {
                  const view = renderer.current?.captureView();
                  if (view) {
                    update((d) => {
                      d.camera = view;
                    });
                    notify('Orbitansicht als Exportkamera übernommen.');
                  }
                }}
              >
                <Check size={13} /> Ansicht übernehmen
              </button>
            )}
            <button
              className="canvas-icon"
              aria-label="Ansicht zurücksetzen"
              onClick={() => renderer.current?.resetView()}
            >
              <Maximize2 size={16} />
            </button>
          </div>
          <div className="tile-caption">
            <span className="eyebrow">LIVE PREVIEW</span>
            <h2>{config.name}</h2>
            <p>
              {config.grid.kind === 'hex' ? 'Hexagonraster' : 'Rautenraster'} <span>·</span>{' '}
              {tile.stats.cells} Zellen <span>·</span> Seedbasiert
            </p>
          </div>
          <Viewport
            tile={tile}
            config={config}
            selection={selection}
            selectedFieldId={
              !placing && (layer === 'paths' || layer === 'actions') ? fieldId : undefined
            }
            rendererRef={renderer}
            onCellClick={pickCell}
            onFieldClick={(id) => {
              if (!placing && editable && !busy) {
                setFieldId(id);
                setLayer('actions');
              }
            }}
            onError={setRenderError}
          />
          {generationPending && (
            <div className="generation-banner" data-testid="generation-status">
              <LoaderCircle size={14} className="spin" /> Kachel wird aufgebaut…
            </div>
          )}
          {generationError && (
            <div className="render-error">
              <strong>Generierung fehlgeschlagen</strong>
              <p>{generationError}</p>
            </div>
          )}
          {renderError && (
            <div className="render-error">
              <Box size={28} />
              <strong>3D-Vorschau nicht verfügbar</strong>
              <p>{renderError}</p>
              <p>Bitte WebGL in deinem Browser aktivieren.</p>
            </div>
          )}
          <div className="canvas-bottom">
            <span className="orbit-help">
              <MousePointer2 size={13} />
              <span>
                {config.camera.mode === 'top'
                  ? 'Ziehen zum Verschieben'
                  : 'Rechts ziehen zum Drehen'}{' '}
                <i>·</i> Scrollen zum Zoomen
              </span>
            </span>
            <span className="scale-marker">
              {config.export.size} × {config.export.size}
              <span>px</span>
            </span>
          </div>
          <div className="compass" aria-hidden="true">
            <span>N</span>
            <svg viewBox="0 0 40 40">
              <path d="M20 3 26 27 20 23 14 27Z" fill="#355344" />
              <path d="M20 3v20l6 4Z" fill="#91a08d" />
              <circle cx="20" cy="21" r="17" fill="none" stroke="#bdc3b5" strokeWidth=".7" />
            </svg>
          </div>
        </div>
        <div className="seed-toolbar">
          <div className="seed-input">
            <span>SEED</span>
            <input
              aria-label="Seed"
              value={config.seed}
              maxLength={128}
              onChange={(e) =>
                update((d) => {
                  if (d.terrain.noise.seed === d.seed) d.terrain.noise.seed = e.target.value;
                  d.seed = e.target.value;
                })
              }
            />
            <button
              className="icon-button"
              disabled={busy}
              aria-label="Neuen Seed würfeln"
              onClick={() => void generateProject(`tile-${crypto.randomUUID().slice(0, 8)}`)}
            >
              <Shuffle size={16} />
            </button>
          </div>
          <button
            className="subtle-button regenerate"
            disabled={busy}
            aria-label="Komplett aus Seed generieren"
            title="Landschaft, Spielfelder, Aktionen und Objekte neu erzeugen. Raster, Bildgröße, Kamera und Feldzahl bleiben erhalten. Rückgängig stellt deine Anpassungen wieder her."
            onClick={() => void generateProject(config.seed)}
          >
            <RotateCcw size={14} /> Komplett aus Seed
          </button>
          <span className="seed-info">
            <Check size={13} /> Reproduzierbar
          </span>
        </div>
        <footer className="statusbar">
          <span>
            <span className="status-dot" />
            {tile.stats.connected ? 'Wege verbunden' : 'Verbindungen prüfen'}
          </span>
          <span>
            <Hexagon size={12} />
            {tile.stats.fields} / {config.paths.fieldCount} Spielfelder
          </span>
          <span>
            <Sprout size={12} />
            {tile.stats.decorations} Objekte
          </span>
          <button
            className="status-warnings"
            onClick={() => tile.warnings.length && notify(tile.warnings.join(' '), true)}
          >
            {tile.warnings.length ? `${tile.warnings.length} Hinweise` : 'Alle Ebenen aktuell'}
          </button>
          <span className="engine-label">GENERATOR {config.generatorVersion}</span>
        </footer>
      </main>
      <QuickActions
        probabilities={probabilities}
        layer={layer}
        config={config}
        tile={tile}
        update={update}
        selectedField={selectedField}
        selectedObject={config.decoration.placements.find((object) => object.id === selectedObject)}
        objectLabel={OBJECT_NAME[objectKind]}
        placing={placing}
        editingField={!!editingFieldId}
        selectionCount={selection.length}
        shapeLineCounts={shapeLineCounts}
        selectionArea={selectionArea}
        fieldIssue={fieldIssue}
        selectionWarnings={selectionStatus.warnings}
        ruleIssues={ruleIssues}
        exportIssues={exportIssues}
        busy={busy || !editable}
        applyDisabled={fieldApplyDisabled}
        exportDisabled={exportDisabled}
        onSelectField={(id) => {
          cancelPlacement();
          setFieldId(id);
          setSelectedObject(null);
          setLayer('actions');
        }}
        onSelectObject={setSelectedObject}
        onNewField={newField}
        onEditField={editFieldShape}
        onApply={() => void createField()}
        onAdjustShapeLine={adjustShapeLine}
        onCancel={cancelPlacement}
        onClear={() =>
          setSelection(
            editingFieldId
              ? tile.entrances
                  .filter((entrance) => entrance.fieldId === editingFieldId)
                  .flatMap((entrance) => entrance.cellIds)
              : [],
          )
        }
        onPlaceObjects={() => {
          if (placing === 'objects') cancelPlacement();
          else {
            cancelPlacement();
            setPlacing('objects');
          }
        }}
        onRemoveObject={() => {
          if (busy || !editable) return;
          update((draft) => {
            draft.decoration.placements = draft.decoration.placements.filter(
              (object) => object.id !== selectedObject,
            );
          });
          setSelectedObject(null);
        }}
        onExport={() => void renderPng(false)}
        onExportModel={() => void renderModel()}
        onSave={() => void renderPng(true)}
        onTopView={() =>
          update((draft) => {
            draft.camera.mode = 'top';
          })
        }
        onImport={() => importInput.current?.click()}
        onExportConfig={exportConfig}
        onBorderSettings={() =>
          document.getElementById('tile-border-settings')?.scrollIntoView({ block: 'nearest' })
        }
        onRollActions={randomizeActions}
        onCenterSettings={() => {
          cancelPlacement();
          setLayer('paths');
          requestAnimationFrame(() =>
            document.getElementById('center-settings')?.scrollIntoView({ block: 'nearest' }),
          );
        }}
      />
      {notification && (
        <div role="status" className={`toast ${notification.error ? 'error' : ''}`}>
          {notification.error ? <CircleHelp size={18} /> : <CheckCircle2 size={18} />}
          <span>{notification.message}</span>
          <button aria-label="Meldung schließen" onClick={() => setNotification(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      {(help || library) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setHelp(false);
            setLibrary(null);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={help ? 'So funktioniert Hexa Studio' : 'Meine Tiles'}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="Schließen"
              onClick={() => {
                setHelp(false);
                setLibrary(null);
              }}
            >
              <X size={20} />
            </button>
            {help ? (
              <>
                <span className="eyebrow">DEIN KLEINES WELTENBAU-ATELIER</span>
                <h2>
                  Von einer Idee
                  <br />
                  zur Spielkachel.
                </h2>
                <p>
                  „Komplett aus Seed“ erzeugt alle Ebenen auf einmal. Bildgröße und Kamera bleiben
                  erhalten. Danach kannst du Raster, Landschaft, Felder, Aktionen und Objekte
                  einzeln anpassen. Alle Regler wirken sofort auf die Vorschau.
                </p>
                <ol>
                  <li>Raster und Ausgabegröße bestimmen.</li>
                  <li>Relief, Farben und Pixelkörnung gestalten.</li>
                  <li>
                    Wege generieren oder zusammenhängende Zellen zu eigenen Spielfeldern verbinden.
                  </li>
                  <li>Ein Spielfeld anklicken und seine Aktion oder Farbe wählen.</li>
                  <li>Voxelobjekte verteilen oder auf dem Subraster platzieren.</li>
                  <li>Kamera einstellen, PNG exportieren und im Working-Ordner sichern.</li>
                </ol>
                <p>
                  Die Vorschau lässt sich frei drehen. „Ansicht übernehmen“ speichert den aktuellen
                  Blick. Der Export nutzt immer die gespeicherten Kameraeinstellungen. ⌘/Strg + Z
                  macht Änderungen rückgängig, Escape beendet den Platziermodus.
                </p>
                <button className="button" onClick={() => setHelp(false)}>
                  Loslegen <ChevronRight size={14} />
                </button>
              </>
            ) : (
              <>
                <span className="eyebrow">WORKING-ORDNER</span>
                <h2>Meine Tiles</h2>
                {library?.length ? (
                  <div className="saved-tiles">
                    {library.map((item) => (
                      <button key={item.id} onClick={() => void loadSaved(item.id)}>
                        <img src={item.pngUrl} alt={item.name} />
                        <strong>{item.name}</strong>
                        <small>{item.seed}</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Save size={32} />
                    <p>
                      Hier ist Platz für deine Welten.
                      <br />
                      Speichere deinen ersten Tile im Export-Schritt.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {workspaceMode === 'bulk' &&
        createPortal(
          <BulkWorkspace
            project={bulkProject}
            template={{ grid: config.grid, border: config.border, paths: config.paths }}
            generating={bulkGenerating}
            message={bulkMessage}
            exportProgress={bulkExportProgress}
            onGenerate={(options) => void generateBulk(options)}
            onProjectChange={setBulkProject}
            onEdit={editBulkTile}
            onLoadPreviews={loadBulkPreviews}
            onShuffle={() =>
              setBulkProject((previous) => (previous ? shuffleBulkProject(previous) : previous))
            }
            onExport={(views) => void exportBulkZip(views)}
            onSaveWorking={() => void exportBulk()}
            onBack={() => (activeBulkTileId ? returnToBulk() : setWorkspaceMode('tile'))}
          />,
          document.body,
        )}
    </div>
  );
}
const OBJECT_NAME = Object.fromEntries(
  DECORATION_CATALOG.map((entry) => [entry.kind, entry.label]),
) as Record<DecorationKind, string>;
