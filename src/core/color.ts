import type { GradientStop } from './types';
export function sampleGradient(stops: GradientStop[], value: number): string {
  const t = Math.max(0, Math.min(1, value));
  let a = stops[0]!,
    b = stops.at(-1)!;
  for (let i = 1; i < stops.length; i++)
    if (t <= stops[i]!.at) {
      a = stops[i - 1]!;
      b = stops[i]!;
      break;
    }
  const fraction = b.at === a.at ? 0 : (t - a.at) / (b.at - a.at);
  const component = (offset: number): string =>
    Math.round(
      parseInt(a.color.slice(offset, offset + 2), 16) * (1 - fraction) +
        parseInt(b.color.slice(offset, offset + 2), 16) * fraction,
    )
      .toString(16)
      .padStart(2, '0');
  return `#${component(1)}${component(3)}${component(5)}`;
}
