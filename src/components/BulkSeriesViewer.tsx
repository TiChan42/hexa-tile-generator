import { useEffect, useRef } from 'react';
import { Maximize2 } from 'lucide-react';
import { createSeriesRenderer } from '../render/SeriesRenderer';
import type { SeriesPreviewTile } from '../render/SeriesRenderer';
import { ASSET_LIBRARY } from '../render/voxels';
import type { VoxelModel } from '../render/voxels';

interface Props {
  mode: '2d' | '3d';
  tiles: SeriesPreviewTile[];
  columns: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onError: (message: string) => void;
}

export default function BulkSeriesViewer({
  mode,
  tiles,
  columns,
  selectedId,
  onSelect,
  onError,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof createSeriesRenderer> | null>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const callbacks = useRef({ onSelect, onError, selectedId });
  const gesture = useRef({ x: 0, y: 0, moved: false });
  useEffect(() => {
    callbacks.current = { onSelect, onError, selectedId };
    renderer.current?.setSelected(selectedId);
  }, [onSelect, onError, selectedId]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const controller = new AbortController();
    let instance: ReturnType<typeof createSeriesRenderer> | null = null;
    const builtins = new Set(ASSET_LIBRARY.map(({ id }) => id));
    const modelIds = new Set(
      tiles
        .flatMap(({ config }) =>
          config.decoration.enabled ? Object.values(config.decoration.modelSlots ?? {}) : [],
        )
        .filter((id): id is string => !!id && !builtins.has(id)),
    );
    void Promise.all(
      [...modelIds].map(async (id): Promise<VoxelModel> => {
        const response = await fetch(`/api/models/${encodeURIComponent(id)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Modell ${id} konnte nicht geladen werden.`);
        return response.json() as Promise<VoxelModel>;
      }),
    )
      .then((models) => {
        if (controller.signal.aborted) return;
        instance = createSeriesRenderer(container, {
          mode,
          tiles,
          columns,
          models,
          selectedId: callbacks.current.selectedId,
          onSelect: (id) => callbacks.current.onSelect(id),
          onTileBounds: ({ id, left, top, width, height }) => {
            const element = labels.current.get(id);
            if (!element) return;
            Object.assign(element.style, {
              visibility: 'visible',
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
              fontSize: `${Math.max(8, Math.min(22, width * 0.065))}px`,
            });
          },
        });
        renderer.current = instance;
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          callbacks.current.onError(
            error instanceof Error ? error.message : 'Serienansicht konnte nicht geladen werden.',
          );
      });
    return () => {
      controller.abort();
      instance?.dispose();
      renderer.current = null;
    };
  }, [mode, tiles, columns]);

  return (
    <div className="bulk-series-viewer">
      <div
        ref={host}
        className={`bulk-series-canvas ${mode === '2d' ? 'bulk-series-2d' : ''}`}
        onPointerDownCapture={(event) => {
          gesture.current = { x: event.clientX, y: event.clientY, moved: false };
          event.currentTarget.dataset.dragging = 'true';
        }}
        onPointerMoveCapture={(event) => {
          if (
            event.buttons &&
            Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 5
          )
            gesture.current.moved = true;
        }}
        onPointerUpCapture={(event) => {
          delete event.currentTarget.dataset.dragging;
        }}
        onPointerCancel={(event) => {
          delete event.currentTarget.dataset.dragging;
          gesture.current.moved = true;
        }}
        onClickCapture={(event) => {
          if (gesture.current.moved && event.detail !== 0) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {mode === '2d' && (
          <div className="bulk-series-labels">
            {tiles.map(({ id, config }) => (
              <button
                type="button"
                key={id}
                ref={(element) => {
                  if (element) labels.current.set(id, element);
                  else labels.current.delete(id);
                }}
                className={`bulk-map-tile ${selectedId === id ? 'selected' : ''}`}
                aria-label={`${config.name} auswählen`}
                aria-pressed={selectedId === id}
                title={config.name}
                onClick={() => onSelect(id)}
              >
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <polygon points="25,0 75,0 100,50 75,100 25,100 0,50" />
                </svg>
                <strong>{config.name}</strong>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="bulk-fit-view button secondary compact"
        aria-label="Gesamte Serie einpassen"
        title="Gesamte Serie einpassen"
        onClick={() => renderer.current?.fit()}
      >
        <Maximize2 size={15} /> Alles anzeigen
      </button>
    </div>
  );
}
