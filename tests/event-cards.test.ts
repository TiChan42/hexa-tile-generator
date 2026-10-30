import { describe, expect, it } from 'vitest';
import {
  CARD_PALETTES,
  DEFAULT_EVENT_GENERATOR,
  EFFECT_NAMES,
  EVENT_KINDS,
  STANDARD_EVENT_KINDS,
  RARE_EVENT_KINDS,
  RARE_EVENT_WEIGHTS,
  EVENT_VERSION,
  cardCategory,
  cardRules,
  createEventProject,
  defaultEffect,
  effectText,
  eventCardSchema,
  eventGeneratorSchema,
  eventProjectSchema,
  generateEventCards,
  migrateEventProject,
  SPECIAL_EVENT_IDEAS,
  resourceText,
  stepText,
  targetText,
} from '../src/core/events';
import type { EventCard, EventGenerator, EventKind, EventProject } from '../src/core/events';
import { eventCardSvg, eventPrintHtml, eventRulesText } from '../src/cards/svg';
import { EVENT_STORAGE_KEY, loadEventProject, saveEventProject } from '../src/cards/storage';

function generator(): EventGenerator {
  return structuredClone(DEFAULT_EVENT_GENERATOR);
}
function card(kind: EventKind | 'custom' = 'alb-move'): EventCard {
  return {
    id: 'test-card',
    title: 'Ein Ereignis',
    flavor: '',
    mode: 'sequence',
    steps: [{ id: 'effect-1', effect: defaultEffect(kind), cost: null }],
  };
}
function legacyProject(version: 1 | 2 | 3) {
  const current = createEventProject();
  const { backRevision: _revision, ...oldDesign } = current.design;
  const { albGifts: _gifts, ...oldGenerator } = current.generator;
  void _revision;
  void _gifts;
  return {
    ...current,
    schemaVersion: version,
    generatorVersion: `events-${version}.0.0`,
    generator: {
      ...oldGenerator,
      version: version === 1 ? 1 : 2,
      weights: Object.fromEntries(
        STANDARD_EVENT_KINDS.map((kind) => [kind, current.generator.weights[kind]]),
      ),
    },
    design: version === 3 ? { ...current.design, backRevision: 7 } : oldDesign,
    cards: [card('alb-move')],
  };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

describe('independent versioned event-card projects', () => {
  it.each([1, 2, 3] as const)(
    'migrates a validated V%i set without rerolling saved cards or back',
    (version) => {
      const old = legacyProject(version);
      const migrated = migrateEventProject(old);
      expect(migrated).toEqual({
        ...old,
        schemaVersion: 4,
        generatorVersion: EVENT_VERSION,
        generator: {
          ...old.generator,
          version: 3,
          albGifts: { min: 4, max: 9 },
          weights: { ...old.generator.weights, ...RARE_EVENT_WEIGHTS },
        },
        design: { ...old.design, backRevision: version === 3 ? 7 : 0 },
      });
      expect(() => migrateEventProject({ ...old, unexpected: true })).toThrow();
      expect(() =>
        migrateEventProject({
          ...old,
          generator: { ...old.generator, weights: { ...old.generator.weights, gift: 1 } },
        }),
      ).toThrow();
      expect(() => migrateEventProject({ ...old, cards: [card('gift')] })).toThrow();
      expect(SPECIAL_EVENT_IDEAS.length).toBeGreaterThanOrEqual(16);
    },
  );
  it('creates a complete project without any tile configuration and preserves inputs', () => {
    const config = freeze(generator()),
      before = structuredClone(config);
    const a = generateEventCards(config),
      b = generateEventCards(config);
    expect(a).toEqual(b);
    expect(config).toEqual(before);
    const project = createEventProject();
    expect(project.generatorVersion).toBe(EVENT_VERSION);
    expect(project.cards).toHaveLength(12);
    expect(eventProjectSchema.parse(project)).toEqual(project);
    expect(project).not.toHaveProperty('tiles');
    expect(project).not.toHaveProperty('grid');
    expect(project.generator.allowTileChanges).toBe(false);
  });
  it('keeps a stable prefix when card counts grow, and ignores weight insertion order', () => {
    const config = generator();
    const first = generateEventCards(config);
    config.count = 30;
    config.weights = Object.fromEntries(
      Object.entries(config.weights).reverse(),
    ) as EventGenerator['weights'];
    config.resourceWeights = Object.fromEntries(
      Object.entries(config.resourceWeights).reverse(),
    ) as EventGenerator['resourceWeights'];
    expect(generateEventCards(config).slice(0, first.length)).toEqual(first);
    config.revision++;
    expect(generateEventCards(config).slice(0, first.length)).not.toEqual(first);
    config.revision--;
    config.seed = 'anderer-seed';
    expect(generateEventCards(config).slice(0, first.length)).not.toEqual(first);
  });
  it('draws every action, numeric and target variant while honoring zero weights and backward preferences', () => {
    const config = generator();
    config.count = 100;
    config.steps = { min: 6, max: 6 };
    config.allowTileChanges = true;
    config.costChance = 1;
    const cards = generateEventCards(config),
      effects = cards.flatMap((value) => value.steps.map((step) => step.effect));
    expect(new Set(effects.map((effect) => effect.kind))).toEqual(
      new Set([...EVENT_KINDS, 'custom']),
    );
    const targets = effects.flatMap((effect) => ('target' in effect ? [effect.target] : []));
    expect(
      targets.some(
        (target) =>
          target.kind === 'turn-order' && target.direction === 'previous' && target.rank > 1,
      ),
    ).toBe(true);
    expect(
      targets.some(
        (target) => target.kind === 'board' && target.origin === 'alb' && target.rank > 1,
      ),
    ).toBe(true);
    expect(
      effects.some((effect) => effect.kind === 'alb-move' && effect.limit?.unit === 'pentagons'),
    ).toBe(true);
    expect(effects.some((effect) => effect.kind === 'alb-move' && effect.limit === null)).toBe(
      true,
    );
    expect(
      effects.some(
        (effect) =>
          effect.kind === 'move' && effect.unit === 'pentagons' && effect.fieldActions === 'each',
      ),
    ).toBe(true);
    expect(
      new Set(effects.flatMap((effect) => (effect.kind === 'resources' ? [effect.operation] : []))),
    ).toEqual(new Set(['gain', 'lose', 'pay', 'store', 'withdraw']));
    expect(effects.some((effect) => 'resource' in effect && effect.resource === 'random')).toBe(
      true,
    );
    expect(effects.some((effect) => 'resource' in effect && effect.resource === 'choice')).toBe(
      true,
    );
    expect(cards.flatMap((value) => value.steps).some((step) => step.cost)).toBe(true);
    expect(
      effects.some((effect) => effect.kind === 'move' && effect.direction === 'backward'),
    ).toBe(true);
    expect(
      effects.some((effect) => effect.kind === 'pentagon' && effect.direction === 'backward'),
    ).toBe(true);
    config.allowBackward = false;
    config.allowTileChanges = false;
    config.costChance = 0;
    const forward = generateEventCards(config);
    for (const step of forward.flatMap((value) => value.steps)) {
      expect(step.effect.kind).not.toBe('tile-change');
      expect(step.cost).toBeNull();
      if ('direction' in step.effect) expect(step.effect.direction).toBe('forward');
      if ('target' in step.effect && step.effect.target.kind === 'turn-order')
        expect(step.effect.target.direction).toBe('next');
      if ('target' in step.effect && step.effect.target.kind === 'board')
        expect(step.effect.target.direction).toBe('any');
    }
  });
  it.each(['alb', 'adventure', 'resources'] as const)(
    'limits the %s family without losing combinations',
    (theme) => {
      const config = generator();
      config.theme = theme;
      config.count = 25;
      config.steps = { min: 2, max: 3 };
      const cards = generateEventCards(config);
      expect(cards.every((value) => value.steps.length >= 2)).toBe(true);
      const allowed =
        theme === 'alb'
          ? ['alb-move', 'alb-steal', 'alb-give']
          : theme === 'resources'
            ? ['resources', 'steal', 'gift']
            : ['move', 'pentagon', 'steal', 'custom', 'protection', 'bonus-roll'];
      expect(
        cards.every((value) => value.steps.every((step) => allowed.includes(step.effect.kind))),
      ).toBe(true);
    },
  );
  it('separates combination mode, quantity, resource and target domains', () => {
    const config = generator();
    config.count = 100;
    const first = generateEventCards(config);
    config.mode = 'choice';
    expect(generateEventCards(config).map((value) => value.steps)).toEqual(
      first.map((value) => value.steps),
    );
    config.mode = 'random';
    const modes = generateEventCards(config);
    expect(new Set(modes.map((value) => value.mode))).toEqual(new Set(['sequence', 'choice']));
    expect(modes.map((value) => value.steps)).toEqual(first.map((value) => value.steps));
    config.resourceWeights = { scrap: 0, gem: 0, platinum: 0, amethyst: 0, gold: 100 };
    const gold = generateEventCards(config);
    for (const [i, value] of gold.entries())
      for (const [j, step] of value.steps.entries()) {
        const old = first[i]!.steps[j]!;
        if ('target' in step.effect && 'target' in old.effect)
          expect(step.effect.target).toEqual(old.effect.target);
        if ('amount' in step.effect && 'amount' in old.effect)
          expect(step.effect.amount).toBe(old.effect.amount);
        if ('resource' in step.effect)
          expect(['random', 'choice', 'gold']).toContain(step.effect.resource);
      }
  });
  it('makes higher resource quantities exponentially rarer and handles degenerate pools explicitly', () => {
    const config = generator();
    config.count = 100;
    config.steps = { min: 6, max: 6 };
    config.resources = { min: 1, max: 3 };
    config.weights = Object.fromEntries(
      EVENT_KINDS.map((kind) => [kind, kind === 'resources' ? 100 : 0]),
    ) as EventGenerator['weights'];
    const quantities = [0, 0, 0, 0];
    for (const step of generateEventCards(config).flatMap((value) => value.steps))
      if (step.effect.kind === 'resources') quantities[step.effect.amount]++;
    expect(quantities[1]).toBeGreaterThan(quantities[2] * 2.3);
    expect(quantities[2]).toBeGreaterThan(quantities[3] * 2.2);
    for (const kind of EVENT_KINDS) config.weights[kind] = 0;
    expect(eventGeneratorSchema.safeParse(config).success).toBe(true);
    expect(() => generateEventCards(config)).toThrow('Zufallstopf');
    config.weights['alb-move'] = Number.MIN_VALUE;
    config.theme = 'alb';
    for (const resource of Object.keys(
      config.resourceWeights,
    ) as (keyof EventGenerator['resourceWeights'])[])
      config.resourceWeights[resource] = 0;
    expect(
      generateEventCards(config).every((value) =>
        value.steps.every((step) => step.effect.kind === 'alb-move'),
      ),
    ).toBe(true);
    config.weights['alb-steal'] = 1;
    expect(() => generateEventCards(config)).toThrow('Zufallstopf');
  });
  it('rejects unsupported schemas, extra keys, malformed targets and duplicate identities', () => {
    const project = createEventProject();
    for (const value of [
      { ...project, schemaVersion: 5 },
      { ...project, generatorVersion: 'events-5.0.0' },
      { ...project, tileId: 'x' },
      { ...project, cards: [project.cards[0], project.cards[0]] },
      { ...project, design: { ...project.design, backRevision: -1 } },
    ])
      expect(eventProjectSchema.safeParse(value).success).toBe(false);
    for (const value of [
      { ...generator(), count: 101 },
      { ...generator(), seed: '' },
      { ...generator(), steps: { min: 4, max: 2 } },
      { ...generator(), targetBases: ['board', 'board'] },
      { ...generator(), resourceWeights: { gold: 1 } },
      { ...generator(), weights: { ...generator().weights, move: Infinity } },
    ])
      expect(eventGeneratorSchema.safeParse(value).success).toBe(false);
    const value = card('alb-move');
    expect(
      eventCardSchema.safeParse({
        ...value,
        steps: [
          { ...value.steps[0], effect: { ...value.steps[0]!.effect, target: { kind: 'all' } } },
        ],
      }).success,
    ).toBe(false);
    expect(
      eventCardSchema.safeParse({ ...value, steps: [value.steps[0], value.steps[0]] }).success,
    ).toBe(false);
    const steal = card('steal');
    expect(
      eventCardSchema.safeParse({
        ...steal,
        steps: [
          { ...steal.steps[0], effect: { ...steal.steps[0]!.effect, target: { kind: 'active' } } },
        ],
      }).success,
    ).toBe(false);
    expect(eventCardSchema.safeParse({ ...value, id: '../outside' }).success).toBe(false);
  });
});

describe('rare gifts and exceptional actions', () => {
  it('makes rare actions infrequent by default and allows removing them from the pool', () => {
    const config = generator();
    config.count = 100;
    config.steps = { min: 1, max: 1 };
    config.costChance = 0;
    const kinds: string[] = [];
    for (let revision = 0; revision < 60; revision++) {
      config.revision = revision;
      kinds.push(...generateEventCards(config).map((value) => value.steps[0]!.effect.kind));
    }
    const count = kinds.filter((kind) => RARE_EVENT_KINDS.some((rare) => rare === kind)).length;
    expect(count / kinds.length).toBeGreaterThan(0.025);
    expect(count / kinds.length).toBeLessThan(0.065);
    for (const kind of RARE_EVENT_KINDS) config.weights[kind] = 0;
    expect(
      generateEventCards(config)
        .flatMap((value) => value.steps)
        .some((step) => RARE_EVENT_KINDS.some((kind) => kind === step.effect.kind)),
    ).toBe(false);
  });
  it.each(RARE_EVENT_KINDS)(
    'supports a pool containing only %s and generates its variants',
    (kind) => {
      const config = generator();
      config.count = 100;
      config.steps = { min: 2, max: 3 };
      config.resources = { min: 1, max: 3 };
      config.costChance = 0;
      for (const key of EVENT_KINDS) config.weights[key] = key === kind ? 1 : 0;
      const cards = generateEventCards(config);
      const effects = cards.flatMap((value) => value.steps.map((step) => step.effect));
      expect(new Set(effects.map((effect) => effect.kind))).toEqual(new Set([kind]));
      for (const value of cards) expect(eventCardSchema.parse(value)).toEqual(value);
      if (kind === 'gift') {
        const gifts = effects.filter((effect) => effect.kind === 'gift');
        expect(new Set(gifts.map((effect) => effect.source.kind))).toEqual(
          new Set(['bank', 'players']),
        );
        const donors = gifts.flatMap((effect) =>
          effect.source.kind === 'players' ? [effect.source] : [],
        );
        expect(new Set(donors.map((source) => source.target.kind))).toEqual(
          new Set(['all', 'turn-order', 'board']),
        );
        expect(new Set(donors.map((source) => source.inventory))).toEqual(
          new Set(['carried', 'stored']),
        );
        expect(new Set(gifts.map((effect) => effect.destination))).toEqual(
          new Set(['carried', 'stored']),
        );
      }
      if (kind === 'alb-give') {
        const gifts = effects.filter((effect) => effect.kind === 'alb-give');
        expect(gifts.every((effect) => effect.amount >= 4 && effect.amount <= 9)).toBe(true);
        expect(new Set(gifts.map((effect) => effect.approach.unit))).toEqual(
          new Set(['fields', 'pentagons']),
        );
        expect(
          gifts.every(
            (effect) =>
              effect.approach.amount >= config.movement.min &&
              effect.approach.amount <= config.movement.max,
          ),
        ).toBe(true);
        expect(
          new Set(
            effects.flatMap((effect) => (effect.kind === 'alb-give' ? [effect.target.kind] : [])),
          ),
        ).toEqual(new Set(['active', 'turn-order', 'board']));
        config.albGifts = { min: 12, max: 12 };
        const changed = generateEventCards(config).flatMap((value) =>
          value.steps.map((step) => step.effect),
        );
        expect(changed.every((effect) => effect.kind === 'alb-give' && effect.amount === 12)).toBe(
          true,
        );
        expect(changed.map((effect) => ({ ...effect, amount: 0 }))).toEqual(
          effects.map((effect) => ({ ...effect, amount: 0 })),
        );
      }
      if (kind === 'protection') {
        expect(
          new Set(
            effects.flatMap((effect) => (effect.kind === 'protection' ? [effect.against] : [])),
          ),
        ).toEqual(new Set(['alb', 'players', 'all']));
        expect(
          new Set(
            effects.flatMap((effect) => (effect.kind === 'protection' ? [effect.turns] : [])),
          ),
        ).toEqual(new Set([1, 2]));
      }
      if (kind === 'bonus-roll')
        expect(
          new Set(
            effects.flatMap((effect) =>
              effect.kind === 'bonus-roll' ? [effect.fieldActions] : [],
            ),
          ),
        ).toEqual(new Set(['each', 'last', 'none']));
      for (const resource of Object.keys(
        config.resourceWeights,
      ) as (keyof EventGenerator['resourceWeights'])[])
        config.resourceWeights[resource] = 0;
      if (kind === 'gift' || kind === 'alb-give')
        expect(() => generateEventCards(config)).toThrow('Zufallstopf');
      else {
        expect(() => generateEventCards(config)).not.toThrow();
        config.costChance = 1;
        expect(() => generateEventCards(config)).toThrow('Zufallstopf');
      }
    },
  );
  it('distinguishes bank, donor inventories, unlimited Alb gifts and their consideration in exports', () => {
    const value = card('gift');
    const gift = defaultEffect('gift');
    if (gift.kind !== 'gift') throw new Error();
    expect(effectText(gift)).toContain('von der Bank');
    value.steps[0]!.effect = {
      ...gift,
      destination: 'stored',
      source: {
        kind: 'players',
        inventory: 'stored',
        target: { kind: 'board', rank: 2, direction: 'any', origin: 'active-player' },
      },
    };
    expect(effectText(value.steps[0]!.effect)).toContain('aus dem Lager');
    expect(effectText(value.steps[0]!.effect)).toContain('direkt in dein Lager');
    const project = createEventProject();
    project.cards = [
      value,
      { ...card('alb-give'), id: 'alb-gift' },
      { ...card('protection'), id: 'shield' },
      { ...card('bonus-roll'), id: 'bonus' },
    ];
    const rules = eventRulesText(project);
    expect(rules).toContain('kürzester Weg');
    expect(rules).toContain('unendlichen Ressourcenvorrat');
    expect(rules).toContain('als Gegenleistung');
    expect(rules).toContain('Kosten, Geschenke');
    expect(rules).toContain('kein vollständiger weiterer Spielzug');
    expect(eventCardSvg(value, project.design, 'front')).toContain(
      'Brettentfernung: kürzester Weg',
    );
    expect(cardCategory(value)).toBe('Ressourcen');
    expect(cardCategory(project.cards[1]!)).toBe('Wandernder Alb');
    expect(effectText(project.cards[1]!.steps[0]!.effect)).toContain('bis zum nächsten Pentagon');
    const albGift = project.cards[1]!.steps[0]!.effect;
    if (albGift.kind !== 'alb-give') throw new Error();
    expect(effectText({ ...albGift, approach: { amount: 2, unit: 'fields' } })).toContain(
      'höchstens 2 Felder',
    );
    expect(
      eventCardSchema.safeParse({
        ...project.cards[1],
        steps: [
          {
            ...project.cards[1]!.steps[0],
            effect: { ...albGift, approach: { amount: 0, unit: 'pentagons' } },
          },
        ],
      }).success,
    ).toBe(false);
    expect(eventPrintHtml(project)).toContain('Geschenk');
    value.steps[0]!.effect = {
      ...gift,
      source: { kind: 'players', inventory: 'carried', target: { kind: 'all' } },
    };
    expect(effectText(value.steps[0]!.effect)).toContain('Jeder andere Spieler');
    expect(cardRules(value, project.design).join(' ')).toContain('pro Geber');
    for (const source of [
      { kind: 'players', target: { kind: 'active' }, inventory: 'carried' },
      { kind: 'players', target: { kind: 'all' } },
      { kind: 'bank', inventory: 'stored' },
    ])
      expect(
        eventCardSchema.safeParse({
          ...value,
          steps: [{ ...value.steps[0], effect: { ...gift, source } }],
        }).success,
      ).toBe(false);
  });
});

describe('explicit card instructions and matching fronts/backs', () => {
  it.each([...EVENT_KINDS, 'custom' as const])(
    'describes and renders %s without needing a tile',
    (kind) => {
      const value = card(kind),
        project = createEventProject();
      expect(EFFECT_NAMES[kind]).toBeTruthy();
      expect(effectText(value.steps[0]!.effect).length).toBeGreaterThan(10);
      const svg = eventCardSvg(value, project.design, 'front');
      expect(svg).toContain('viewBox="0 0 756 1056"');
      expect(svg).toContain('Ein Ereignis');
      expect(svg).not.toMatch(/<script|https?:\/\/(?!www.w3.org)/);
      expect(eventCardSvg(value, project.design, 'back')).toContain(project.design.backTitle);
    },
  );
  it('distinguishes player ordering, physical distance, resource inventories and conditional costs', () => {
    expect(targetText({ kind: 'turn-order', direction: 'previous', rank: 2 })).toContain(
      '2. vorheriger',
    );
    expect(targetText({ kind: 'turn-order', direction: 'next', rank: 1 })).toContain('Nächster');
    expect(targetText({ kind: 'board', direction: 'backward', rank: 3, origin: 'alb' })).toContain(
      'Entfernungsrang 3',
    );
    expect(targetText({ kind: 'all' }, true)).toBe('Alle anderen Spieler');
    expect(resourceText('gold', 3)).toBe('3 × Gold');
    expect(resourceText('random', 1)).toContain('Ressourceneinheit');
    expect(resourceText('choice', 2)).toContain('deiner Wahl');
    const value = card('alb-move');
    value.steps[0]!.cost = { amount: 2, resource: 'gold', source: 'stored', failure: 'skip-card' };
    expect(stepText(value.steps[0]!)).toContain('aus deinem Lager');
    expect(stepText(value.steps[0]!)).toContain('endet diese Karte sofort');
    value.steps[0]!.cost.source = 'either';
    value.steps[0]!.cost.failure = 'skip-effect';
    expect(stepText(value.steps[0]!)).toContain('und/oder Lager');
    expect(stepText(value.steps[0]!)).toContain('entfällt dieser Effekt');
    const rules = cardRules(value, createEventProject().design).join(' ');
    expect(rules).toContain('kürzester Weg');
    expect(rules).toContain('Gleichstand: Zugreihenfolge');
    expect(
      cardRules(value, { ...createEventProject().design, distanceMetric: 'air' }).join(' '),
    ).toContain('Luftlinie');
    expect(cardCategory(card('resources'))).toBe('Ressourcen');
    expect(cardCategory(card('move'))).toBe('Abenteuer');
    expect(cardCategory(value)).toBe('Wandernder Alb');
  });
  it('covers every resource operation, movement mode and optional tile operation in readable text', () => {
    const resource = defaultEffect('resources');
    if (resource.kind !== 'resources') throw new Error();
    for (const operation of ['gain', 'lose', 'pay', 'store', 'withdraw'] as const)
      for (const location of ['carried', 'stored'] as const)
        expect(effectText({ ...resource, operation, location })).toContain('2');
    const move = defaultEffect('move');
    if (move.kind !== 'move') throw new Error();
    for (const fieldActions of ['each', 'last', 'none'] as const)
      expect(
        effectText({
          ...move,
          amount: 1,
          direction: 'backward',
          optional: true,
          unit: 'pentagons',
          fieldActions,
        }),
      ).toContain('rückwärts');
    const pentagon = defaultEffect('pentagon');
    if (pentagon.kind !== 'pentagon') throw new Error();
    expect(
      effectText({ ...pentagon, ordinal: 3, direction: 'backward', fieldAction: false }),
    ).toContain('3. nächsten');
    const tiles = defaultEffect('tile-change');
    if (tiles.kind !== 'tile-change') throw new Error();
    expect(effectText({ ...tiles, amount: 1, operation: 'shift', optional: false })).toContain(
      'Du musst',
    );
    const steal = defaultEffect('steal');
    if (steal.kind !== 'steal') throw new Error();
    expect(effectText({ ...steal, location: 'stored' })).toContain('Lager');
  });
  it.each(Array.from({ length: 10 }, (_, batch) => batch))(
    'fits every generated card in batch %i',
    (batch) => {
      const project = createEventProject();
      project.generator.count = 100;
      const cards = generateEventCards(project.generator).slice(batch * 10, batch * 10 + 10);
      for (const value of cards)
        expect(() => eventCardSvg(value, project.design, 'front')).not.toThrow();
    },
  );
  it('escapes custom text and rejects overflowing content explicitly', () => {
    const project = createEventProject();
    const value = card('custom');
    value.title = '<script>alert("x")</script>';
    value.flavor = 'A very long atmospheric subtitle '.repeat(5).slice(0, 160);
    value.steps[0]!.effect = { kind: 'custom', text: '<img src=x onerror=alert(1)> & Zeichen' };
    const svg = eventCardSvg(value, project.design, 'front');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<img');
    value.steps = Array.from({ length: 6 }, (_, i) => ({
      id: `step-${i}`,
      effect: { kind: 'custom' as const, text: 'W'.repeat(240) },
      cost: {
        amount: 9,
        resource: 'random' as const,
        source: 'either' as const,
        failure: 'skip-card' as const,
      },
    }));
    expect(() => eventCardSvg(value, project.design, 'front')).toThrow('Kartentext ist zu lang');
  });
  it('uses a common back, mirrored duplex rows and an independent editable JSON project', () => {
    const project = createEventProject();
    project.cards = project.cards.slice(0, 4);
    project.name = '<Karten & Abenteuer>';
    const back = eventCardSvg(project.cards[0]!, project.design, 'back');
    expect(eventCardSvg(project.cards[1]!, project.design, 'back')).toBe(back);
    for (const palette of Object.values(CARD_PALETTES))
      expect(eventCardSvg(project.cards[0]!, { ...project.design, ...palette }, 'back')).toContain(
        palette.accent,
      );
    const html = eventPrintHtml(project);
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html).toContain('63mm');
    expect(html.includes('langen Kante')).toBe(true);
    expect(html).toContain('&lt;Karten &amp; Abenteuer&gt;');
    expect(html).toContain('<div></div>');
    expect(eventRulesText(project)).toContain(project.cards[0]!.title);
  });
});

