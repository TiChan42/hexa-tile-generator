import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { DECORATION_CATALOG } from '../core/objects';
import type { DecorationGroup, DecorationKind } from '../core/objects';
import { builtinObjectPreviewUrl } from '../render/objectPreview';

export interface ObjectPreviewOverride {
  name: string;
  preview?: string;
}
interface Props {
  selected: DecorationKind;
  onSelect: (kind: DecorationKind) => void;
  overrides: Partial<Record<DecorationKind, ObjectPreviewOverride>>;
}
const groups = [...new Set(DECORATION_CATALOG.map((entry) => entry.group))];
const normalize = (text: string): string =>
  text
    .toLocaleLowerCase('de')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

export default function ObjectLibrary({ selected, onSelect, overrides }: Props) {
  const [query, setQuery] = useState(''),
    [group, setGroup] = useState<DecorationGroup | 'all'>('all');
  const term = normalize(query.trim());
  const matches = DECORATION_CATALOG.filter(
    (entry) =>
      (group === 'all' || entry.group === group) &&
      normalize(`${entry.label} ${entry.group} ${entry.description}`).includes(term),
  );
  return (
    <div className="object-library">
      <div className="object-library-filters">
        <label className="object-search">
          <Search size={14} />
          <input
            type="search"
            aria-label="Objekte durchsuchen"
            placeholder="Objekte durchsuchen"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Objektsuche zurücksetzen"
              onClick={() => setQuery('')}
            >
              <X size={13} />
            </button>
          )}
        </label>
        <select
          aria-label="Objektgruppe"
          value={group}
          onChange={(event) => setGroup(event.target.value as DecorationGroup | 'all')}
        >
          <option value="all">Alle Gruppen</option>
          {groups.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <span className="object-library-count" aria-live="polite">
          {matches.length} von {DECORATION_CATALOG.length} Objekten
        </span>
      </div>
      <div className="object-library-scroll" aria-label="Objektbibliothek">
        {groups.map((name) => {
          const entries = matches.filter((entry) => entry.group === name);
          return (
            entries.length > 0 && (
              <div className="object-library-group" key={name}>
                <h4>
                  {name}
                  <span>{entries.length}</span>
                </h4>
                <div className="object-grid">
                  {entries.map((entry) => {
                    const override = overrides[entry.kind];
                    return (
                      <button
                        type="button"
                        key={entry.kind}
                        className={`object-card ${selected === entry.kind ? 'selected' : ''}`}
                        aria-label={entry.label}
                        aria-pressed={selected === entry.kind}
                        title={`${entry.description}${override ? ` Modell: ${override.name}.` : ''}`}
                        onClick={() => onSelect(entry.kind)}
                      >
                        <span className="object-thumbnail">
                          <img
                            src={override?.preview ?? builtinObjectPreviewUrl(entry.kind)}
                            alt={`${entry.label} · Voxelvorschau`}
                            width={144}
                            height={144}
                          />
                        </span>
                        <strong>{entry.label}</strong>
                        <small>{override ? 'ZUGEWIESEN' : 'VOXEL · 1 × 1'}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          );
        })}
        {!matches.length && (
          <div className="object-search-empty" role="status">
            <Search size={24} />
            <p>Keine Objekte gefunden.</p>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setQuery('');
                setGroup('all');
              }}
            >
              Alle Objekte anzeigen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
