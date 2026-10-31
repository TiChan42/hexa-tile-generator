import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Box,
  ChevronLeft,
  Grid3X3,
  Hexagon,
  LoaderCircle,
  Move3D,
  Save,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import {
  migrateBulkProject,
  BIOME_PRESETS,
  setBulkContinuousNoise,
  setBulkUniformity,
  setBulkGridVisibility,
  setBulkExportSettings,
  type BulkGenerationOptions,
  type BulkProject,
} from '../core';
import type { TileConfig } from '../core/types';
import type { GeneratedTile } from '../core/types';
import type { BiomePresetId } from '../core/biomes';
import type { BulkExportOption } from '../editor/bulkArchive';
import { loadBulkExportOptions, saveBulkExportOptions } from '../editor/bulkStorage';
import { generationKey } from '../editor/generationKey';
import BulkSeriesViewer from './BulkSeriesViewer';

interface Props {
  project: BulkProject | null;
  template: Pick<TileConfig, 'grid' | 'border' | 'paths' | 'export'>;
  generating: boolean;
  message: { text: string; error: boolean } | null;
  exportProgress: { done: number; total: number; mode: 'zip' | 'working' } | null;
  onGenerate: (options: BulkGenerationOptions) => void;
  onProjectChange: (project: BulkProject) => void;
  onEdit: (id: string, config: TileConfig) => void;
  onLoadPreviews: (project: BulkProject) => Promise<Record<string, GeneratedTile>>;
  onShuffle: () => void;
  onExport: (views: BulkExportOption[]) => void;
  onSaveWorking: () => void;
  onBack: () => void;
}

