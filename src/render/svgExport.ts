import * as THREE from 'three';
import { ACTION_ICON_SIZE, ACTION_PALETTES, actionPixels } from './icons';
import { portableModel } from './modelExport';
import type { ActionId } from '../core/types';

const number = (value: number) => String(Math.round(value * 1e6) / 1e6);
interface Bucket {
  fill: Map<string, string[]>;
  lines: Map<string, string[]>;
  icons: string[];
}

/** Native vector pixels, including the card-shaped backing used by the PNG texture. */
function iconSymbol(action: ActionId, amount: number): string {
  const paths = new Map<string, string[]>();
  actionPixels(action, amount).forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const pixel = row[x]!,
        start = x;
      while (x < row.length && row[x] === pixel) x++;
      if (pixel === '0') continue;
      const color = ACTION_PALETTES[action][pixel as keyof (typeof ACTION_PALETTES)[ActionId]];
      const commands = paths.get(color) ?? [];
      commands.push(`M${start} ${y}h${x - start}v1h-${x - start}Z`);
      paths.set(color, commands);
    }
  });
  return `<symbol id="icon-${action}-${amount}" viewBox="0 0 ${ACTION_ICON_SIZE} ${ACTION_ICON_SIZE}" shape-rendering="crispEdges"><g fill="#172c3b"><path d="M6 2h60v68H6ZM2 8h68v56H2Z"/></g><g fill="#fff6dd"><path d="M7 4h58v64H7ZM4 9h64v54H4Z"/></g><path fill="#fff" d="M10 4h52v2H10Z"/>${[...paths].map(([color, commands]) => `<path fill="${color}" d="${commands.join('')}"/>`).join('')}</symbol>`;
}

/** Orthographic vector projection of actual rendered caps, voxel objects, borders and grid lines.
 * Procedural material grain and lighting are deliberately left to PNG/GLB exports.
 */
