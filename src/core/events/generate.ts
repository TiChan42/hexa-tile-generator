import { hash32, randomAt } from '../random';
import {
  DEFAULT_CARD_DESIGN,
  DEFAULT_EVENT_GENERATOR,
  EVENT_KINDS,
  EVENT_VERSION,
  EVENT_GENERATOR_VERSION,
  defaultEffect,
  eventGeneratorSchema,
} from './schema';
import type {
  EventCard,
  EventEffect,
  EventGenerator,
  EventKind,
  EventProject,
  EventResource,
  PlayerTarget,
  ResourceSelection,
} from './schema';

/** Short, self-contained ideas remain ordinary editable custom effects. */
export const SPECIAL_EVENT_IDEAS = [
  'Würfle erneut und ziehe die gewürfelte Zahl vorwärts. Führe die Feldaktion am Ziel aus.',
  'Tausche deinen Platz mit dem nächsten Spieler in der Zugreihenfolge. Beide führen keine Feldaktion aus.',
  'Erhalte 2 Altmetall von der Bank. Danach darfst du 1 Altmetall gegen 1 Edelstein tauschen.',
  'Bis zu deinem nächsten Zug bist du vor Diebstahl durch andere Spieler geschützt.',
  'Alle anderen Spieler dürfen 1 Feld vorwärts ziehen und die Feldaktion dort ausführen.',
  'Setze deinen nächsten Zug aus. Erhalte dafür sofort 2 Gold von der Bank.',
  'Wähle einen anderen Spieler. Ihr dürft einvernehmlich je 1 Ressource miteinander tauschen.',
  'Bezahle 1 Gold an die Bank, um sofort noch einmal zu würfeln und zu ziehen.',
  'Erhalte 1 Edelstein für jedes Pentagon, das du in diesem Zug betreten hast, höchstens 3.',
  'Jeder andere Spieler gibt 1 Gold an die Bank ab, sofern er Gold mitführt.',
  'Wähle zwischen 2 Feldern vorwärts und 1 Feld rückwärts. Führe die Feldaktion am Ziel aus.',
  'Du darfst 1 Amethyst an die Bank abgeben und erhältst dafür 3 Edelsteine.',
  'Wähle einen anderen Spieler. Er darf 2 Felder ziehen; danach darfst du 1 Feld ziehen. Führt eure Zielaktionen aus.',
  'Du darfst alle mitgeführten Ressourcen einer Art in dein Lager legen.',
  'Nimm 1 zufällige Ressource aus deinem Lager und lege sie in deinen mitgeführten Vorrat.',
  'Erhalte 1 Gold. Wenn du bereits Gold mitführst, erhältst du stattdessen 2 Gold.',
] as const;

