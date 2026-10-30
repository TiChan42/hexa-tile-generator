import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  BookOpen,
  Copy,
  Hexagon,
  Layers3,
  Plus,
  Redo2,
  Save,
  Shuffle,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import {
  CARD_PALETTES,
  EVENT_VERSION,
  SPECIAL_EVENT_IDEAS,
  cardCategory,
  cardRules,
  defaultEffect,
  migrateEventProject,
  generateEventCards,
} from '../core/events';
import type { EventCard, EventProject } from '../core/events';
import { eventCardSvg, eventPrintHtml } from './svg';
import { useEventProject } from './useEventProject';
import { frontArtwork, backArtwork, projectArtwork } from './artwork';
import { cardPng, eventCardArchive, saveCardDownload } from './export';
import GeneratorEditor from './GeneratorEditor';
import StepEditor, { CardSelect } from './StepEditor';
import './cards.css';
interface SavedSet {
  id: string;
  name: string;
  cards: number;
  projectUrl: string;
}
const filename = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .slice(0, 60) || 'ereigniskarten';
async function apiJson(url: string, body?: unknown): Promise<unknown> {
  const response = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const result = (await response.json()) as { error?: string; details?: string[] };
  if (!response.ok) throw new Error([result.error, ...(result.details ?? [])].join(' '));
  return result;
}
export default function EventCardEditor() {
  const {
    project,
    update,
    replace,
    undo,
    redo,
    canUndo,
    canRedo,
    error: storageError,
  } = useEventProject();
  const [selectedId, setSelectedId] = useState('');
  const selected = project.cards.find((card) => card.id === selectedId) ?? project.cards[0];
  const [tab, setTab] = useState<'card' | 'generator' | 'design'>('card');
  const [side, setSide] = useState<'front' | 'back' | 'both'>('both');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [library, setLibrary] = useState<SavedSet[] | null>(null);
  const [includePng, setIncludePng] = useState(true);
  const [idea, setIdea] = useState(0);
  const [art, setArt] = useState({ key: '', image: '', error: '' });
  const [backArt, setBackArt] = useState({ key: '', image: '', error: '' });
  const backKey = JSON.stringify([project.generator.seed, project.design.backRevision]);
  const backImage = backArt.key === backKey ? backArt.image : '';
  const backError = backArt.key === backKey ? backArt.error : '';
  useEffect(() => {
    let active = true;
    void backArtwork(project.generator.seed, project.design.backRevision).then(
      (image) => {
        if (active) setBackArt({ key: backKey, image, error: '' });
      },
      (error) => {
        if (active)
          setBackArt({
            key: backKey,
            image: '',
            error: error instanceof Error ? error.message : 'Rückseitenaufnahme fehlgeschlagen.',
          });
      },
    );
    return () => {
      active = false;
    };
  }, [project.generator.seed, project.design.backRevision, backKey]);
  const artKey = JSON.stringify([project.generator.seed, selected?.id]);
  const artImage = art.key === artKey ? art.image : '';
  const artError = art.key === artKey ? art.error : '';
  useEffect(() => {
    if (!selected) return;
    let active = true;
    void frontArtwork(project.generator.seed, selected.id).then(
      (image) => {
        if (active) setArt({ key: artKey, image, error: '' });
      },
      (error) => {
        if (active)
          setArt({
            key: artKey,
            image: '',
            error: error instanceof Error ? error.message : '3D-Aufnahme fehlgeschlagen.',
          });
      },
    );
    return () => {
      active = false;
    };
  }, [project.generator.seed, selected, artKey]);

  const preview = useMemo(() => {
    if (!selected) return { front: '', back: '', error: '' };
    try {
      return {
        front: eventCardSvg(
          selected,
          project.design,
          'front',
          project.generator.seed,
          artImage || undefined,
        ),
        back: eventCardSvg(
          selected,
          project.design,
          'back',
          project.generator.seed,
          undefined,
          backImage || undefined,
        ),
        error: '',
      };
    } catch (error) {
      return {
        front: '',
        back: '',
        error: error instanceof Error ? error.message : 'Karte konnte nicht dargestellt werden.',
      };
    }
  }, [selected, project.design, project.generator.seed, artImage, backImage]);
  useEffect(() => {
    document.title = 'Ereigniskarten · Hexa Studio';
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [undo, redo]);
  const change = (edit: (draft: EventProject) => void) => {
    try {
      update(edit);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ungültige Änderung.');
    }
  };
  const changeCard = (edit: (card: EventCard) => void) => {
    if (selected) change((draft) => edit(draft.cards.find((card) => card.id === selected.id)!));
  };
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await operation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Aktion fehlgeschlagen.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };
  const roll = (single = false) => {
    try {
      const generator = {
        ...project.generator,
        revision: project.generator.revision === 2147483647 ? 0 : project.generator.revision + 1,
      };
      const index = selected ? project.cards.indexOf(selected) : 0;
      const family =
        selected && cardCategory(selected) === 'Wandernder Alb'
          ? 'alb'
          : selected && cardCategory(selected) === 'Ressourcen'
            ? 'resources'
            : 'adventure';
      const cards = generateEventCards(
        single
          ? { ...generator, theme: family, count: Math.max(generator.count, index + 1) }
          : generator,
      );
      change((draft) => {
        draft.generator = generator;
        if (!single)
          draft.design.backRevision =
            draft.design.backRevision === 2147483647 ? 0 : draft.design.backRevision + 1;
        if (single && selected) draft.cards[index] = cards[index]!;
        else draft.cards = cards;
      });
      setSelectedId(cards[single ? index : 0]!.id);
      setMessage(single ? 'Diese Karte wurde neu gewürfelt.' : 'Neues Kartenset gewürfelt.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Würfeln fehlgeschlagen.');
    }
  };
  const addCard = (copy = false) => {
    if (project.cards.length >= 100) return;
    let suffix = 1;
    while (project.cards.some((card) => card.id === `manual-${suffix}`)) suffix++;
    const id = `manual-${suffix}`;
    const card: EventCard =
      copy && selected
        ? { ...structuredClone(selected), id, title: `${selected.title.slice(0, 60)} · Kopie` }
        : {
            id,
            title: 'Neue Ereigniskarte',
            flavor: '',
            mode: 'sequence',
            steps: [{ id: 'effect-1', effect: defaultEffect('alb-move'), cost: null }],
          };
    change((draft) => {
      draft.cards.push(card);
    });
    setSelectedId(id);
    setTab('card');
  };
  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await run(async () => {
      if (file.size > 2 * 1024 * 1024)
        throw new Error('Eine Projektdatei darf höchstens 2 MB groß sein.');
      const parsed = migrateEventProject(JSON.parse(await file.text()));
      replace(parsed);
      setSelectedId(parsed.cards[0]?.id ?? '');
      setMessage('Kartenset importiert.');
    });
  };
  const exportZip = () =>
    run(async () => {
      const snapshot = structuredClone(project);
      const blob = await eventCardArchive(snapshot, includePng, (done, total) =>
        setProgress(`${done} / ${total}`),
      );
      saveCardDownload(blob, `${filename(snapshot.name)}.zip`);
      setMessage('Kartenset mit Rückseite und Druckbogen exportiert.');
    });
  const save = () =>
    run(async () => {
      const snapshot = structuredClone(project);
      const artwork = await projectArtwork(snapshot, (done, total) =>
        setProgress(`${done} / ${total}`),
      );
      const backImage = await backArtwork(snapshot.generator.seed, snapshot.design.backRevision);
      const result = (await apiJson('/api/card-projects', {
        project: snapshot,
        artwork,
        backImage,
      })) as {
        path: string;
      };
      setMessage(`Gespeichert unter ${result.path}.`);
    });
  const openLibrary = () =>
    run(async () => {
      setLibrary((await apiJson('/api/card-projects')) as SavedSet[]);
    });
  return (
    <div className="event-studio">
      <header className="event-header">
        <a className="brand" href="/" aria-label="Hexa Studio Startseite">
          <span className="brand-mark">
            <Hexagon size={28} />
          </span>
          <span>
            hexa<span className="brand-light">studio</span>
            <small>EREIGNISSE, DIE DAS SPIEL VERÄNDERN</small>
          </span>
        </a>
        <a className="event-tile-link" href="/">
          <ArrowLeft size={15} />
          Tile-Editor
        </a>
        <div className="event-header-tools">
          <button
            className="icon-button"
            aria-label="Karten rückgängig"
            disabled={!canUndo || busy}
            onClick={undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Karten wiederholen"
            disabled={!canRedo || busy}
            onClick={redo}
          >
            <Redo2 size={18} />
          </button>
          <button className="subtle-button" disabled={busy} onClick={() => void openLibrary()}>
            <Layers3 size={16} />
            <span>Gespeicherte Sets</span>
          </button>
          <button
            className="button"
            disabled={busy || !project.cards.length || !!preview.error || !!artError}
            onClick={() => void exportZip()}
          >
            <ArrowDownToLine size={16} />
            <span>{busy ? progress || 'Bitte warten…' : 'Kartenset exportieren'}</span>
          </button>
        </div>
      </header>
      <div className="event-heading">
        <div>
          <span className="event-eyebrow">DEIN EIGENES KARTENSET</span>
          <h1>Ereigniskarten</h1>
          <p>Wandernder Alb, neue Wege und riskante Entscheidungen.</p>
        </div>
        <label className="event-project-name">
          <span>Name des Kartensets</span>
          <input
            aria-label="Name des Kartensets"
            value={project.name}
            maxLength={80}
            onChange={(event) => {
              if (event.target.value.trim())
                change((draft) => {
                  draft.name = event.target.value;
                });
            }}
          />
        </label>
      </div>
      {(message || storageError) && (
        <div className="event-message" role="status">
          {message || storageError}
          <button
            aria-label="Kartenmeldung schließen"
            className="icon-button"
            onClick={() => setMessage('')}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <main className="event-workspace">
        <aside className="event-library" aria-label="Kartenbibliothek">
          <div className="event-library-title">
            <strong>{project.cards.length} Karten</strong>
            <button
              className="icon-button"
              aria-label="Neue Ereigniskarte"
              disabled={busy || project.cards.length >= 100}
              onClick={() => addCard()}
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="event-card-list">
            {project.cards.map((card, index) => (
              <button
                key={card.id}
                className={`event-list-card ${selected?.id === card.id ? 'selected' : ''}`}
                aria-label={`Karte ${index + 1}: ${card.title}`}
                aria-pressed={selected?.id === card.id}
                onClick={() => {
                  setSelectedId(card.id);
                  setTab('card');
                }}
              >
                <span className="event-list-number">{String(index + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{card.title}</strong>
                  <small>
                    {cardCategory(card)} · {card.steps.length}{' '}
                    {card.steps.length === 1 ? 'Effekt' : 'Effekte'}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <div className="event-library-footer">
            <button
              className="button secondary full"
              disabled={busy}
              onClick={() => setTab('generator')}
            >
              <Shuffle size={15} />
              Zufallstopf einstellen
            </button>
            <label className="button secondary full">
              <Upload size={15} />
              JSON importieren
              <input
                type="file"
                accept="application/json,.json"
                aria-label="Kartenset importieren"
                hidden
                disabled={busy}
                onChange={(event) => void importJson(event)}
              />
            </label>
            <button
              className="text-button"
              onClick={() =>
                saveCardDownload(
                  new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
                  `${filename(project.name)}.json`,
                )
              }
            >
              Projekt-JSON herunterladen
            </button>
          </div>
        </aside>
        <section className="event-stage" aria-label="Kartenvorschau">
          <div className="event-preview-toolbar">
            <div className="event-tabs" role="group" aria-label="Kartenseite">
              {(
                [
                  ['front', 'Vorderseite'],
                  ['back', 'Rückseite'],
                  ['both', 'Beide Seiten'],
                ] as const
              ).map(([value, label]) => (
                <button key={value} aria-pressed={side === value} onClick={() => setSide(value)}>
                  {label}
                </button>
              ))}
            </div>
            <span>63 × 88 mm</span>
          </div>
          {!backImage && (
            <p role={backError ? 'alert' : 'status'} className="card-note">
              {backError || 'Kartenlandschaft wird gerendert…'}
            </p>
          )}
          {selected && !artImage && (
            <p role={artError ? 'alert' : 'status'} className="card-note">
              {artError || '3D-Landschaft wird gerendert…'}
            </p>
          )}
          <div className={`event-preview-cards ${side === 'both' ? 'both' : ''}`}>
            {preview.error ? (
              <div className="event-empty" role="alert">
                {preview.error}
              </div>
            ) : selected ? (
              <>
                {side !== 'back' && (
                  <figure>
                    <img
                      alt={`Vorderseite: ${selected.title}`}
                      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.front)}`}
                    />
                    <figcaption>Vorderseite</figcaption>
                  </figure>
                )}
                {side !== 'front' && (
                  <figure>
                    <img
                      alt="Gemeinsame Kartenrückseite"
                      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.back)}`}
                    />
                    <figcaption>Gemeinsame Rückseite</figcaption>
                  </figure>
                )}
              </>
            ) : (
              <div className="event-empty">
                <BookOpen size={44} />
                <h2>Platz für neue Geschichten</h2>
                <p>Erstelle eine Karte oder würfle ein ganzes Set.</p>
                <button className="button" onClick={() => addCard()}>
                  Erste Karte erstellen
                </button>
              </div>
            )}
          </div>
          <div className="event-preview-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                change((draft) => {
                  draft.design.backRevision =
                    draft.design.backRevision === 2147483647 ? 0 : draft.design.backRevision + 1;
                })
              }
            >
              <Shuffle size={15} />
              Rückseite würfeln
            </button>
            <button
              className="button secondary"
              disabled={!selected || busy}
              onClick={() => roll(true)}
            >
              <Shuffle size={15} />
              Diese Karte würfeln
            </button>
            <button
              className="button secondary"
              disabled={!selected || busy || project.cards.length >= 100}
              onClick={() => addCard(true)}
            >
              <Copy size={15} />
              Duplizieren
            </button>
            <button
              className="icon-button"
              aria-label="Ausgewählte Karte löschen"
              disabled={!selected || busy}
              onClick={() =>
                change((draft) => {
                  draft.cards = draft.cards.filter((card) => card.id !== selected?.id);
                })
              }
            >
              <Trash2 size={17} />
            </button>
          </div>
          {selected && (
            <details className="event-rules">
              <summary>Regelhinweise zu dieser Karte</summary>
              <ul>
                {cardRules(selected, project.design).map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="event-stage-footer">
            <span>{EVENT_VERSION} · Unabhängig von deinen Tiles</span>
            <span>{storageError ? 'Speicherung prüfen' : 'Lokal gespeichert'}</span>
          </div>
        </section>
        <aside className="event-inspector" aria-label="Karten bearbeiten">
          <div className="event-inspector-tabs">
            {(
              [
                ['card', 'Karte'],
                ['generator', 'Zufallstopf'],
                ['design', 'Design & Export'],
              ] as const
            ).map(([value, label]) => (
              <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>
                {label}
              </button>
            ))}
          </div>
          <div className="event-inspector-content">
            {tab === 'card' && selected && (
              <>
                <h2>Karte bearbeiten</h2>
                <label className="card-control">
                  <span>Kartentitel</span>
                  <input
                    value={selected.title}
                    maxLength={70}
                    onChange={(event) => {
                      if (event.target.value.trim())
                        changeCard((card) => {
                          card.title = event.target.value;
                        });
                    }}
                  />
                </label>
                <label className="card-control">
                  <span>Atmosphärischer Zusatz</span>
                  <textarea
                    maxLength={160}
                    value={selected.flavor}
                    onChange={(event) =>
                      changeCard((card) => {
                        card.flavor = event.target.value;
                      })
                    }
                  />
                </label>
                <CardSelect
                  label="Effekte kombinieren"
                  value={selected.mode}
                  onChange={(value) =>
                    changeCard((card) => {
                      card.mode = value as EventCard['mode'];
                    })
                  }
                >
                  <option value="sequence">Der Reihe nach ausführen</option>
                  <option value="choice">Genau einen Effekt auswählen</option>
                </CardSelect>
                {selected.steps.map((step, index) => (
                  <StepEditor
                    key={step.id}
                    step={step}
                    index={index}
                    total={selected.steps.length}
                    onChange={(value) =>
                      changeCard((card) => {
                        card.steps[index] = value;
                      })
                    }
                    onRemove={() =>
                      changeCard((card) => {
                        card.steps.splice(index, 1);
                      })
                    }
                    onMove={(direction) =>
                      changeCard((card) => {
                        [card.steps[index], card.steps[index + direction]] = [
                          card.steps[index + direction]!,
                          card.steps[index]!,
                        ];
                      })
                    }
                  />
                ))}
                <CardSelect
                  label="Ereignisidee auswählen"
                  value={String(idea)}
                  onChange={(value) => setIdea(Number(value))}
                >
                  {SPECIAL_EVENT_IDEAS.map((text, index) => (
                    <option key={text} value={index}>
                      {text}
                    </option>
                  ))}
                </CardSelect>
                <button
                  className="button secondary full"
                  disabled={selected.steps.length >= 6}
                  onClick={() =>
                    changeCard((card) => {
                      let i = 1;
                      while (card.steps.some((step) => step.id === `effect-${i}`)) i++;
                      card.steps.push({
                        id: `effect-${i}`,
                        effect: { kind: 'custom', text: SPECIAL_EVENT_IDEAS[idea]! },
                        cost: null,
                      });
                    })
                  }
                >
                  Idee als Effekt hinzufügen
                </button>
                <button
                  className="button secondary full"
                  disabled={selected.steps.length >= 6}
                  onClick={() =>
                    changeCard((card) => {
                      let i = 1;
                      while (card.steps.some((step) => step.id === `effect-${i}`)) i++;
                      card.steps.push({
                        id: `effect-${i}`,
                        effect: defaultEffect('resources'),
                        cost: null,
                      });
                    })
                  }
                >
                  <Plus size={15} />
                  Effekt hinzufügen
                </button>
              </>
            )}
            {tab === 'card' && !selected && <p>Erstelle eine Karte, um Effekte zu bearbeiten.</p>}
            {tab === 'generator' && (
              <GeneratorEditor
                config={project.generator}
                busy={busy}
                onChange={(edit) => change((draft) => edit(draft.generator))}
                onRoll={() => roll()}
              />
            )}
            {tab === 'design' && (
              <>
                <h2>Passend zu deinen Hexagonen</h2>
                <p>Gemeinsame Farben, klare Symbole und eine Rückseite für das gesamte Set.</p>
                <CardSelect
                  label="Kartenfarbwelt"
                  value={project.design.palette}
                  onChange={(value) =>
                    change((draft) => {
                      draft.design.palette = value as EventProject['design']['palette'];
                      if (value !== 'custom')
                        Object.assign(
                          draft.design,
                          CARD_PALETTES[value as keyof typeof CARD_PALETTES],
                        );
                    })
                  }
                >
                  <option value="moss">Mooslicht</option>
                  <option value="amethyst">Amethyst</option>
                  <option value="treasure">Schatz & Gold</option>
                  <option value="custom">Eigene Farben</option>
                </CardSelect>
                {(
                  [
                    ['background', 'Papierfarbe'],
                    ['ink', 'Schriftfarbe'],
                    ['accent', 'Akzentfarbe'],
                  ] as const
                ).map(([key, label]) => (
                  <label className="card-control" key={key}>
                    <span>{label}</span>
                    <input
                      type="color"
                      value={project.design[key]}
                      onChange={(event) =>
                        change((draft) => {
                          draft.design[key] = event.target.value;
                          draft.design.palette = 'custom';
                        })
                      }
                    />
                  </label>
                ))}
                <label className="card-control">
                  <span>Titel der Rückseite</span>
                  <input
                    value={project.design.backTitle}
                    maxLength={45}
                    onChange={(event) => {
                      if (event.target.value.trim())
                        change((draft) => {
                          draft.design.backTitle = event.target.value;
                        });
                    }}
                  />
                </label>
                <label className="card-control">
                  <span>Rückseitenmotto</span>
                  <input
                    value={project.design.footer}
                    maxLength={60}
                    onChange={(event) =>
                      change((draft) => {
                        draft.design.footer = event.target.value;
                      })
                    }
                  />
                </label>
                <CardSelect
                  label="Physische Spielerentfernung"
                  value={project.design.distanceMetric}
                  onChange={(value) =>
                    change((draft) => {
                      draft.design.distanceMetric = value as 'path' | 'air';
                    })
                  }
                >
                  <option value="path">Kürzester Weg entlang der Felder</option>
                  <option value="air">Luftlinie zwischen Figuren</option>
                </CardSelect>
                <hr />
                <h2>Speichern & Drucken</h2>
                <label className="card-check">
                  <input
                    type="checkbox"
                    checked={includePng}
                    onChange={(event) => setIncludePng(event.target.checked)}
                  />
                  Zusätzlich PNGs mit 1512 × 2112 Pixeln
                </label>
                <button
                  className="button full"
                  disabled={busy || !selected || !!preview.error || !!artError}
                  onClick={() => void exportZip()}
                >
                  Kartenset als ZIP herunterladen
                </button>
                <button
                  className="button secondary full"
                  disabled={busy || !selected || !!preview.error || !!artError}
                  onClick={() =>
                    void run(async () => {
                      saveCardDownload(
                        new Blob(
                          [
                            eventPrintHtml(
                              project,
                              await projectArtwork(project),
                              await backArtwork(
                                project.generator.seed,
                                project.design.backRevision,
                              ),
                            ),
                          ],
                          {
                            type: 'text/html',
                          },
                        ),
                        `${filename(project.name)}-druck.html`,
                      );
                    })
                  }
                >
                  A4-Druckbogen herunterladen
                </button>
                <button
                  className="button secondary full"
                  disabled={busy || !selected || !!preview.error || !!artError}
                  onClick={() => void save()}
                >
                  <Save size={15} />
                  Kartenset in Working speichern
                </button>
                <button
                  className="text-button"
                  disabled={busy || !selected || !!preview.error || !!artError}
                  onClick={() =>
                    void run(async () => {
                      const svg = eventCardSvg(
                        selected!,
                        project.design,
                        side === 'back' ? 'back' : 'front',
                        project.generator.seed,
                        await frontArtwork(project.generator.seed, selected!.id),
                        await backArtwork(project.generator.seed, project.design.backRevision),
                      );
                      saveCardDownload(
                        new Blob([(await cardPng(svg)) as Uint8Array<ArrayBuffer>], {
                          type: 'image/png',
                        }),
                        `${filename(selected!.title)}.png`,
                      );
                    })
                  }
                >
                  Aktuelle Kartenseite als PNG
                </button>
                <p className="card-note">
                  ZIP enthält editierbares JSON, SVGs, Rückseite, Regelhinweise und A4-Druckbogen.
                  Duplexdruck: lange Kante, tatsächliche Größe. Lange Effektfolgen benötigen
                  kleinere Schrift; bei Textüberlauf den Text kürzen.
                </p>
                <details>
                  <summary>API verwenden</summary>
                  <p>
                    Generator, Kartendesign und Speicherung sind auch über die lokale API
                    erreichbar.
                  </p>
                  <code>POST /api/cards/generate</code>
                  <code>POST /api/cards/render</code>
                  <code>POST /api/card-projects</code>
                  <a href="/api/cards/schema" target="_blank" rel="noreferrer">
                    JSON-Schemata öffnen
                  </a>
                </details>
              </>
            )}
          </div>
        </aside>
      </main>
      {library && (
        <div className="event-dialog-shade">
          <section
            className="event-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Gespeicherte Kartensets"
          >
            <div>
              <h2>Gespeicherte Kartensets</h2>
              <button
                className="icon-button"
                aria-label="Kartenbibliothek schließen"
                onClick={() => setLibrary(null)}
              >
                <X size={20} />
              </button>
            </div>
            {library.length ? (
              library.map((set) => (
                <button
                  className="event-saved-set"
                  key={set.id}
                  onClick={() =>
                    void run(async () => {
                      const loaded = migrateEventProject(await apiJson(set.projectUrl));
                      replace(loaded);
                      setSelectedId(loaded.cards[0]?.id ?? '');
                      setLibrary(null);
                      setMessage('Gespeichertes Kartenset geladen.');
                    })
                  }
                >
                  <strong>{set.name}</strong>
                  <span>{set.cards} Karten</span>
                </button>
              ))
            ) : (
              <p>Noch keine Kartensets im Working-Ordner gespeichert.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
