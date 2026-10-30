import { ACTION_PALETTES, ACTION_PIXELS } from '../render/icons';
import type { ActionId } from '../core/types';
import {
  cardCategory,
  cardRules,
  cardDesignSchema,
  eventCardSchema,
  effectTargets,
  stepText,
} from '../core/events';
import type { CardDesign, EventCard, EventProject } from '../core/events';
import { CARD_LANDSCAPE_VERSION } from './landscape';

export const CARD_WIDTH = 756;
export const CARD_HEIGHT = 1056;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
const hexPoints = (cx: number, cy: number, r: number) =>
  Array.from(
    { length: 6 },
    (_, i) => `${cx + r * Math.cos((Math.PI * i) / 3)},${cy + r * Math.sin((Math.PI * i) / 3)}`,
  ).join(' ');
function symbol(action: ActionId, x: number, y: number, size: number): string {
  const palette = ACTION_PALETTES[action];
  let output = `<g transform="translate(${x} ${y}) scale(${size / 72})">`;
  ACTION_PIXELS[action].forEach((row, py) => {
    let px = 0;
    while (px < row.length) {
      const code = row[px]!,
        start = px;
      while (px < row.length && row[px] === code) px++;
      if (code !== '0')
        output += `<rect x="${start}" y="${py}" width="${px - start}" height="1" fill="${palette[code as keyof typeof palette]}"/>`;
    }
  });
  return output + '</g>';
}
function wrap(text: string, width: number, size: number): string[] {
  const limit = Math.max(8, Math.floor(width / (size * 0.56))),
    lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const parts = word.length > limit ? word.match(new RegExp(`.{1,${limit}}`, 'gu'))! : [word];
    for (const part of parts) {
      if (current && current.length + part.length + 1 > limit) {
        lines.push(current);
        current = '';
      }
      current += (current ? ' ' : '') + part;
    }
  }
  if (current) lines.push(current);
  return lines;
}
function textBlock(
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  fill: string,
  weight = 400,
  anchor = 'start',
): string {
  const lines = wrap(text, width, size);
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? size * 1.3 : 0}">${escape(line)}</tspan>`).join('')}</text>`;
}
function frame(design: CardDesign): string {
  let pattern = '';
  for (let y = 25; y < CARD_HEIGHT; y += 76)
    for (let x = (Math.floor(y / 76) % 2) * 44; x < CARD_WIDTH; x += 88)
      pattern += `<polygon points="${hexPoints(x, y, 42)}"/>`;
  return `<rect width="756" height="1056" rx="36" fill="${design.background}"/><g fill="none" stroke="${design.accent}" stroke-width="1" opacity=".14">${pattern}</g><rect x="18" y="18" width="720" height="1020" rx="26" fill="none" stroke="${design.ink}" stroke-width="3"/><rect x="28" y="28" width="700" height="1000" rx="18" fill="none" stroke="${design.accent}" stroke-width="2"/>`;
}
export function eventCardSvg(
  input: EventCard,
  suppliedDesign: CardDesign,
  side: 'front' | 'back',
  landscapeSeed = 'hexa-card-landscape',
  frontImage?: string,
  backImage?: string,
): string {
  const card = eventCardSchema.parse(input),
    design = cardDesignSchema.parse(suppliedDesign);
  const opening = `<svg data-render-version="${CARD_LANDSCAPE_VERSION}" data-landscape-seed="${escape(landscapeSeed)}" xmlns="http://www.w3.org/2000/svg" width="756" height="1056" viewBox="0 0 756 1056" role="img" aria-label="${escape(side === 'front' ? card.title : design.backTitle)}"><title>${escape(side === 'front' ? card.title : design.backTitle)}</title><g font-family="Arial, sans-serif">${frame(design)}`;
  if (side === 'back')
    return (
      opening +
      `<defs><clipPath id="back-landscape-clip"><rect width="756" height="1056" rx="36"/></clipPath></defs><g clip-path="url(#back-landscape-clip)">${backImage ? `<image data-landscape="webgl-map" href="${escape(backImage)}" width="756" height="1056"/>` : '<rect data-art-pending="true" width="756" height="1056" fill="#748963"/>'}<rect width="756" height="1056" fill="#172c3b" opacity=".12"/></g><rect x="125" y="427" width="506" height="190" rx="18" fill="${design.ink}" opacity=".9"/><rect x="135" y="437" width="486" height="170" rx="11" fill="none" stroke="${design.accent}" stroke-width="3"/>${symbol('event', 174, 461, 110)}${textBlock(design.backTitle, 453, 503, 310, 27, design.background, 700, 'middle')}${textBlock(design.footer, 453, 552, 310, 14, design.background, 400, 'middle')}<rect x="18" y="18" width="720" height="1020" rx="26" fill="none" stroke="${design.ink}" stroke-width="3"/></g></svg>`
    );
  const category = cardCategory(card);
  const action: ActionId =
    category === 'Wandernder Alb'
      ? 'alb'
      : category === 'Ressourcen'
        ? 'gold'
        : card.steps[0]?.effect.kind === 'tile-change'
          ? 'rotate'
          : 'jump';
  const artwork = frontImage
    ? `<image data-landscape="webgl-tile" href="${escape(frontImage)}" x="0" y="700" width="756" height="356" preserveAspectRatio="xMidYMid slice"/>`
    : '<rect data-art-pending="true" x="0" y="700" width="756" height="356" fill="#647f58"/>';
  let content = artwork;
  content += textBlock(`EREIGNIS · ${category.toUpperCase()}`, 58, 66, 630, 16, design.accent, 700);
  content += symbol(action, 568, 90, 120);
  let titleSize = 35;
  while (titleSize > 20 && wrap(card.title, 470, titleSize).length > 2) titleSize--;
  content += textBlock(card.title, 58, 120, 470, titleSize, design.ink, 700);
  if (card.flavor) content += textBlock(card.flavor, 58, 188, 470, 14, design.ink);
  content += `<rect x="50" y="236" width="656" height="42" rx="8" fill="${design.ink}"/>${textBlock(card.mode === 'choice' ? 'WÄHLE GENAU EINEN EFFEKT' : card.steps.length > 1 ? 'FÜHRE DIE EFFEKTE DER REIHE NACH AUS' : 'FÜHRE DIESEN EFFEKT AUS', 378, 263, 610, 15, design.background, 700, 'middle')}`;
  const paragraphs = card.steps.map(stepText);
  let size = 27;
  while (
    size > 16 &&
    paragraphs.reduce((sum, text) => sum + wrap(text, 585, size).length * size * 1.3 + 22, 0) > 480
  )
    size--;
  const total = paragraphs.reduce(
    (sum, text) => sum + wrap(text, 585, size).length * size * 1.3 + 22,
    0,
  );
  if (total > 650)
    throw new Error(
      'Der Kartentext ist zu lang. Kürze eigene Texte oder verteile Effekte auf mehrere Karten.',
    );
  if (318 + total > 700)
    content += `<rect x="44" y="700" width="668" height="${Math.min(263, 318 + total - 690)}" fill="${design.background}" opacity=".93"/>`;
  let y = 318;
  paragraphs.forEach((paragraph, i) => {
    content += `<polygon points="${hexPoints(73, y - 7, 17)}" fill="${design.accent}"/><text x="73" y="${y - 1}" fill="${design.background}" font-size="17" font-weight="700" text-anchor="middle">${i + 1}</text>`;
    content += textBlock(paragraph, 109, y, 585, size, design.ink);
    y += wrap(paragraph, 585, size).length * size * 1.3 + 22;
  });
  const hasBoardTarget = card.steps.some(({ effect }) =>
    effectTargets(effect).some((target) => target.kind === 'board'),
  );
  const hint = hasBoardTarget
    ? `Brettentfernung: ${design.distanceMetric === 'path' ? 'kürzester Weg' : 'Luftlinie'}. Gleichstand: Zugreihenfolge.`
    : 'Bestände nur soweit vorhanden. Kosten immer vollständig bezahlen.';
  content += `<rect x="0" y="961" width="756" height="70" fill="${design.background}" opacity=".88"/><path d="M58 971H698" stroke="${design.accent}" stroke-width="2"/>${textBlock(hint, 58, 992, 640, 13, design.ink)}${textBlock('Weitere Ziel- und Auflösungsregeln: Begleitblatt des Kartensets.', 58, 1015, 640, 12, design.ink)}<rect x="18" y="18" width="720" height="1020" rx="26" fill="none" stroke="${design.ink}" stroke-width="3"/>`;
  return opening + content + '</g></svg>';
}
export function eventRulesText(project: EventProject): string {
  const rules = [...new Set(project.cards.flatMap((card) => cardRules(card, project.design)))];
  return `${project.name}\n\nAUFLÖSUNG\n${rules.map((rule) => `• ${rule}`).join('\n')}\n\nKARTEN\n${project.cards.map((card, i) => `${i + 1}. ${card.title}\n${card.mode === 'choice' ? 'Einen Effekt wählen.' : 'Effekte nacheinander ausführen.'}\n${card.steps.map((step, j) => `${j + 1}) ${stepText(step)}`).join('\n')}`).join('\n\n')}\n`;
}
/** Nine poker-size cards per sheet; back rows are mirrored for long-edge duplex printing. */
export function eventPrintHtml(
  project: EventProject,
  artwork: Readonly<Record<string, string>> = {},
  backImage?: string,
): string {
  const pages: string[] = [];
  const backSvg = project.cards.length
    ? eventCardSvg(
        project.cards[0]!,
        project.design,
        'back',
        project.generator.seed,
        undefined,
        backImage,
      )
    : '';
  const backContents = backSvg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const sharedBack = `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><defs><symbol id="card-back" viewBox="0 0 756 1056">${backContents}</symbol></defs></svg>`;
  for (let offset = 0; offset < project.cards.length; offset += 9) {
    const cards = project.cards.slice(offset, offset + 9);
    pages.push(
      `<section class="sheet">${cards.map((card) => eventCardSvg(card, project.design, 'front', project.generator.seed, artwork[card.id])).join('')}</section>`,
    );
    const backs: string[] = [];
    for (let row = 0; row < 3; row++)
      for (let col = 2; col >= 0; col--) {
        const card = cards[row * 3 + col];
        backs.push(
          card
            ? '<svg viewBox="0 0 756 1056" aria-label="Kartenrückseite"><use href="#card-back"/></svg>'
            : '<div></div>',
        );
      }
    pages.push(`<section class="sheet">${backs.join('')}</section>`);
  }
  return `<!doctype html><html lang="de"><meta charset="utf-8"><title>${escape(project.name)}</title><style>@page{size:A4;margin:8mm}body{font-family:Arial,sans-serif;margin:0;color:#172c3b}.sheet{display:grid;grid-template-columns:repeat(3,63mm);grid-template-rows:repeat(3,88mm);gap:2mm;break-after:page}.sheet svg{width:63mm;height:88mm}.instructions{max-width:190mm;white-space:pre-wrap;font-size:10pt;line-height:1.45}h1{font-size:18pt}@media screen{body{background:#ddd;padding:20px}.sheet,.instructions{background:white;padding:8mm;margin:auto auto 20px;width:193mm}}</style><body>${sharedBack}${pages.join('')}<article class="instructions"><h1>Druck & Auflösungsregeln</h1><p>100 % / tatsächliche Größe, A4, beidseitig an der langen Kante wenden. Vorder- und Rückseiten wechseln sich ab. Erst einen Probedruck zur Ausrichtung machen. Kartenformat 63 × 88 mm.</p>${escape(eventRulesText(project))}</article></body></html>`;
}
