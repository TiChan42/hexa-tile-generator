import { RESOURCE_NAMES } from './schema';
import type {
  CardDesign,
  EventCard,
  EventEffect,
  EventStep,
  PlayerTarget,
  ResourceSelection,
} from './schema';

export function targetText(target: PlayerTarget, steal = false): string {
  switch (target.kind) {
    case 'active':
      return 'Aktiver Spieler';
    case 'all':
      return steal ? 'Alle anderen Spieler' : 'Alle Spieler';
    case 'turn-order':
      return `${target.rank === 1 ? (target.direction === 'next' ? 'Nächster' : 'Vorheriger') : `${target.rank}. ${target.direction === 'next' ? 'nachfolgender' : 'vorheriger'}`} Spieler in der Zugreihenfolge`;
    case 'board':
      return `${target.rank === 1 ? 'Nächster Spieler' : `Spieler auf Entfernungsrang ${target.rank}`} auf dem Brett${target.direction === 'any' ? '' : target.direction === 'forward' ? ' in Vorwärtsrichtung' : ' in Rückwärtsrichtung'} (vom ${target.origin === 'alb' ? 'Alb' : 'aktiven Spieler'} aus)`;
  }
}
export function resourceText(resource: ResourceSelection, amount: number): string {
  return resource === 'random'
    ? `${amount} zufällige Ressourceneinheit${amount === 1 ? '' : 'en'}`
    : resource === 'choice'
      ? `${amount} Ressourceneinheit${amount === 1 ? '' : 'en'} deiner Wahl`
      : `${amount} × ${RESOURCE_NAMES[resource]}`;
}
const fields = (amount: number, unit: 'fields' | 'pentagons') =>
  `${amount} ${unit === 'fields' ? (amount === 1 ? 'Feld' : 'Felder') : amount === 1 ? 'Pentagon' : 'Pentagone'}`;
