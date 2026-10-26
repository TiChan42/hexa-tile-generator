/** Stable object identities shared by the generator, editor and model library. */
export const DECORATION_KINDS = [
  'tree',
  'pine',
  'oak',
  'birch',
  'deadTree',
  'bush',
  'rock',
  'crystal',
  'willow',
  'maple',
  'fern',
  'grass',
  'flowers',
  'mushrooms',
  'reeds',
  'log',
  'stump',
  'quartz',
] as const;

export type DecorationKind = (typeof DECORATION_KINDS)[number];
export type DecorationGroup = 'Bäume' | 'Unterholz' | 'Totholz' | 'Gestein';
export const DECORATION_CATALOG: readonly {
  kind: DecorationKind;
  label: string;
  group: DecorationGroup;
  description: string;
}[] = [
  {
    kind: 'tree',
    label: 'Kiefer',
    group: 'Bäume',
    description: 'Hoher Stamm mit einer lockeren, breiten Nadelkrone.',
  },
  {
    kind: 'pine',
    label: 'Fichte',
    group: 'Bäume',
    description: 'Schmale, gestufte Nadelkrone mit deutlicher Spitze.',
  },
  {
    kind: 'oak',
    label: 'Eiche',
    group: 'Bäume',
    description: 'Kräftiger Stamm und eine breite, dichte Laubkrone.',
  },
  {
    kind: 'birch',
    label: 'Birke',
    group: 'Bäume',
    description: 'Heller Stamm und eine schlanke, lichte Krone.',
  },
  {
    kind: 'willow',
    label: 'Weide',
    group: 'Bäume',
    description: 'Breite Krone mit langen, herabhängenden Zweigen.',
  },
  {
    kind: 'maple',
    label: 'Ahorn',
    group: 'Bäume',
    description: 'Mehrteilige Krone in warmen Herbstfarben.',
  },
  {
    kind: 'bush',
    label: 'Busch',
    group: 'Unterholz',
    description: 'Niedriges, dichtes Gehölz für Waldränder.',
  },
  {
    kind: 'fern',
    label: 'Farn',
    group: 'Unterholz',
    description: 'Bogenförmige, gefiederte Wedel mit freier Mitte.',
  },
  {
    kind: 'grass',
    label: 'Grasbüschel',
    group: 'Unterholz',
    description: 'Mehrere schmale Halme in unterschiedlichen Höhen.',
  },
  {
    kind: 'flowers',
    label: 'Wildblumen',
    group: 'Unterholz',
    description: 'Kleine Blüten zwischen grünen Stielen und Blättern.',
  },
  {
    kind: 'mushrooms',
    label: 'Pilzgruppe',
    group: 'Unterholz',
    description: 'Mehrere Pilze mit unterschiedlich großen Hüten.',
  },
  {
    kind: 'reeds',
    label: 'Schilf',
    group: 'Unterholz',
    description: 'Hohe Halme mit braunen Kolben und schmalen Blättern.',
  },
  {
    kind: 'deadTree',
    label: 'Totholz',
    group: 'Totholz',
    description: 'Aufrechter, kahler Baum mit gebrochenen Ästen.',
  },
  {
    kind: 'log',
    label: 'Baumstamm',
    group: 'Totholz',
    description: 'Liegender Stamm mit Rinde, Astansatz und sichtbarer Schnittfläche.',
  },
  {
    kind: 'stump',
    label: 'Baumstumpf',
    group: 'Totholz',
    description: 'Kurzer Stamm mit Wurzelansätzen und heller Schnittfläche.',
  },
  {
    kind: 'rock',
    label: 'Felsen',
    group: 'Gestein',
    description: 'Niedriger, unregelmäßiger Naturstein.',
  },
  {
    kind: 'crystal',
    label: 'Amethystgruppe',
    group: 'Gestein',
    description: 'Violette, unterschiedlich hohe Kristallspitzen auf einer Felsbasis.',
  },
  {
    kind: 'quartz',
    label: 'Bergkristall',
    group: 'Gestein',
    description: 'Helle, kühle Kristallprismen mit klaren Spitzen.',
  },
];