describe('separate event-card browser storage', () => {
  it('migrates an older autosave without overwriting the original entry', () => {
    const old = JSON.stringify(legacyProject(3));
    const entries = new Map([['hexa-studio-event-cards-v3', old]]);
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
    };
    const loaded = loadEventProject(storage);
    expect(loaded.error).toBe('');
    expect(loaded.project.cards).toEqual(legacyProject(3).cards);
    expect(loaded.project.design.backRevision).toBe(7);
    expect(loaded.project.generator.weights.gift).toBe(2);
    expect(saveEventProject(storage, loaded.project)).toBe(true);
    expect(entries.get('hexa-studio-event-cards-v3')).toBe(old);
    expect(entries.has(EVENT_STORAGE_KEY)).toBe(true);
  });
  it('round-trips its own key and leaves tile autosaves untouched', () => {
    const entries = new Map<string, string>([['hexa-studio-project-v17', 'tile-state']]);
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
    };
    const project = createEventProject();
    expect(saveEventProject(storage, project)).toBe(true);
    expect(loadEventProject(storage).project).toEqual(project);
    expect(entries.get('hexa-studio-project-v17')).toBe('tile-state');
    expect(entries.has(EVENT_STORAGE_KEY)).toBe(true);
    expect(loadEventProject(null).project).toEqual(createEventProject());
    expect(saveEventProject(null, project)).toBe(false);
    expect(
      saveEventProject(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        project,
      ),
    ).toBe(false);
    entries.set(EVENT_STORAGE_KEY, '{');
    expect(loadEventProject(storage).error).toContain('ursprüngliche Eintrag');
    expect(entries.get(EVENT_STORAGE_KEY)).toBe('{');
    expect(
      saveEventProject(storage, { ...project, schemaVersion: 5 } as unknown as EventProject),
    ).toBe(false);
  });
});