export function effectText(effect: EventEffect): string {
  switch (effect.kind) {
    case 'alb-move':
      return `Der Wandernde Alb bewegt sich ${effect.limit ? `höchstens ${fields(effect.limit.amount, effect.limit.unit)} ` : ''}auf dieses Ziel zu: ${targetText(effect.target)}. Er stoppt beim Zielspieler${effect.limit ? ' oder beim Erreichen des Bewegungslimits' : ''}.`;
    case 'alb-steal':
      return `Der Wandernde Alb stiehlt ${resourceText(effect.resource, effect.amount)} aus dem mitgeführten Vorrat. Betroffen: ${targetText(effect.target)}. Die Beute bleibt beim Alb.`;
    case 'alb-give':
      return `${targetText(effect.target)} erhält ${resourceText(effect.resource, effect.amount)} vom Alb und führt sie mit. Sein Vorrat ist unendlich. Dafür bewegt er sich auf den Empfänger zu: ${effect.approach.unit === 'pentagons' && effect.approach.amount === 1 ? 'bis zum nächsten Pentagon' : `höchstens ${fields(effect.approach.amount, effect.approach.unit)}`}. Er stoppt spätestens beim Empfänger.`;
    case 'gift': {
      const amount = resourceText(effect.resource, effect.amount);
      const inventory =
        effect.source.kind === 'players' && effect.source.inventory === 'stored'
          ? 'dem Lager'
          : 'dem mitgeführten Vorrat';
      const acquisition =
        effect.source.kind === 'bank'
          ? `Du erhältst ${amount} von der Bank.`
          : effect.source.target.kind === 'all'
            ? `Jeder andere Spieler gibt dir ${amount} aus ${inventory}.`
            : `Du erhältst ${amount} aus ${inventory} dieses Ziels: ${targetText(effect.source.target, true)}.`;
      return `${acquisition} ${effect.destination === 'stored' ? 'Lege das Geschenk direkt in dein Lager.' : 'Nimm das Geschenk in deinen mitgeführten Vorrat auf.'}`;
    }
    case 'protection':
      return `${targetText(effect.target)}: Schutz vor Ressourcendiebstahl durch ${effect.against === 'alb' ? 'den Wandernden Alb' : effect.against === 'players' ? 'andere Spieler' : 'den Alb und andere Spieler'} bis zum Beginn des ${effect.turns === 1 ? 'nächsten' : `${effect.turns}. nächsten`} eigenen Zuges.`;
    case 'bonus-roll':
      return `${targetText(effect.target)}: Würfle sofort einmal zusätzlich und ziehe die Augenzahl vorwärts. ${effect.fieldActions === 'each' ? 'Führe auf jedem betretenen Feld die Feldaktion aus.' : effect.fieldActions === 'last' ? 'Führe nur die Feldaktion am Ziel aus.' : 'Führe dabei keine Feldaktionen aus.'}`;
    case 'move':
      return `${targetText(effect.target)}: ${effect.optional ? 'Du darfst ' : ''}${fields(effect.amount, effect.unit)} ${effect.direction === 'forward' ? 'vorwärts' : 'rückwärts'} ziehen. ${effect.fieldActions === 'each' ? 'Auf jedem betretenen Feld die Feldaktion ausführen.' : effect.fieldActions === 'last' ? 'Nur die Feldaktion am Ziel ausführen.' : 'Dabei keine Feldaktionen ausführen.'}`;
    case 'pentagon':
      return `${targetText(effect.target)}: Gehe direkt zum ${effect.ordinal === 1 ? 'nächsten' : `${effect.ordinal}. nächsten`} Pentagon in ${effect.direction === 'forward' ? 'Vorwärtsrichtung' : 'Rückwärtsrichtung'}. ${effect.fieldAction ? 'Führe dort die Feldaktion aus.' : 'Keine Feldaktion ausführen.'}`;
    case 'resources': {
      const amount = resourceText(effect.resource, effect.amount),
        target = targetText(effect.target);
      switch (effect.operation) {
        case 'gain':
          return `${target}: ${amount} von der Bank erhalten${effect.location === 'stored' ? ' und direkt einlagern' : ' und mitführen'}.`;
        case 'lose':
          return `${target}: ${amount} aus ${effect.location === 'stored' ? 'dem Lager' : 'dem mitgeführten Vorrat'} abgeben.`;
        case 'pay':
          return `${target}: ${amount} aus ${effect.location === 'stored' ? 'dem Lager' : 'dem mitgeführten Vorrat'} an die Bank bezahlen.`;
        case 'store':
          return `${target}: ${amount} vom mitgeführten Vorrat in das eigene Lager verschieben.`;
        case 'withdraw':
          return `${target}: ${amount} aus dem eigenen Lager abheben und wieder mitführen.`;
      }
      throw new Error('Unbekannte Ressourcenaktion.');
    }
    case 'steal':
      return `Du stiehlst ${resourceText(effect.resource, effect.amount)} aus ${effect.location === 'stored' ? 'dem Lager' : 'dem mitgeführten Vorrat'} dieses Ziels: ${targetText(effect.target, true)}. Nimm die Beute in deinen mitgeführten Vorrat auf.`;
    case 'tile-change':
      return `${targetText(effect.target)}: ${effect.optional ? 'Du darfst bis zu' : 'Du musst'} ${effect.amount} Gebiet${effect.amount === 1 ? '' : 'e'} deiner Wahl ${effect.operation === 'rotate' ? 'drehen' : 'verschieben'}. Die Gebiete müssen anschließend regelgerecht verbunden sein.`;
    case 'custom':
      return effect.text;
  }
}
export function stepText(step: EventStep): string {
  const payment = step.cost
    ? `Kosten vorher: ${resourceText(step.cost.resource, step.cost.amount)} ${step.cost.source === 'stored' ? 'aus deinem Lager' : step.cost.source === 'either' ? 'aus deinem Vorrat und/oder Lager' : 'aus deinem mitgeführten Vorrat'}. Wenn du nicht vollständig zahlen kannst, ${step.cost.failure === 'skip-card' ? 'endet diese Karte sofort' : 'entfällt dieser Effekt'}. `
    : '';
  return payment + effectText(step.effect);
}
export function cardCategory(card: EventCard): string {
  return card.steps.some(({ effect }) => effect.kind.startsWith('alb-'))
    ? 'Wandernder Alb'
    : card.steps.every(
          ({ effect }) =>
            effect.kind === 'resources' || effect.kind === 'steal' || effect.kind === 'gift',
        )
      ? 'Ressourcen'
      : 'Abenteuer';
}
export function cardRules(card: EventCard, design: CardDesign): string[] {
  const rules: string[] = [];
  const targets = card.steps.flatMap(({ effect }) => effectTargets(effect));
  if (targets.some((target) => target.kind === 'board'))
    rules.push(
      `Brettentfernung: ${design.distanceMetric === 'path' ? 'kürzester Weg über Spielfelder' : 'Luftlinie zwischen Figuren'}. Gleichstand: Zugreihenfolge ab aktivem Spieler. Der Ursprungsspieler zählt nicht als eigenes Ziel.`,
    );
  if (
    targets.some((target) => target.kind === 'board' && target.direction !== 'any') ||
    card.steps.some(
      ({ effect }) =>
        effect.kind === 'move' || effect.kind === 'pentagon' || effect.kind === 'bonus-roll',
    )
  )
    rules.push(
      'Vorwärts und rückwärts folgen der vereinbarten Laufrichtung. An Abzweigungen entscheidet der aktive Spieler.',
    );
  if (targets.some((target) => target.kind === 'turn-order'))
    rules.push(
      'Zugreihenfolge zählt zyklisch; der aktive Spieler wird übersprungen. Fehlt ein anderer Zielspieler, entfällt der Effekt.',
    );
  if (targets.some((target) => target.kind === 'board'))
    rules.push(
      'Fehlt ein Spieler für den Entfernungsrang oder ist er nicht erreichbar, entfällt der Effekt.',
    );
  if (card.steps.some(({ effect }) => effect.kind === 'alb-move' || effect.kind === 'alb-give'))
    rules.push(
      'Der Alb folgt dem kürzesten erlaubten Weg. Betretene Felder lösen für ihn keine Feldaktionen aus. Pentagone zählen erst nach Verlassen des Startfelds.',
    );
  if (
    card.steps.some(
      ({ effect }) =>
        (effect.kind === 'move' || effect.kind === 'bonus-roll') && effect.fieldActions === 'each',
    )
  )
    rules.push(
      'Die Bewegung zählt nur die durch diese Karte angeordneten Schritte. Zusätzliche Bewegung aus Feldaktionen verlängert diese Schrittzahl nicht.',
    );
  if (card.steps.some(({ effect, cost }) => 'resource' in effect || cost !== null))
    rules.push(
      'Ohne ausreichenden Bestand wird höchstens der vorhandene Bestand übertragen. Zufällig: Einheiten ohne Zurücklegen aus dem betroffenen Vorrat; bei Erhalt Arten gleich wahrscheinlich. „Deiner Wahl“ entscheidet der aktive Spieler. Lager und mitgeführter Vorrat sind getrennt. Kosten müssen vollständig bezahlt werden.',
    );
  if (card.steps.some(({ effect }) => effect.kind === 'alb-give'))
    rules.push(
      'Der Alb hat einen unendlichen Ressourcenvorrat. Der Empfänger bekommt die angegebene Menge; als Gegenleistung bewegt sich der Alb danach auf ihn zu. Ein Pentagon zählt erst, wenn es nach dem Verlassen des Startfelds erreicht wird.',
    );
  if (card.steps.some(({ effect }) => effect.kind === 'gift' && effect.source.kind === 'players'))
    rules.push(
      'Geschenke von Mitspielern werden aus dem angegebenen Vorrat übertragen, höchstens soweit vorhanden. „Alle anderen“ meint jeden Mitspieler außer dem aktiven Spieler; die Menge gilt pro Geber. Der aktive Spieler bleibt Empfänger.',
    );
  if (card.steps.some(({ effect }) => effect.kind === 'protection'))
    rules.push(
      'Diebstahlschutz verhindert nur Ressourcendiebstahl durch die angegebene Quelle. Zahlungen, Kosten, Geschenke und andere Ressourcenverluste bleiben möglich. Die Dauer zählt die eigenen Züge des geschützten Spielers.',
    );
  if (card.steps.some(({ effect }) => effect.kind === 'bonus-roll'))
    rules.push(
      'Ein Zusatzwurf ist eine zusätzliche Würfelbewegung innerhalb des laufenden Zuges, kein vollständiger weiterer Spielzug.',
    );
  return rules;
}
/** Includes nested gift donors so previews and rule sheets resolve their distances consistently. */
export function effectTargets(effect: EventEffect): PlayerTarget[] {
  return 'target' in effect
    ? [effect.target]
    : effect.kind === 'gift' && effect.source.kind === 'players'
      ? [effect.source.target]
      : [];
}
