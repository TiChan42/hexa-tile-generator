import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  EFFECT_NAMES,
  EVENT_KINDS,
  RARE_EVENT_KINDS,
  EVENT_RESOURCES,
  RESOURCE_NAMES,
  defaultEffect,
} from '../core/events';
import type { EventStep, PlayerTarget, ResourceSelection } from '../core/events';

export function CardSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="card-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}
export function CardNumber({
  label,
  value,
  onChange,
  min = 1,
  max = 24,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="card-control">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const n = event.target.valueAsNumber;
          if (Number.isInteger(n) && n >= min && n <= max) onChange(n);
        }}
      />
    </label>
  );
}
export function ResourceSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ResourceSelection;
  onChange: (value: ResourceSelection) => void;
}) {
  return (
    <CardSelect
      label={label}
      value={value}
      onChange={(value) => onChange(value as ResourceSelection)}
    >
      <option value="random">Zufällige Ressourcen</option>
      <option value="choice">Ressourcen deiner Wahl</option>
      {EVENT_RESOURCES.map((id) => (
        <option key={id} value={id}>
          {RESOURCE_NAMES[id]}
        </option>
      ))}
    </CardSelect>
  );
}
function TargetEditor({
  value,
  onChange,
  label,
  monster,
  allowAll = true,
  allowActive = true,
  allLabel = 'Alle Spieler',
}: {
  value: PlayerTarget;
  onChange: (target: PlayerTarget) => void;
  label: string;
  monster: boolean;
  allowAll?: boolean;
  allowActive?: boolean;
  allLabel?: string;
}) {
  return (
    <div className="card-target">
      <CardSelect
        label={`${label}: Zielbezug`}
        value={value.kind}
        onChange={(kind) =>
          onChange(
            kind === 'active'
              ? { kind }
              : kind === 'all'
                ? { kind }
                : kind === 'turn-order'
                  ? { kind, direction: 'next', rank: 1 }
                  : {
                      kind: 'board',
                      direction: 'any',
                      rank: 1,
                      origin: monster ? 'alb' : 'active-player',
                    },
          )
        }
      >
        {allowActive && <option value="active">Aktiver Spieler</option>}
        <option value="turn-order">Spieler in Zugreihenfolge</option>
        <option value="board">Spieler nach Brettentfernung</option>
        {allowAll && <option value="all">{allLabel}</option>}
      </CardSelect>
      {(value.kind === 'turn-order' || value.kind === 'board') && (
        <>
          <CardNumber
            label={`${label}: Spielerrang`}
            value={value.rank}
            max={6}
            onChange={(rank) => onChange({ ...value, rank })}
          />
          <CardSelect
            label={`${label}: Zielrichtung`}
            value={value.direction}
            onChange={(direction) => onChange({ ...value, direction } as PlayerTarget)}
          >
            {value.kind === 'turn-order' ? (
              <>
                <option value="next">Nächster / nachfolgender</option>
                <option value="previous">Vorheriger / davor</option>
              </>
            ) : (
              <>
                <option value="any">Nächster in beliebiger Richtung</option>
                <option value="forward">Nächster in Vorwärtsrichtung</option>
                <option value="backward">Vorheriger in Rückwärtsrichtung</option>
              </>
            )}
          </CardSelect>
          {value.kind === 'board' && (
            <CardSelect
              label={`${label}: Entfernung ab`}
              value={value.origin}
              onChange={(origin) =>
                onChange({ ...value, origin: origin as 'alb' | 'active-player' })
              }
            >
              <option value="active-player">Aktiver Spieler</option>
              <option value="alb">Wandernder Alb</option>
            </CardSelect>
          )}
        </>
      )}
    </div>
  );
}
export default function StepEditor({
  step,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  step: EventStep;
  index: number;
  total: number;
  onChange: (step: EventStep) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const effect = step.effect,
    prefix = `Effekt ${index + 1}`;
  const action =
    (effect.kind === 'move' || effect.kind === 'pentagon') && effect.direction === 'backward'
      ? `${effect.kind}-backward`
      : effect.kind;
  const movementNames = {
    move: 'Vorwärts ziehen',
    'move-backward': 'Rückwärts ziehen',
    pentagon: 'Zum nächsten Pentagon',
    'pentagon-backward': 'Zum vorherigen Pentagon',
  };
  const patch = (value: object) =>
    onChange({ ...step, effect: { ...effect, ...value } as EventStep['effect'] });
  return (
    <fieldset className="event-step">
      <legend>{prefix}</legend>
      <div className="event-step-tools">
        <strong>
          {action in movementNames
            ? movementNames[action as keyof typeof movementNames]
            : EFFECT_NAMES[effect.kind]}
        </strong>
        <button
          className="icon-button"
          aria-label={`${prefix} nach oben`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp size={15} />
        </button>
        <button
          className="icon-button"
          aria-label={`${prefix} nach unten`}
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown size={15} />
        </button>
        <button
          className="icon-button"
          aria-label={`${prefix} entfernen`}
          disabled={total === 1}
          onClick={onRemove}
        >
          <Trash2 size={15} />
        </button>
      </div>
      <CardSelect
        label={`${prefix}: Aktion`}
        value={action}
        onChange={(value) => {
          const kind = value.replace(/-backward$/, '') as keyof typeof EFFECT_NAMES;
          const next = kind === effect.kind ? effect : defaultEffect(kind);
          onChange({
            ...step,
            effect:
              next.kind === 'move' || next.kind === 'pentagon'
                ? { ...next, direction: value.endsWith('-backward') ? 'backward' : 'forward' }
                : next,
          });
        }}
      >
        {[...EVENT_KINDS, 'custom' as const].flatMap((kind) =>
          kind === 'move' || kind === 'pentagon'
            ? [
                <option key={kind} value={kind}>
                  {movementNames[kind]}
                </option>,
                <option key={`${kind}-backward`} value={`${kind}-backward`}>
                  {movementNames[`${kind}-backward`]}
                </option>,
              ]
            : [
                <option key={kind} value={kind}>
                  {EFFECT_NAMES[kind]}
                  {RARE_EVENT_KINDS.some((rare) => rare === kind) ? ' · selten' : ''}
                </option>,
              ],
        )}
      </CardSelect>
      {'target' in effect && (
        <TargetEditor
          label={prefix}
          value={effect.target}
          monster={effect.kind.startsWith('alb-')}
          allowAll={!['alb-move', 'alb-give', 'bonus-roll'].includes(effect.kind)}
          allowActive={effect.kind !== 'steal'}
          onChange={(target) => patch({ target })}
        />
      )}
      {effect.kind === 'gift' && (
        <>
          <CardSelect
            label={`${prefix}: Geschenk von`}
            value={effect.source.kind}
            onChange={(kind) =>
              patch({
                source:
                  kind === 'bank'
                    ? { kind: 'bank' }
                    : {
                        kind: 'players',
                        target: { kind: 'turn-order', direction: 'next', rank: 1 },
                        inventory: 'carried',
                      },
              })
            }
          >
            <option value="bank">Bank</option>
            <option value="players">Andere Spieler</option>
          </CardSelect>
          {effect.source.kind === 'players' && (
            <>
              <TargetEditor
                label={`${prefix}: Geber`}
                value={effect.source.target}
                monster={false}
                allowActive={false}
                allLabel="Alle anderen Spieler"
                onChange={(target) => patch({ source: { ...effect.source, target } })}
              />
              <CardSelect
                label={`${prefix}: Vorrat des Gebers`}
                value={effect.source.inventory}
                onChange={(inventory) => patch({ source: { ...effect.source, inventory } })}
              >
                <option value="carried">Mitgeführte Ressourcen</option>
                <option value="stored">Eingelagertes Vermögen</option>
              </CardSelect>
            </>
          )}
          <CardSelect
            label={`${prefix}: Geschenk ablegen`}
            value={effect.destination}
            onChange={(destination) => patch({ destination })}
          >
            <option value="carried">Im eigenen mitgeführten Vorrat</option>
            <option value="stored">Direkt im eigenen Lager</option>
          </CardSelect>
        </>
      )}
      {effect.kind === 'protection' && (
        <>
          <CardSelect
            label={`${prefix}: Schutz vor`}
            value={effect.against}
            onChange={(against) => patch({ against })}
          >
            <option value="all">Alb und anderen Spielern</option>
            <option value="alb">Wanderndem Alb</option>
            <option value="players">Anderen Spielern</option>
          </CardSelect>
          <CardNumber
            label={`${prefix}: Eigene Züge bis Schutzende`}
            value={effect.turns}
            max={3}
            onChange={(turns) => patch({ turns })}
          />
        </>
      )}
      {effect.kind === 'alb-give' && (
        <>
          <p className="card-note">
            Der Alb hat einen unendlichen Vorrat. Als Gegenleistung kommt er auf den Empfänger zu.
          </p>
          <CardNumber
            label={`${prefix}: Annäherung des Albs`}
            value={effect.approach.amount}
            onChange={(amount) => patch({ approach: { ...effect.approach, amount } })}
          />
          <CardSelect
            label={`${prefix}: Einheit der Gegenleistung`}
            value={effect.approach.unit}
            onChange={(unit) => patch({ approach: { ...effect.approach, unit } })}
          >
            <option value="pentagons">Pentagone Richtung Empfänger</option>
            <option value="fields">Felder Richtung Empfänger</option>
          </CardSelect>
        </>
      )}
      {effect.kind === 'alb-move' && (
        <>
          <label className="card-check">
            <input
              type="checkbox"
              checked={effect.limit !== null}
              onChange={(event) =>
                patch({ limit: event.target.checked ? { amount: 2, unit: 'pentagons' } : null })
              }
            />
            Bewegung des Albs begrenzen
          </label>
          {effect.limit && (
            <div className="card-pair">
              <CardNumber
                label={`${prefix}: Bewegungslimit`}
                value={effect.limit.amount}
                onChange={(amount) => patch({ limit: { ...effect.limit!, amount } })}
              />
              <CardSelect
                label={`${prefix}: Einheit`}
                value={effect.limit.unit}
                onChange={(unit) => patch({ limit: { ...effect.limit!, unit } })}
              >
                <option value="fields">Felder</option>
                <option value="pentagons">Pentagone</option>
              </CardSelect>
            </div>
          )}
        </>
      )}
      {'amount' in effect && (
        <CardNumber
          label={`${prefix}: Anzahl`}
          value={effect.amount}
          max={effect.kind === 'tile-change' ? 6 : 24}
          onChange={(amount) => patch({ amount })}
        />
      )}
      {'resource' in effect && (
        <ResourceSelect
          label={`${prefix}: Ressourcenart`}
          value={effect.resource}
          onChange={(resource) => patch({ resource })}
        />
      )}
      {(effect.kind === 'steal' ||
        (effect.kind === 'resources' &&
          effect.operation !== 'store' &&
          effect.operation !== 'withdraw')) && (
        <CardSelect
          label={`${prefix}: Vorrat`}
          value={effect.location}
          onChange={(location) => patch({ location })}
        >
          <option value="carried">Mitgeführte Ressourcen</option>
          <option value="stored">Eingelagertes Vermögen</option>
        </CardSelect>
      )}
      {effect.kind === 'resources' && (
        <CardSelect
          label={`${prefix}: Ressourcenaktion`}
          value={effect.operation}
          onChange={(operation) => patch({ operation })}
        >
          <option value="gain">Erhalten</option>
          <option value="lose">Verlieren</option>
          <option value="pay">Bezahlen</option>
          <option value="store">Einlagern</option>
          <option value="withdraw">Aus dem Lager abheben</option>
        </CardSelect>
      )}
      {effect.kind === 'move' && (
        <CardSelect
          label={`${prefix}: Einheit`}
          value={effect.unit}
          onChange={(unit) => patch({ unit })}
        >
          <option value="fields">Felder</option>
          <option value="pentagons">Pentagone</option>
        </CardSelect>
      )}
      {(effect.kind === 'move' || effect.kind === 'bonus-roll') && (
        <CardSelect
          label={`${prefix}: Feldaktionen`}
          value={effect.fieldActions}
          onChange={(fieldActions) => patch({ fieldActions })}
        >
          <option value="each">Auf jedem betretenen Feld ausführen</option>
          <option value="last">Nur am Ziel ausführen</option>
          <option value="none">Keine Feldaktionen ausführen</option>
        </CardSelect>
      )}
      {(effect.kind === 'move' || effect.kind === 'pentagon') && (
        <CardSelect
          label={`${prefix}: Bewegungsrichtung`}
          value={effect.direction}
          onChange={(direction) => patch({ direction })}
        >
          <option value="forward">Vorwärts</option>
          <option value="backward">Rückwärts</option>
        </CardSelect>
      )}
      {effect.kind === 'pentagon' && (
        <>
          <CardNumber
            label={`${prefix}: Wie viele Pentagone weiter`}
            value={effect.ordinal}
            max={6}
            onChange={(ordinal) => patch({ ordinal })}
          />
          <label className="card-check">
            <input
              type="checkbox"
              checked={effect.fieldAction}
              onChange={(event) => patch({ fieldAction: event.target.checked })}
            />
            Feldaktion des Zielpentagons ausführen
          </label>
        </>
      )}
      {effect.kind === 'tile-change' && (
        <CardSelect
          label={`${prefix}: Gebietsänderung`}
          value={effect.operation}
          onChange={(operation) => patch({ operation })}
        >
          <option value="rotate">Drehen</option>
          <option value="shift">Verschieben</option>
        </CardSelect>
      )}
      {(effect.kind === 'move' || effect.kind === 'tile-change') && (
        <label className="card-check">
          <input
            type="checkbox"
            checked={effect.optional}
            onChange={(event) => patch({ optional: event.target.checked })}
          />
          Freiwillige Aktion („du darfst“)
        </label>
      )}
      {effect.kind === 'custom' && (
        <label className="card-control">
          <span>{prefix}: Eigener Text</span>
          <textarea
            maxLength={240}
            value={effect.text}
            onChange={(event) => {
              if (event.target.value.trim()) patch({ text: event.target.value });
            }}
          />
        </label>
      )}
      <label className="card-check">
        <input
          type="checkbox"
          checked={step.cost !== null}
          onChange={(event) =>
            onChange({
              ...step,
              cost: event.target.checked
                ? { amount: 2, resource: 'scrap', source: 'carried', failure: 'skip-effect' }
                : null,
            })
          }
        />
        Kosten vor diesem Effekt bezahlen
      </label>
      {step.cost && (
        <div className="card-cost">
          <CardNumber
            label={`${prefix}: Kostenmenge`}
            value={step.cost.amount}
            max={9}
            onChange={(amount) => onChange({ ...step, cost: { ...step.cost!, amount } })}
          />
          <ResourceSelect
            label={`${prefix}: Kostenressource`}
            value={step.cost.resource}
            onChange={(resource) => onChange({ ...step, cost: { ...step.cost!, resource } })}
          />
          <CardSelect
            label={`${prefix}: Kosten aus`}
            value={step.cost.source}
            onChange={(source) =>
              onChange({
                ...step,
                cost: { ...step.cost!, source: source as NonNullable<EventStep['cost']>['source'] },
              })
            }
          >
            <option value="carried">Mitgeführtem Vorrat</option>
            <option value="stored">Eigenem Lager</option>
            <option value="either">Vorrat und/oder Lager</option>
          </CardSelect>
          <CardSelect
            label={`${prefix}: Falls nicht bezahlbar`}
            value={step.cost.failure}
            onChange={(failure) =>
              onChange({
                ...step,
                cost: {
                  ...step.cost!,
                  failure: failure as NonNullable<EventStep['cost']>['failure'],
                },
              })
            }
          >
            <option value="skip-effect">Diesen Effekt überspringen</option>
            <option value="skip-card">Karte sofort beenden</option>
          </CardSelect>
        </div>
      )}
    </fieldset>
  );
}
