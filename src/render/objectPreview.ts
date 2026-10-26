import type { DecorationKind } from '../core/objects';
import { ASSET_LIBRARY } from './voxels';
import type { VoxelModel } from './voxels';

interface PreviewFace {
  points: [number, number][];
  color: string;
  depth: number;
  order: number;
}
const thumbnails = new WeakMap<VoxelModel, string>();
const shade = (color: string, factor: number): string => {
  const hex = /^#[\da-f]{6}$/i.test(color) ? color : '#819175';
  return (
    '#' +
    [1, 3, 5]
      .map((index) =>
        Math.min(255, Math.round(parseInt(hex.slice(index, index + 2), 16) * factor))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
};
const escape = (text: string): string =>
  text.replace(
    /[<>&"']/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!,
  );
const project = (x: number, y: number, z: number): [number, number] => [
  ((x - z) * Math.sqrt(3)) / 2,
  (x + z) * 0.5 - y,
];
const number = (value: number): string => String(Math.round(value * 100) / 100);

/** A real isometric view of occupied model voxels; no browser, canvas, GPU or thumbnail fixtures. */
export function voxelPreviewSvg(model: VoxelModel): string {
  const occupied = new Set(model.voxels.map(([x, y, z]) => `${x},${y},${z}`)),
    faces: PreviewFace[] = [];
  const visible = [
    {
      normal: [1, 0, 0],
      corners: [
        [1, 0, 0],
        [1, 0, 1],
        [1, 1, 1],
        [1, 1, 0],
      ],
      light: 0.85,
    },
    {
      normal: [0, 0, 1],
      corners: [
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1],
      ],
      light: 0.65,
    },
    {
      normal: [0, 1, 0],
      corners: [
        [0, 1, 0],
        [1, 1, 0],
        [1, 1, 1],
        [0, 1, 1],
      ],
      light: 1.08,
    },
  ];
  model.voxels.forEach(([x, y, z, index]) =>
    visible.forEach(({ normal, corners, light }, order) => {
      if (occupied.has(`${x + normal[0]!},${y + normal[1]!},${z + normal[2]!}`)) return;
      faces.push({
        points: corners.map(([dx = 0, dy = 0, dz = 0]) => project(x + dx, y + dy, z + dz)),
        color: shade(model.palette[index] ?? '#819175', light),
        depth: x + y + z,
        order,
      });
    }),
  );
  faces.sort(
    (a, b) =>
      a.depth - b.depth ||
      a.order - b.order ||
      a.points[0]![0] - b.points[0]![0] ||
      a.points[0]![1] - b.points[0]![1],
  );
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const face of faces)
    for (const [x, y] of face.points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  if (!faces.length) {
    minX = -1;
    maxX = 1;
    minY = -1;
    maxY = 1;
  }
  const width = maxX - minX,
    height = maxY - minY,
    padding = Math.max(width, height) * 0.09 + 0.25;
  const polygons = faces
    .map(
      (face) =>
        `<polygon points="${face.points.map(([x, y]) => `${number(x)},${number(y)}`).join(' ')}" fill="${face.color}"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="${number(minX - padding)} ${number(minY - padding)} ${number(width + padding * 2)} ${number(height + padding * 2)}" shape-rendering="crispEdges"><title>${escape(model.name)}</title>${polygons}</svg>`;
}

export function voxelPreviewUrl(model: VoxelModel): string {
  let thumbnail = thumbnails.get(model);
  if (!thumbnail) {
    thumbnail = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(voxelPreviewSvg(model))}`;
    thumbnails.set(model, thumbnail);
  }
  return thumbnail;
}

export function builtinObjectPreviewUrl(kind: DecorationKind): string {
  const model = ASSET_LIBRARY.find((entry) => entry.id === kind);
  return model ? voxelPreviewUrl(model) : '';
}
