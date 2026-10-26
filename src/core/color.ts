import type { GradientStop } from './types';

export const MIN_PATH_TERRAIN_CONTRAST = 0.18;

interface Oklab {
  l: number;
  a: number;
  b: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

function toOklab(color: string): Oklab {
  const channel = (offset: number): number => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const red = channel(1),
    green = channel(3),
    blue = channel(5),
    l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue),
    m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue),
    s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function fromOklab(color: Oklab): string {
  const l = (color.l + 0.3963377774 * color.a + 0.2158037573 * color.b) ** 3,
    m = (color.l - 0.1055613458 * color.a - 0.0638541728 * color.b) ** 3,
    s = (color.l - 0.0894841775 * color.a - 1.291485548 * color.b) ** 3,
    linear = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ],
    hex = linear
      .map((value) => {
        const srgb = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
        return Math.round(clamp(srgb, 0, 1) * 255)
          .toString(16)
          .padStart(2, '0');
      })
      .join('');
  return `#${hex}`;
}

const labDistance = (a: Oklab, b: Oklab): number => Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);

export function oklabColorDistance(first: string, second: string): number {
  return labDistance(toOklab(first), toOklab(second));
}

/** Keep generated paths legible against local terrain while changing the sampled gradient minimally. */
export function ensurePathTerrainContrast(
  pathColor: string,
  terrainColors: readonly string[],
  minimumDistance = MIN_PATH_TERRAIN_CONTRAST,
): string {
  const backgrounds = [...new Set(terrainColors.map((color) => color.toLowerCase()))].map(toOklab);
  if (!backgrounds.length) return pathColor;
  const original = toOklab(pathColor),
    distanceFromBackgrounds = (candidate: Oklab) =>
      Math.min(...backgrounds.map((background) => labDistance(candidate, background)));
  if (distanceFromBackgrounds(original) >= minimumDistance) return pathColor;

  let bestWithinTarget: { color: string; shift: number; contrast: number } | undefined,
    bestContrast: { color: string; shift: number; contrast: number } | undefined;
  const directions: Oklab[] = [
    { l: -1, a: 0, b: 0 },
    { l: 1, a: 0, b: 0 },
  ];
  for (let index = 0; index < 8; index++) {
    const hue = (index / 8) * Math.PI * 2,
      a = Math.cos(hue),
      b = Math.sin(hue);
    directions.push({ l: 0, a, b }, { l: -0.5, a, b }, { l: 0.5, a, b });
  }
  const consider = (lab: Oklab): { color: string; shift: number; contrast: number } => {
    const color = fromOklab(lab),
      displayed = toOklab(color),
      contrast = distanceFromBackgrounds(displayed),
      candidate = { color, shift: labDistance(original, displayed), contrast };
    if (
      !bestContrast ||
      contrast > bestContrast.contrast ||
      (contrast === bestContrast.contrast && candidate.shift < bestContrast.shift)
    )
      bestContrast = candidate;
    if (
      contrast >= minimumDistance &&
      (!bestWithinTarget ||
        candidate.shift < bestWithinTarget.shift ||
        (candidate.shift === bestWithinTarget.shift && candidate.color < bestWithinTarget.color))
    )
      bestWithinTarget = candidate;
    return candidate;
  };
  for (const rawDirection of directions) {
    const length = Math.hypot(rawDirection.l, rawDirection.a, rawDirection.b),
      direction = {
        l: rawDirection.l / length,
        a: rawDirection.a / length,
        b: rawDirection.b / length,
      };
    let previousStep = 0;
    for (let stepIndex = 1; stepIndex <= 14; stepIndex++) {
      const step = (stepIndex / 14) * 0.7,
        sample = consider({
          l: original.l + direction.l * step,
          a: original.a + direction.a * step,
          b: original.b + direction.b * step,
        });
      if (sample.contrast >= minimumDistance) {
        let low = previousStep,
          high = step;
        for (let iteration = 0; iteration < 8; iteration++) {
          const middle = (low + high) / 2,
            candidate = consider({
              l: original.l + direction.l * middle,
              a: original.a + direction.a * middle,
              b: original.b + direction.b * middle,
            });
          if (candidate.contrast >= minimumDistance) high = middle;
          else low = middle;
        }
        break;
      }
      previousStep = step;
    }
  }
  return bestWithinTarget?.color ?? bestContrast?.color ?? pathColor;
}

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