export class EventGenerationError extends Error {}
const THEME_KINDS: Record<EventGenerator['theme'], readonly EventKind[]> = {
  mixed: EVENT_KINDS,
  alb: ['alb-move', 'alb-steal', 'alb-give'],
  adventure: ['move', 'pentagon', 'tile-change', 'steal', 'protection', 'bonus-roll'],
  resources: ['resources', 'steal', 'gift'],
};
const COST_KINDS: readonly EventKind[] = [
  'move',
  'pentagon',
  'tile-change',
  'steal',
  'protection',
  'bonus-roll',
];
function weighted<T extends string>(weights: Record<T, number>, value: number): T {
  const entries = (Object.entries(weights) as [T, number][])
    .filter(([, weight]) => weight > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!(total > 0))
    throw new EventGenerationError(
      'Im gewählten Zufallstopf muss mindestens ein Gewicht größer als 0 sein.',
    );
  let cumulative = 0;
  const target = value * total;
  return (entries.find(([, weight]) => (cumulative += weight) > target) ?? entries.at(-1))![0];
}
export function generateEventCards(input: EventGenerator): EventCard[] {
  const config = eventGeneratorSchema.parse(input);
  const weights = Object.fromEntries(
    THEME_KINDS[config.theme]
      .filter((kind) => kind !== 'tile-change' || config.allowTileChanges)
      .map((kind) => [kind, config.weights[kind]]),
  ) as Record<EventKind, number>;
  // Validate even before the first draw; all-zero resources remain editable but cannot generate.
  weighted(weights, 0);
  if (
    ['resources', 'steal', 'alb-steal', 'alb-give', 'gift'].some(
      (kind) => weights[kind as EventKind] > 0,
    ) ||
    (config.costChance > 0 && COST_KINDS.some((kind) => weights[kind] > 0))
  )
    weighted(config.resourceWeights, 0);
  return Array.from({ length: config.count }, (_, index): EventCard => {
    const draw = (domain: string, step = -1) =>
      randomAt(config.seed, `event-card-v3:${domain}`, config.revision, index, step);
    const integer = (domain: string, range: { min: number; max: number }, step: number) =>
      range.min + Math.floor(draw(domain, step) * (range.max - range.min + 1));
    const pick = <T>(domain: string, values: readonly T[], step: number): T =>
      values[Math.floor(draw(domain, step) * values.length)]!;
    const target = (
      step: number,
      monster = false,
    ): Exclude<PlayerTarget, { kind: 'active' | 'all' }> => {
      const rank = integer('target-rank', config.targetRank, step);
      return pick('target-basis', config.targetBases, step) === 'turn-order'
        ? {
            kind: 'turn-order',
            direction:
              config.allowBackward && draw('target-direction', step) < 0.5 ? 'previous' : 'next',
            rank,
          }
        : {
            kind: 'board',
            direction: config.allowBackward
              ? pick('board-direction', ['any', 'forward', 'backward'] as const, step)
              : 'any',
            rank,
            origin: monster ? 'alb' : 'active-player',
          };
    };
    const resource = (step: number, forCost = false): ResourceSelection => {
      const mode = draw(forCost ? 'cost-resource-mode' : 'resource-mode', step);
      return mode < 0.35
        ? 'random'
        : mode < 0.5
          ? 'choice'
          : (weighted(
              config.resourceWeights,
              draw(forCost ? 'cost-resource-type' : 'resource-type', step),
            ) as EventResource);
    };
    const weightedQuantity = (
      domain: string,
      range: { min: number; max: number },
      step: number,
    ) => {
      const weights = Object.fromEntries(
        Array.from({ length: range.max - range.min + 1 }, (_, i) => {
          const n = range.min + i;
          return [String(n), 3 ** (range.min - n)];
        }),
      );
      return Number(weighted(weights, draw(domain, step)));
    };
    const quantity = (step: number, forCost = false) =>
      weightedQuantity(forCost ? 'cost-quantity' : 'quantity', config.resources, step);
    const cardId = `event-${hash32(
      JSON.stringify([EVENT_GENERATOR_VERSION, config.seed, config.revision, index]),
    )
      .toString(16)
      .padStart(8, '0')}-${index + 1}`;
    const steps = Array.from({ length: integer('step-count', config.steps, -1) }, (_, step) => {
      const kind = weighted(weights, draw('effect-kind', step));
      let effect: EventEffect = defaultEffect(kind);
      const direction =
        config.allowBackward && draw('movement-direction', step) < 0.35
          ? ('backward' as const)
          : ('forward' as const);
      const amount = integer('movement-amount', config.movement, step);
      switch (effect.kind) {
        case 'alb-move':
          effect = {
            ...effect,
            target: target(step, true) as Exclude<PlayerTarget, { kind: 'all' }>,
            limit:
              draw('alb-limit', step) < 0.4
                ? null
                : { amount, unit: pick('alb-unit', ['fields', 'pentagons'] as const, step) },
          };
          break;
        case 'alb-steal':
          effect = {
            ...effect,
            target: target(step, true),
            amount: quantity(step),
            resource: resource(step),
          };
          break;
        case 'alb-give':
          effect = {
            ...effect,
            target:
              draw('gift-recipient-active', step) < 0.7 ? { kind: 'active' } : target(step, true),
            amount: weightedQuantity('alb-gift-quantity', config.albGifts, step),
            resource: resource(step),
            approach: {
              amount: weightedQuantity('alb-gift-approach', config.movement, step),
              unit: draw('alb-gift-approach-unit', step) < 0.8 ? 'pentagons' : 'fields',
            },
          };
          break;
        case 'gift':
          effect = {
            ...effect,
            source:
              draw('gift-source', step) < 0.5
                ? { kind: 'bank' }
                : {
                    kind: 'players',
                    target: draw('gift-from-everyone', step) < 0.2 ? { kind: 'all' } : target(step),
                    inventory: pick('gift-source-inventory', ['carried', 'stored'] as const, step),
                  },
            amount: quantity(step),
            resource: resource(step),
            destination: pick('gift-destination', ['carried', 'stored'] as const, step),
          };
          break;
        case 'protection':
          effect = {
            ...effect,
            target: { kind: 'active' },
            turns: draw('protection-duration', step) < 0.85 ? 1 : 2,
            against: pick('protection-against', ['alb', 'players', 'all'] as const, step),
          };
          break;
        case 'bonus-roll':
          effect = {
            ...effect,
            target: { kind: 'active' },
            fieldActions: pick('bonus-field-actions', ['each', 'last', 'none'] as const, step),
          };
          break;
        case 'move':
          if (draw('special-event', step) < 0.3) {
            effect = {
              kind: 'custom',
              text: pick('special-event-text', SPECIAL_EVENT_IDEAS, step),
            };
            break;
          }
          effect = {
            ...effect,
            amount,
            unit: pick('movement-unit', ['fields', 'pentagons'] as const, step),
            direction,
            fieldActions: pick('field-actions', ['each', 'last', 'none'] as const, step),
            optional: draw('optional-move', step) < 0.35,
          };
          break;
        case 'pentagon':
          effect = {
            ...effect,
            ordinal: Math.min(6, amount),
            direction,
            fieldAction: draw('pentagon-action', step) < 0.65,
          };
          break;
        case 'resources':
          effect = {
            ...effect,
            target: draw('resource-target-active', step) < 0.7 ? { kind: 'active' } : target(step),
            operation: pick(
              'resource-operation',
              ['gain', 'lose', 'pay', 'store', 'withdraw'] as const,
              step,
            ),
            amount: quantity(step),
            resource: resource(step),
            location: pick('resource-location', ['carried', 'stored'] as const, step),
          };
          break;
        case 'steal':
          effect = {
            ...effect,
            target: target(step),
            amount: quantity(step),
            resource: resource(step),
            location: pick('steal-location', ['carried', 'stored'] as const, step),
          };
          break;
        case 'tile-change':
          effect = {
            ...effect,
            amount: Math.min(6, amount),
            operation: pick('tile-operation', ['rotate', 'shift'] as const, step),
            optional: draw('optional-tiles', step) < 0.65,
          };
          break;
      }
      const cost =
        COST_KINDS.includes(kind) && draw('has-cost', step) < config.costChance
          ? {
              amount: quantity(step, true),
              resource: resource(step, true),
              source: 'carried' as const,
              failure: 'skip-effect' as const,
            }
          : null;
      return { id: `effect-${step + 1}`, effect, cost };
    });
    const containsAlb = steps.some(({ effect }) => effect.kind.startsWith('alb-'));
    const title =
      steps[0]!.effect.kind === 'alb-give'
        ? 'Ein Angebot des Albs'
        : containsAlb
          ? 'Der Wandernde Alb'
          : steps[0]!.effect.kind === 'gift'
            ? 'Unerwartetes Geschenk'
            : steps[0]!.effect.kind === 'protection'
              ? 'Unter gutem Schutz'
              : steps[0]!.effect.kind === 'bonus-roll'
                ? 'Noch eine Chance'
                : steps[0]!.effect.kind === 'resources'
                  ? 'Geben und Nehmen'
                  : steps[0]!.effect.kind === 'tile-change'
                    ? 'Das Brett verändert sich'
                    : 'Ein neuer Weg';
    return {
      id: cardId,
      title,
      flavor: '',
      mode:
        config.mode === 'random'
          ? draw('combination-mode') < 0.5
            ? 'sequence'
            : 'choice'
          : config.mode,
      steps,
    };
  });
}
export function createEventProject(): EventProject {
  const generator = structuredClone(DEFAULT_EVENT_GENERATOR);
  return {
    schemaVersion: 4,
    generatorVersion: EVENT_VERSION,
    name: 'Alb & Abenteuer',
    generator,
    design: structuredClone(DEFAULT_CARD_DESIGN),
    cards: generateEventCards(generator),
  };
}