function saveJson(project: BulkProject) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hexastudio-serie-${project.seed.replace(/[^a-z\d_-]/gi, '_')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BulkWorkspace({
  project,
  template,
  generating,
  message,
  exportProgress,
  onGenerate,
  onProjectChange,
  onEdit,
  onLoadPreviews,
  onShuffle,
  onExport,
  onSaveWorking,
  onBack,
}: Props) {
  const [rows, setRows] = useState(project?.rows ?? 3);
  const [columns, setColumns] = useState(project?.columns ?? 3);
  const [seed, setSeed] = useState(project?.seed ?? 'nebelmoor-serie-42');
  const [continuousNoise, setContinuousNoise] = useState(project?.continuousNoise ?? true);
  const [uniformGrid, setUniformGrid] = useState(project?.uniformGrid ?? true);
  const [uniformBorder, setUniformBorder] = useState(project?.uniformBorder ?? true);
  const [biomeMode, setBiomeMode] = useState<'random' | 'fixed'>(project?.biomeMode ?? 'random');
  const [biomeId, setBiomeId] = useState<BiomePresetId>(project?.biomeId ?? 'mosslight');
  const [gridTemplate, setGridTemplate] = useState(project?.gridTemplate ?? template.grid);
  const [borderTemplate, setBorderTemplate] = useState(project?.borderTemplate ?? template.border);
  const [fieldCount, setFieldCount] = useState(
    project?.tiles[0]?.config.paths.fieldCount ?? template.paths.fieldCount,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exportViews, setExportViews] = useState<BulkExportOption[]>(() => {
    try {
      return loadBulkExportOptions(localStorage);
    } catch {
      return ['top'];
    }
  });
  const [exportTemplate, setExportTemplate] = useState(
    project?.tiles[0]?.config.export ?? template.export,
  );
  const [resolutionDraft, setResolutionDraft] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [previewData, setPreviewData] = useState<{
    key: string;
    tiles: Record<string, GeneratedTile>;
  } | null>(null);
  const [previewFailure, setPreviewFailure] = useState<{ key: string; message: string } | null>(
    null,
  );
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const previewLoader = useRef(onLoadPreviews);
  const previewSource = useRef(project);
  useEffect(() => {
    previewSource.current = project;
  }, [project]);
  useEffect(() => {
    previewLoader.current = onLoadPreviews;
  }, [onLoadPreviews]);
  const [error, setError] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const count = rows * columns;
  const overLimit = count > 49;
  const currentGrid = project?.gridTemplate ?? gridTemplate;
  const gridVisibility = project
    ? {
        showGrid: project.tiles.some(({ config }) => config.grid.showGrid),
        showSubgrid: project.tiles.some(({ config }) => config.grid.showSubgrid),
      }
    : { showGrid: currentGrid.showGrid, showSubgrid: currentGrid.showSubgrid };
  const currentExport = project?.tiles[0]?.config.export ?? exportTemplate;
  const mixedExport =
    project?.tiles.some(
      ({ config }) =>
        config.export.size !== currentExport.size ||
        config.export.transparent !== currentExport.transparent,
    ) ?? false;
  const currentBorder = project?.borderTemplate ?? borderTemplate;
  const currentContinuousNoise = project?.continuousNoise ?? continuousNoise;
  const currentUniformGrid = project?.uniformGrid ?? uniformGrid;
  const currentUniformBorder = project?.uniformBorder ?? uniformBorder;
  const projectKey = useMemo(
    () =>
      project
        ? JSON.stringify({
            columns: project.columns,
            order: project.order,
            tiles: project.tiles.map(({ id, config }) => ({ id, key: generationKey(config) })),
          })
        : '',
    [project],
  );
  const currentPreview = previewData?.key === projectKey ? previewData.tiles : null;
  const previewError = previewFailure?.key === projectKey ? previewFailure.message : null;
  const previewLoading = !!project && !currentPreview && !previewError;
  useEffect(() => {
    const source = previewSource.current;
    if (!source) return;
    let active = true;
    // Parent effects create the generation worker before this automatic first preview starts.
    void Promise.resolve()
      .then(() => (active ? previewLoader.current(source) : null))
      .then((tiles) => {
        if (active && tiles) {
          setPreviewData({ key: projectKey, tiles });
          setPreviewFailure(null);
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setPreviewFailure({
            key: projectKey,
            message: reason instanceof Error ? reason.message : 'Serienvorschau fehlgeschlagen.',
          });
      });
    return () => {
      active = false;
    };
  }, [projectKey, previewAttempt]);
  const orderedTiles = useMemo(
    () =>
      project
        ? project.order.map((id) => project.tiles.find((tile) => tile.id === id)!).filter(Boolean)
        : [],
    [project],
  );

  const updateGrid = (next: TileConfig['grid']) => {
    setGridTemplate(next);
    if (project?.uniformGrid) changeProject(setBulkUniformity(project, 'grid', true, next));
  };
  const updateBorder = (next: TileConfig['border']) => {
    setBorderTemplate(next);
    if (project?.uniformBorder) changeProject(setBulkUniformity(project, 'border', true, next));
  };
  const updateGridVisibility = (
    visibility: Partial<Pick<TileConfig['grid'], 'showGrid' | 'showSubgrid'>>,
  ) => {
    setGridTemplate({ ...currentGrid, ...visibility });
    if (project) onProjectChange(setBulkGridVisibility(project, visibility));
  };
  const updateExport = (next: TileConfig['export']) => {
    setExportTemplate(next);
    if (project) onProjectChange(setBulkExportSettings(project, next));
  };
  const toggleUniformGrid = (enabled: boolean) => {
    setUniformGrid(enabled);
    if (project) changeProject(setBulkUniformity(project, 'grid', enabled, currentGrid));
  };
  const toggleUniformBorder = (enabled: boolean) => {
    setUniformBorder(enabled);
    if (project) changeProject(setBulkUniformity(project, 'border', enabled, currentBorder));
  };
  const toggleContinuousNoise = (enabled: boolean) => {
    setContinuousNoise(enabled);
    if (project) changeProject(setBulkContinuousNoise(project, enabled));
  };
  const changeProject = (next: BulkProject) => {
    onProjectChange(next);
    setViewMode('2d');
    setPreviewFailure(null);
  };
  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 12_000_000) throw new Error('Seriendatei darf höchstens 12 MB groß sein.');
      const parsed = migrateBulkProject(JSON.parse(await file.text()));
      changeProject(parsed);
      setSeed(parsed.seed);
      setRows(parsed.rows);
      setColumns(parsed.columns);
      setContinuousNoise(parsed.continuousNoise);
      setUniformGrid(parsed.uniformGrid);
      setUniformBorder(parsed.uniformBorder);
      setBiomeMode(parsed.biomeMode);
      setBiomeId(parsed.biomeId);
      setGridTemplate(parsed.gridTemplate);
      setBorderTemplate(parsed.borderTemplate);
      if (parsed.tiles[0]) setFieldCount(parsed.tiles[0].config.paths.fieldCount);
      if (parsed.tiles[0]) setExportTemplate(parsed.tiles[0].config.export);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Die Seriendatei ist ungültig.');
    }
  };
  const generate = () => {
    setSelectedId(null);
    setViewMode('2d');
    setError(null);
    onGenerate({
      rows,
      columns,
      seed: seed.trim(),
      continuousNoise: currentContinuousNoise,
      uniformGrid: currentUniformGrid,
      uniformBorder: currentUniformBorder,
      biomeMode,
      biomeId,
      gridTemplate: currentGrid,
      borderTemplate: currentBorder,
      fieldCount,
      gridVisibility,
      exportTemplate: currentExport,
    });
  };
  const selectedTile = project?.tiles.find((tile) => tile.id === selectedId);
  const toggleExportView = (view: BulkExportOption, enabled: boolean) => {
    const next = enabled
      ? [...exportViews, view].filter((value, index, values) => values.indexOf(value) === index)
      : exportViews.filter((value) => value !== view);
    setExportViews(next);
    try {
      saveBulkExportOptions(localStorage, next);
    } catch {
      /* Preferences are optional. */
    }
  };
  const previewTiles = useMemo(
    () =>
      currentPreview
        ? orderedTiles.flatMap(({ id, config }) =>
            currentPreview[id] ? [{ id, config, tile: currentPreview[id]! }] : [],
          )
        : [],
    [currentPreview, orderedTiles],
  );

  return (
    <div className="bulk-workspace" role="region" aria-label="Bulk-Modus">
      <header className="bulk-header">
        <button className="subtle-button" onClick={onBack}>
          <ChevronLeft size={16} /> Einzelkachel
        </button>
        <div className="bulk-brand">
          <span className="brand-mark">
            <Hexagon size={23} />
          </span>
          <span>
            <strong>Hexa Studio</strong>
            <small>BULK · SPIELBRETT</small>
          </span>
        </div>
        <div className="bulk-header-actions">
          {project && (
            <button className="button secondary" onClick={() => saveJson(project)}>
              <ArrowDownToLine size={14} /> Serie exportieren
            </button>
          )}
          <button className="button secondary" onClick={() => importInput.current?.click()}>
            <ArrowUpFromLine size={14} /> Serie laden
          </button>
          <input
            ref={importInput}
            type="file"
            aria-label="Serie importieren"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              void importProject(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
      </header>
      <main className="bulk-layout">
        <aside className="bulk-controls">
          <span className="eyebrow">SERIE ERSTELLEN</span>
          <h1>Viele Welten, ein Brett.</h1>
          <p className="bulk-intro">
            Erzeuge eine reproduzierbare Kachelserie. Jede Kachel lässt sich danach einzeln im
            normalen 3D-Editor weiterbearbeiten.
          </p>
          <label className="bulk-label">
            Seed
            <input maxLength={128} value={seed} onChange={(event) => setSeed(event.target.value)} />
          </label>
          <div className="bulk-number-row">
            <label className="bulk-label">
              Reihen
              <input
                type="number"
                min={1}
                max={10}
                value={rows}
                onChange={(event) =>
                  setRows(Math.max(1, Math.min(10, Number(event.target.value) || 1)))
                }
              />
            </label>
            <label className="bulk-label">
              Spalten
              <input
                type="number"
                min={1}
                max={10}
                value={columns}
                onChange={(event) =>
                  setColumns(Math.max(1, Math.min(10, Number(event.target.value) || 1)))
                }
              />
            </label>
          </div>
          <p className={`bulk-count ${overLimit ? 'error-text' : ''}`}>
            {count} von maximal 49 Kacheln
          </p>
          <label className="bulk-label">
            Spielfelder pro Kachel
            <input
              type="number"
              min={7}
              max={24}
              value={fieldCount}
              onChange={(event) =>
                setFieldCount(Math.max(7, Math.min(24, Number(event.target.value) || 7)))
              }
            />
          </label>
          <label className="bulk-label">
            Biome der Serie
            <select
              value={biomeMode}
              onChange={(event) => setBiomeMode(event.target.value as 'random' | 'fixed')}
            >
              <option value="random">Zufällig je Kachel (Standard)</option>
              <option value="fixed">Ein Biom für alle Kacheln</option>
            </select>
          </label>
          {biomeMode === 'fixed' && (
            <label className="bulk-label">
              Biom
              <select
                value={biomeId}
                onChange={(event) => setBiomeId(event.target.value as BiomePresetId)}
              >
                {BIOME_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} · {preset.summary}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="bulk-divider" />
          <label className="bulk-check">
            <input
              type="checkbox"
              checked={currentContinuousNoise}
              onChange={(event) => toggleContinuousNoise(event.target.checked)}
            />
            <span>
              <strong>Durchgehendes Perlin-Noise</strong>
              <small>Geteilte Noise-Koordinaten und Höhenparameter über alle Kachelgrenzen.</small>
            </span>
          </label>
          <label className="bulk-check">
            <input
              type="checkbox"
              checked={currentUniformGrid}
              onChange={(event) => toggleUniformGrid(event.target.checked)}
            />
            <span>
              <strong>Einheitliche Rastergröße</strong>
              <small>Rasteränderungen werden auf die ganze Serie übertragen.</small>
            </span>
          </label>
          {currentUniformGrid && (
            <div className="bulk-settings">
              <p className="bulk-hint">
                Eine neue Rasterart oder Auflösung baut Feldformen und Objektplatzierungen aller
                Kacheln neu auf.
              </p>
              <label className="bulk-label">
                Rasterart
                <select
                  value={currentGrid.kind}
                  onChange={(event) =>
                    updateGrid({
                      ...currentGrid,
                      kind: event.target.value as TileConfig['grid']['kind'],
                    })
                  }
                >
                  <option value="hex">Hexagone</option>
                  <option value="diamond">Rauten</option>
                </select>
              </label>
              <label className="bulk-label">
                Rasterteilungen <strong>{currentGrid.divisions}</strong>
                <input
                  type="range"
                  min={6}
                  max={24}
                  step={1}
                  value={currentGrid.divisions}
                  onChange={(event) =>
                    updateGrid({ ...currentGrid, divisions: Number(event.target.value) })
                  }
                />
              </label>
              <label className="bulk-label">
                Objekt-Subraster <strong>{currentGrid.subDivisions}</strong>
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={currentGrid.subDivisions}
                  onChange={(event) =>
                    updateGrid({ ...currentGrid, subDivisions: Number(event.target.value) })
                  }
                />
              </label>
            </div>
          )}
          <label className="bulk-check compact">
            <input
              type="checkbox"
              checked={gridVisibility.showGrid}
              disabled={!!exportProgress || generating}
              onChange={(event) =>
                updateGridVisibility({
                  showGrid: event.target.checked,
                })
              }
            />
            <span>Rasterlinien anzeigen</span>
          </label>
          <label className="bulk-check compact">
            <input
              type="checkbox"
              checked={gridVisibility.showSubgrid}
              disabled={!!exportProgress || generating}
              onChange={(event) =>
                updateGridVisibility({
                  showSubgrid: event.target.checked,
                })
              }
            />
            <span>Subrasterlinien anzeigen</span>
          </label>
          <label className="bulk-check">
            <input
              type="checkbox"
              checked={currentUniformBorder}
              onChange={(event) => toggleUniformBorder(event.target.checked)}
            />
            <span>
              <strong>Einheitlicher Tile-Rand</strong>
              <small>Aktivierung, Breite und Farbe für alle Kacheln gemeinsam.</small>
            </span>
          </label>
          {currentUniformBorder && (
            <div className="bulk-settings">
              <label className="bulk-check compact">
                <input
                  type="checkbox"
                  checked={currentBorder.enabled}
                  onChange={(event) =>
                    updateBorder({ ...currentBorder, enabled: event.target.checked })
                  }
                />
                <span>Randlinie aktiv</span>
              </label>
              <label className="bulk-label">
                Randbreite <strong>{currentBorder.width.toFixed(3)}</strong>
                <input
                  type="range"
                  min={0}
                  max={0.1}
                  step={0.001}
                  value={currentBorder.width}
                  onChange={(event) =>
                    updateBorder({ ...currentBorder, width: Number(event.target.value) })
                  }
                />
              </label>
              <label className="bulk-label">
                Randdarstellung
                <select
                  value={currentBorder.mode}
                  onChange={(event) =>
                    updateBorder({
                      ...currentBorder,
                      mode: event.target.value as TileConfig['border']['mode'],
                    })
                  }
                >
                  <option value="black">Schwarz</option>
                  <option value="custom">Eigene Farbe</option>
                  <option value="fields">Spielfeldrandfarbe</option>
                  <option value="transparent">Durchsichtig</option>
                </select>
              </label>
              <label className="bulk-label">
                Randfarbe
                <input
                  type="color"
                  value={currentBorder.color}
                  onChange={(event) =>
                    updateBorder({ ...currentBorder, color: event.target.value })
                  }
                />
              </label>
            </div>
          )}
          <div className="bulk-divider" />
          <label className="bulk-label">
            Exportauflösung (px)
            <input
              type="number"
              min={128}
              max={4096}
              step={1}
              value={resolutionDraft ?? currentExport.size}
              disabled={!!exportProgress || generating}
              onBlur={() => setResolutionDraft(null)}
              onChange={(event) => {
                setResolutionDraft(event.target.value);
                const size = event.target.valueAsNumber;
                if (Number.isInteger(size) && size >= 128 && size <= 4096)
                  updateExport({ ...currentExport, size });
              }}
            />
          </label>
          <p className="bulk-hint">
            128–4096 px je Bild, für Einzelkacheln und Gesamtfeld. Eine Änderung gilt für alle
            Kacheln; SVG bleibt frei skalierbar.
          </p>
          {mixedExport && (
            <button className="text-button" onClick={() => updateExport(currentExport)}>
              Exportwerte auf alle Kacheln anwenden
            </button>
          )}
          <label className="bulk-check compact">
            <input
              type="checkbox"
              checked={currentExport.transparent}
              disabled={!!exportProgress || generating}
              onChange={(event) =>
                updateExport({ ...currentExport, transparent: event.target.checked })
              }
            />
            <span>Transparenter Exporthintergrund</span>
          </label>
          <div className="bulk-export-picker">
            <div className="bulk-export-picker-heading">
              <strong>Exportinhalt im ZIP</strong>
              <small>
                Einzelkacheln und Gesamtfeld; jede gewählte Bildansicht enthält auch ein Gesamtbild.
                GLB enthält Einzelmodelle und das zusammengesetzte Brett mit Farben und Texturen.
                SVG enthält die Draufsicht als Vektoren; die Auflösung bestimmt die Bildgröße beim
                Öffnen.
              </small>
            </div>
            <div className="bulk-export-views" role="group" aria-label="Exportansichten">
              {[
                { id: 'top' as const, label: 'Draufsicht', Icon: Grid3X3 },
                { id: 'orbit' as const, label: '3D-Ansicht', Icon: Box },
                { id: 'perspective' as const, label: 'Perspektive', Icon: Move3D },
                { id: 'svg' as const, label: 'SVG-Draufsicht', Icon: Hexagon },
                { id: 'model' as const, label: '3D-Modell (GLB)', Icon: Hexagon },
              ].map(({ id, label, Icon }) => (
                <label className="bulk-export-view" key={id}>
                  <input
                    type="checkbox"
                    checked={exportViews.includes(id)}
                    disabled={!!exportProgress}
                    onChange={(event) => toggleExportView(id, event.target.checked)}
                  />
                  <Icon size={14} /> {label}
                </label>
              ))}
            </div>
          </div>
          <button
            className="button full bulk-generate"
            disabled={generating || overLimit || !seed.trim()}
            onClick={generate}
          >
            {generating ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
            {generating ? 'Kacheln werden erzeugt…' : 'Serie generieren'}
          </button>
          {error && (
            <p className="bulk-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p
              className={`bulk-notice ${message.error ? 'error-text' : ''}`}
              role={message.error ? 'alert' : 'status'}
            >
              {message.text}
            </p>
          )}
          {project && (
            <div className="bulk-meta">
              <span>
                {project.continuousNoise ? 'Gemeinsames Noise-Feld' : 'Eigenständige Noise-Felder'}
              </span>
              <span>
                {project.biomeMode === 'random'
                  ? 'Zufällige, variierte Biome'
                  : `Biom: ${BIOME_PRESETS.find((preset) => preset.id === project.biomeId)?.name ?? project.biomeId}`}
              </span>
              <span>Seed: {project.seed}</span>
            </div>
          )}
        </aside>
        <section className="bulk-board-panel">
          <div className="bulk-board-heading">
            <div>
              <span className="eyebrow">KACHELÜBERSICHT</span>
              <h2>{project ? `${project.tiles.length} Kacheln` : 'Dein Spielbrett'}</h2>
            </div>
            {project && (
              <div className="bulk-board-actions">
                <button
                  className="button secondary"
                  disabled={!selectedTile}
                  onClick={() => {
                    if (selectedTile) onEdit(selectedTile.id, selectedTile.config);
                  }}
                >
                  Kachel bearbeiten
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    setViewMode('2d');
                    onShuffle();
                  }}
                >
                  <Shuffle size={14} /> Zufällig anordnen
                </button>
                <button
                  className="button"
                  disabled={!!exportProgress || !exportViews.length}
                  onClick={() => onExport(exportViews)}
                >
                  {exportProgress?.mode === 'zip' ? (
                    <>
                      <LoaderCircle size={14} className="spin" /> ZIP {exportProgress.done}/
                      {exportProgress.total}
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine size={14} /> ZIP herunterladen
                    </>
                  )}
                </button>
                <button
                  className="button secondary"
                  disabled={!!exportProgress}
                  onClick={onSaveWorking}
                  title="Kachel-PNGs und Gesamtbild mit der gespeicherten Kameraansicht im Working-Ordner speichern"
                >
                  {exportProgress?.mode === 'working' ? (
                    <>
                      <LoaderCircle size={14} className="spin" /> {exportProgress.done}/
                      {exportProgress.total}
                    </>
                  ) : (
                    <>
                      <Save size={14} /> Working speichern
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
          {project && (
            <div className="bulk-view-tabs" role="tablist" aria-label="Serienansicht">
              <button
                role="tab"
                aria-selected={viewMode === '2d'}
                className={viewMode === '2d' ? 'active' : ''}
                disabled={previewLoading}
                onClick={() => setViewMode('2d')}
              >
                <Grid3X3 size={14} /> 2D-Draufsicht
              </button>
              <button
                role="tab"
                aria-selected={viewMode === '3d'}
                className={viewMode === '3d' ? 'active' : ''}
                disabled={previewLoading}
                onClick={() => setViewMode('3d')}
              >
                <Box size={14} /> 3D-Brett
              </button>
            </div>
          )}
          {project ? (
            previewLoading ? (
              <div className="bulk-preview-loading" role="status">
                <LoaderCircle size={20} className="spin" />
                <span>Kacheln für die Serienansicht werden vorbereitet…</span>
              </div>
            ) : previewError ? (
              <div className="bulk-preview-loading error-text" role="alert">
                <span>{previewError}</span>
                <button
                  className="button secondary compact"
                  onClick={() => {
                    setPreviewFailure(null);
                    setPreviewAttempt((attempt) => attempt + 1);
                  }}
                >
                  Erneut versuchen
                </button>
              </div>
            ) : previewTiles.length ? (
              <BulkSeriesViewer
                mode={viewMode}
                tiles={previewTiles}
                columns={project.columns}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onError={(message) => setPreviewFailure({ key: projectKey, message })}
              />
            ) : null
          ) : (
            <div className="bulk-empty">
              <Hexagon size={52} strokeWidth={1} />
              <h2>Noch kein Spielbrett</h2>
              <p>
                Wähle eine Größe und einen Seed. Die Kacheln erscheinen hier als auswählbares
                Hex-Brett.
              </p>
            </div>
          )}
          {project && (
            <p className="bulk-hint">
              {viewMode === '3d'
                ? 'Rechts ziehen zum Orbitieren · Scrollen zum Zoomen · Kachel anklicken zum Auswählen.'
                : 'Ziehen zum Verschieben · Mausrad zum Zoomen · Kachel anklicken zum Auswählen.'}{' '}
              Die Anordnung und alle Änderungen werden separat gespeichert.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
