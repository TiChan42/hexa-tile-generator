import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { TileRenderer } from '../render';
import type { GeneratedTile, TileConfig, Point } from '../core/types';

interface Props {
  tile: GeneratedTile;
  config: TileConfig;
  selection: string[];
  selectedFieldId?: string;
  rendererRef: RefObject<TileRenderer | null>;
  onCellClick: (id: string, point?: Point) => void;
  onFieldClick: (id: string) => void;
  onError: (message: string) => void;
}
export default function Viewport({
  tile,
  config,
  selection,
  selectedFieldId,
  rendererRef,
  onCellClick,
  onFieldClick,
  onError,
}: Props) {
  const element = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onCellClick, onFieldClick, onError });
  useEffect(() => {
    callbacks.current = { onCellClick, onFieldClick, onError };
  }, [onCellClick, onFieldClick, onError]);
  useEffect(() => {
    if (!element.current) return;
    let instance: TileRenderer;
    try {
      instance = new TileRenderer(element.current, {
        onCellClick: (id, point) => callbacks.current.onCellClick(id, point),
        onFieldClick: (id) => callbacks.current.onFieldClick(id),
        onError: (message) => callbacks.current.onError(message),
      });
      rendererRef.current = instance;
    } catch (error) {
      callbacks.current.onError(
        error instanceof Error ? error.message : '3D-Ansicht konnte nicht geladen werden.',
      );
      return;
    }
    return () => {
      instance.dispose();
      rendererRef.current = null;
    };
  }, [rendererRef]);
  useEffect(() => {
    rendererRef.current?.update(tile, config);
  }, [tile, config, rendererRef]);
  useEffect(() => {
    rendererRef.current?.setSelection(selection, selectedFieldId);
  }, [tile, config, selection, selectedFieldId, rendererRef]);
  return (
    <div
      ref={element}
      className="webgl-viewport"
      data-testid="viewport"
      role="img"
      aria-label="Interaktive 3D-Vorschau der hexagonalen Spielkachel"
    />
  );
}
