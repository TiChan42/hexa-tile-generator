import {
  EFFECT_NAMES,
  STANDARD_EVENT_KINDS,
  RARE_EVENT_KINDS,
  EVENT_RESOURCES,
  RESOURCE_NAMES,
} from '../core/events';
import type { EventGenerator } from '../core/events';
import { CardNumber, CardSelect } from './StepEditor';
export default function GeneratorEditor({
  config,
  onChange,
  onRoll,
  busy,
}: {
  config: EventGenerator;
  onChange: (change: (draft: EventGenerator) => void) => void;
  onRoll: () => void;
  busy: boolean;
}) {
  return (
    <div className="event-generator">
      <h2>Zufallstopf</h2>
      <p>
        Aktionen, Ziele und Zahlen werden unabhängig kombiniert. Deine Änderungen wirken beim
        nächsten Würfeln.
      </p>
      <label className="card-control">
        <span>Karten-Seed</span>
        <input
          value={config.seed}
          maxLength={128}
          onChange={(event) => {
            if (event.target.value)
              onChange((draft) => {
                draft.seed = event.target.value;
              });
          }}
        />
      </label>
      <CardNumber
        label="Anzahl Karten"
        value={config.count}
        max={100}
        onChange={(value) =>
          onChange((draft) => {
            draft.count = value;
          })
        }
      />
      <CardSelect
        label="Kartenfamilie"
        value={config.theme}
        onChange={(value) =>
          onChange((draft) => {
            draft.theme = value as EventGenerator['theme'];
          })
        }
      >
        <option value="mixed">Alle Ereignisse mischen</option>
        <option value="alb">Nur Wandernder Alb</option>
        <option value="adventure">Bewegung & Abenteuer</option>
        <option value="resources">Ressourcen, Geschenke & Diebstahl</option>
      </CardSelect>
      <CardSelect
        label="Kombination erzeugter Effekte"
        value={config.mode}
        onChange={(value) =>
          onChange((draft) => {
            draft.mode = value as EventGenerator['mode'];
          })
        }
      >
        <option value="sequence">Nacheinander ausführen</option>
        <option value="choice">Einen Effekt auswählen</option>
        <option value="random">Beide Kartenarten mischen</option>
      </CardSelect>
      {(
        [
          ['steps', 'Effekte je Karte', 6],
          ['movement', 'Bewegungsschritte', 24],
          ['resources', 'Ressourcenmenge', 9],
          ['albGifts', 'Alb-Geschenk: Ressourcenmenge', 24],
          ['targetRank', 'Spielerrang', 6],
        ] as const
      ).map(([key, label, max]) => (
        <div className="card-pair" key={key}>
          <CardNumber
            label={`${label}: Minimum`}
            value={config[key].min}
            max={max}
            onChange={(min) =>
              onChange((draft) => {
                draft[key] = { min, max: Math.max(min, draft[key].max) };
              })
            }
          />
          <CardNumber
            label={`${label}: Maximum`}
            value={config[key].max}
            max={max}
            onChange={(value) =>
              onChange((draft) => {
                draft[key] = { min: Math.min(value, draft[key].min), max: value };
              })
            }
          />
        </div>
      ))}
      <label className="card-check">
        <input
          type="checkbox"
          checked={config.allowBackward}
          onChange={(event) =>
            onChange((draft) => {
              draft.allowBackward = event.target.checked;
            })
          }
        />
        Rückwärts ziehen und vorherige Spieler zulassen
      </label>
      <p className="card-note">
        Alb-Geschenke haben einen eigenen Mengenbereich. Als Gegenleistung rückt der Alb auf den
        Empfänger zu; die Entfernung liegt im Bereich der Bewegungsschritte.
      </p>
      <label className="card-check">
        <input
          type="checkbox"
          checked={config.allowTileChanges}
          onChange={(event) =>
            onChange((draft) => {
              draft.allowTileChanges = event.target.checked;
            })
          }
        />
        Gebiete drehen / verschieben in den Topf aufnehmen
      </label>
      <fieldset className="card-target-bases">
        <legend>Ziele für „nächster Spieler“</legend>
        {(['turn-order', 'board'] as const).map((basis) => (
          <label className="card-check" key={basis}>
            <input
              type="checkbox"
              checked={config.targetBases.includes(basis)}
              disabled={config.targetBases.length === 1 && config.targetBases[0] === basis}
              onChange={(event) =>
                onChange((draft) => {
                  draft.targetBases = event.target.checked
                    ? [...draft.targetBases, basis]
                    : draft.targetBases.filter((value) => value !== basis);
                })
              }
            />
            {basis === 'board' ? 'Entfernung entlang der Wege' : 'Zugreihenfolge'}
          </label>
        ))}
      </fieldset>
      <label className="card-control">
        <span>Anteil kostenpflichtiger Spieleraktionen · %</span>
        <input
          type="number"
          min={0}
          max={100}
          value={Math.round(config.costChance * 100)}
          onChange={(event) => {
            const value = event.target.valueAsNumber;
            if (Number.isFinite(value) && value >= 0 && value <= 100)
              onChange((draft) => {
                draft.costChance = value / 100;
              });
          }}
        />
      </label>
      {(
        [
          ['Aktionsgewichte', STANDARD_EVENT_KINDS],
          ['Seltene Aktionen', RARE_EVENT_KINDS],
        ] as const
      ).map(([label, kinds]) => (
        <details open key={label}>
          <summary>{label}</summary>
          {label === 'Seltene Aktionen' && (
            <p>
              Diese Aktionen haben anfangs Gewicht 1–2, normale Aktionen 10–25. Höhere Gewichte
              machen sie häufiger; 0 nimmt sie aus dem Topf. Die Kartenfamilie begrenzt die
              möglichen Aktionen.
            </p>
          )}
          {kinds.map((kind) => (
            <label className="card-weight" key={kind}>
              <span>{EFFECT_NAMES[kind]}</span>
              <input
                type="number"
                aria-label={`Kartengewicht ${EFFECT_NAMES[kind]}`}
                min={0}
                max={100}
                value={config.weights[kind]}
                onChange={(event) => {
                  const value = event.target.valueAsNumber;
                  if (Number.isFinite(value) && value >= 0 && value <= 100)
                    onChange((draft) => {
                      draft.weights[kind] = value;
                    });
                }}
              />
            </label>
          ))}
        </details>
      ))}
      <details>
        <summary>Gewichte bestimmter Ressourcen</summary>
        <p>
          Gold ist unabhängig. Höhere Mengen werden exponentiell seltener gewählt; „zufällig“ und
          „deiner Wahl“ bleiben zusätzliche Varianten.
        </p>
        {EVENT_RESOURCES.map((resource) => (
          <label className="card-weight" key={resource}>
            <span>{RESOURCE_NAMES[resource]}</span>
            <input
              aria-label={`Kartengewicht ${RESOURCE_NAMES[resource]}`}
              type="number"
              min={0}
              max={100}
              step="any"
              value={config.resourceWeights[resource]}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (Number.isFinite(value) && value >= 0 && value <= 100)
                  onChange((draft) => {
                    draft.resourceWeights[resource] = value;
                  });
              }}
            />
          </label>
        ))}
      </details>
      <button className="button full" disabled={busy} onClick={onRoll}>
        Kartenset würfeln
      </button>
      <p className="card-note">
        Wurf {config.revision} · Der neue Satz ersetzt die Karten in einem Undo-Schritt.
      </p>
    </div>
  );
}