export function topViewSvg(content: THREE.Group, size: number, transparent: boolean): string {
  if (!Number.isInteger(size) || size < 128 || size > 4096)
    throw new Error('Die SVG-Bildgröße muss zwischen 128 und 4096 px liegen.');
  const paletteGeometries = new Map<string, THREE.BufferGeometry>();
  const model = portableModel(content, paletteGeometries);
  const buckets = new Map<number, Bucket>();
  const symbols = new Map<string, string>();
  const colors = new Map<string, string>();
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const color = new THREE.Color();
  const bucketAt = (height: number) => {
    const key = Math.round(height * 1e6);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { fill: new Map(), lines: new Map(), icons: [] };
      buckets.set(key, bucket);
    }
    return bucket;
  };
  const paint = (
    material: THREE.Material,
    attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
    ids: number[],
  ) => {
    const base =
      'color' in material && material.color instanceof THREE.Color
        ? material.color
        : new THREE.Color(1, 1, 1);
    let r = base.r,
      g = base.g,
      bl = base.b;
    if ('vertexColors' in material && material.vertexColors && attribute) {
      r *= ids.reduce((sum, id) => sum + attribute.getX(id), 0) / ids.length;
      g *= ids.reduce((sum, id) => sum + attribute.getY(id), 0) / ids.length;
      bl *= ids.reduce((sum, id) => sum + attribute.getZ(id), 0) / ids.length;
    }
    const key = `${r}:${g}:${bl}:${material.opacity}`;
    let style = colors.get(key);
    if (!style) {
      style = `#${color.setRGB(r, g, bl).getHexString()}:${number(material.opacity)}`;
      colors.set(key, style);
    }
    return style;
  };
  try {
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    if (bounds.isEmpty()) throw new Error('Die SVG-Draufsicht enthält keine Geometrie.');
    model.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
      const geometry = object.geometry,
        positions = geometry.getAttribute('position');
      if (!positions) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const index = geometry.index;
      const count = index?.count ?? positions.count;
      const vertex = (id: number, target: THREE.Vector3) =>
        target.fromBufferAttribute(positions, id).applyMatrix4(object.matrixWorld);
      const groups = geometry.groups.length
        ? geometry.groups
        : [{ start: 0, count, materialIndex: 0 }];
      for (const group of groups) {
        const material = materials[Array.isArray(object.material) ? (group.materialIndex ?? 0) : 0];
        if (!material || !material.visible || material.opacity <= 0) continue;
        const sprite = material.userData.actionIcon as
          { action?: ActionId; amount?: number } | undefined;
        if (
          object instanceof THREE.Mesh &&
          sprite?.action &&
          sprite.action !== 'none' &&
          Object.hasOwn(ACTION_PALETTES, sprite.action)
        ) {
          const amount = sprite.amount ?? 1;
          const id = `icon-${sprite.action}-${amount}`;
          if (!symbols.has(id)) symbols.set(id, iconSymbol(sprite.action, amount));
          for (let offset = 0; offset + 3 < positions.count; offset += 4) {
            const corners = Array.from({ length: 4 }, (_, i) =>
              vertex(offset + i, new THREE.Vector3()),
            );
            const x = Math.min(...corners.map((p) => p.x)),
              z = Math.min(...corners.map((p) => p.z));
            const width = Math.max(...corners.map((p) => p.x)) - x;
            const height = Math.max(...corners.map((p) => p.z)) - z;
            bucketAt(corners[0]!.y).icons.push(
              `<use href="#${id}" x="${number(x)}" y="${number(z)}" width="${number(width)}" height="${number(height)}"/>`,
            );
          }
          continue;
        }
        const start = Math.max(group.start, geometry.drawRange.start);
        const end = Math.min(
          group.start + group.count,
          count,
          geometry.drawRange.start + geometry.drawRange.count,
        );
        if (object instanceof THREE.LineSegments) {
          for (let i = start; i + 1 < end; i += 2) {
            const ia = index ? index.getX(i) : i,
              ib = index ? index.getX(i + 1) : i + 1;
            vertex(ia, a);
            vertex(ib, b);
            if (a.x === b.x && a.z === b.z) continue;
            const bucket = bucketAt((a.y + b.y) / 2),
              style = paint(material, geometry.getAttribute('color'), [ia, ib]);
            const paths = bucket.lines.get(style) ?? [];
            paths.push(`M${number(a.x)} ${number(a.z)}L${number(b.x)} ${number(b.z)}`);
            bucket.lines.set(style, paths);
          }
          continue;
        }
        const winding = Math.sign(object.matrixWorld.determinant());
        for (let i = start; i + 2 < end; i += 3) {
          const ids = [0, 1, 2].map((offset) => (index ? index.getX(i + offset) : i + offset));
          vertex(ids[0]!, a);
          vertex(ids[1]!, b);
          vertex(ids[2]!, c);
          const area = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
          if (Math.abs(area) < 1e-14) continue;
          const front = area * winding < 0;
          if (
            (material.side === THREE.FrontSide && !front) ||
            (material.side === THREE.BackSide && front)
          )
            continue;
          const bucket = bucketAt((a.y + b.y + c.y) / 3);
          const style = paint(material, geometry.getAttribute('color'), ids);
          const paths = bucket.fill.get(style) ?? [];
          paths.push(
            `M${number(a.x)} ${number(a.z)}L${number(b.x)} ${number(b.z)}L${number(c.x)} ${number(c.z)}Z`,
          );
          bucket.fill.set(style, paths);
        }
      }
    });
    const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * 1.04;
    if (!(span > 0)) throw new Error('Die SVG-Draufsicht hat keine sichtbare Fläche.');
    const x = (bounds.min.x + bounds.max.x - span) / 2,
      z = (bounds.min.z + bounds.max.z - span) / 2;
    const path = (style: string, commands: string[], line: boolean) => {
      const [fill, opacity] = style.split(':');
      return line
        ? `<path fill="none" stroke="${fill}" stroke-opacity="${opacity}" stroke-width=".7" vector-effect="non-scaling-stroke" d="${commands.join('')}"/>`
        : `<path fill="${fill}" fill-opacity="${opacity}" d="${commands.join('')}"/>`;
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${number(x)} ${number(z)} ${number(span)} ${number(span)}" data-export="vector-top-view" data-export-version="1"><title>Hexa Studio · Draufsicht</title><defs>${[...symbols.values()].join('')}</defs>${transparent ? '' : `<rect x="${number(x)}" y="${number(z)}" width="${number(span)}" height="${number(span)}" fill="#eeede4"/>`}${[
      ...buckets,
    ]
      .sort(([a], [b]) => a - b)
      .map(
        ([, bucket]) =>
          [...bucket.fill].map(([style, commands]) => path(style, commands, false)).join('') +
          [...bucket.lines].map(([style, commands]) => path(style, commands, true)).join('') +
          bucket.icons.join(''),
      )
      .join('')}</svg>`;
  } finally {
    paletteGeometries.forEach((geometry) => geometry.dispose());
    model.clear();
  }
}
