import { organicTopologyAttempt as legacyOrganicTopologyAttempt } from './legacy-organic-topology';
import { boundaryCells, centroid, isConnectedSelection, sharedBoundaryLength } from './geometry';
import { centralSideCells } from './center-sides';
import {
  cellSurfaceArea,
  clusterCompactness,
  fieldArea,
  MIN_FIELD_AREA,
  type FieldCluster,
} from './fields';
import { perlin, randomAt } from './random';
import type { Entrance, Point, TileCell, TileConfig } from './types';

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
// Geometry scores use integer bins so symmetric choices do not depend on a runtime's
// last-bit Math.hypot/sqrt implementation. IDs break ties in a total, transitive order.
const compareMetric = (a: number, b: number): number => Math.round(a * 1e10) - Math.round(b * 1e10);

const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
interface Region extends FieldCluster {
  point: Point;
  protected: Set<string>;
  area: number;
  target: number;
}
interface Contact {
  a: Region;
  b: Region;
  pairs: [string, string][];
  width: number;
}

/** Local geometric thickness: two rows of hexes, or a two-dimensional diamond patch. */
export function cellHasBody(
  id: string,
  ids: ReadonlySet<string>,
  cells: ReadonlyMap<string, TileCell>,
  kind: TileConfig['grid']['kind'],
): boolean {
  const cell = cells.get(id)!;
  const neighbors = cell.neighbors.filter((next) => ids.has(next));
  if (kind === 'hex')
    return (
      neighbors.length >= 3 ||
      neighbors.some((first, index) =>
        neighbors.slice(index + 1).some((second) => cells.get(first)!.neighbors.includes(second)),
      )
    );
  if (neighbors.length < 2) return false;
  return neighbors.some((a, index) =>
    neighbors.slice(index + 1).some((b) => {
      const x = cells.get(a)!.center,
        y = cells.get(b)!.center;
      return (
        Math.abs(
          (x.x - cell.center.x) * (y.y - cell.center.y) -
            (x.y - cell.center.y) * (y.x - cell.center.x),
        ) > 1e-8
      );
    }),
  );
}

interface FrontierEntry {
  id: string;
  region: Region;
  score: number;
}
const compareFrontier = (a: FrontierEntry, b: FrontierEntry): number =>
  compareMetric(a.score, b.score) ||
  compareText(a.id, b.id) ||
  compareText(a.region.id, b.region.id);
class Frontier {
  private entries: FrontierEntry[] = [];
  get size() {
    return this.entries.length;
  }
  push(entry: FrontierEntry) {
    let index = this.entries.push(entry) - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (compareFrontier(this.entries[parent]!, entry) <= 0) break;
      this.entries[index] = this.entries[parent]!;
      index = parent;
    }
    this.entries[index] = entry;
  }
  pop() {
    const first = this.entries[0]!,
      last = this.entries.pop()!;
    if (!this.entries.length) return first;
    let index = 0;
    while (index * 2 + 1 < this.entries.length) {
      let child = index * 2 + 1;
      if (
        child + 1 < this.entries.length &&
        compareFrontier(this.entries[child + 1]!, this.entries[child]!) < 0
      )
        child++;
      if (compareFrontier(last, this.entries[child]!) <= 0) break;
      this.entries[index] = this.entries[child]!;
      index = child;
    }
    this.entries[index] = last;
    return first;
  }
}

/** Grow connected two-dimensional regions, then open landscape pockets without routing thin arms. */
export function organicTopologyAttempt(
  config: TileConfig,
  cells: TileCell[],
  entrances: Entrance[],
  centerPolygon: Point[],
  attempt = 0,
): FieldCluster[] | null {
  const count = config.paths.fieldCount - 7;
  if (count < 1) return null;
  if (count === 1 && config.grid.divisions <= 8)
    return legacyOrganicTopologyAttempt(config, cells, entrances, centerPolygon, attempt);
  const seed = `${config.seed}:organic-v15:${attempt}`;
  const map = new Map(cells.map((cell) => [cell.id, cell]));
  const outer = new Set(
    Array.from({ length: 6 }, (_, side) => boundaryCells(cells, side)).flatMap((list) =>
      list.map((cell) => cell.id),
    ),
  );
  const occupied = new Map<string, Region>();
  const regions: Region[] = [];
  for (const entrance of entrances) {
    const ids = new Set(entrance.footprintCellIds);
    const inset = 0.79 + randomAt(seed, 'entrance-depth', entrance.side) * 0.1;
    const drift = (randomAt(seed, 'entrance-drift', entrance.side) - 0.5) * 0.15;
    const region: Region = {
      id: `auto:entrance:${entrance.side}`,
      ids,
      point: {
        x: entrance.center.x * inset - entrance.center.y * drift,
        y: entrance.center.y * inset + entrance.center.x * drift,
      },
      protected: new Set(entrance.cellIds),
      area: fieldArea(ids, map),
      target: MIN_FIELD_AREA * (1.03 + randomAt(seed, 'entrance-size', entrance.side) * 0.2),
      fixed: true,
      locked: false,
    };
    if ([...ids].some((id) => !map.has(id))) return null;
    for (const id of ids) occupied.set(id, region);
    regions.push(region);
  }
  const portals = centralSideCells(cells, centerPolygon);
  const pool = cells.filter(
    (cell) =>
      !occupied.has(cell.id) &&
      !outer.has(cell.id) &&
      !cell.reserved &&
      cell.surfacePolygons.length &&
      cell.entranceSide === undefined,
  );
  if (pool.length < count) return null;
  const center = centroid(centerPolygon);
  const seeds: TileCell[] = [];
  const used = new Set<string>();
  while (seeds.length < count) {
    const anchors = [
      center,
      ...seeds.map((cell) => cell.center),
      ...entrances.map((entrance) => entrance.center),
    ];
    const choices = pool
      .filter((cell) => !used.has(cell.id))
      .map((cell) => ({
        cell,
        score:
          Math.min(...anchors.map((anchor) => distance(cell.center, anchor))) *
          (0.9 + randomAt(seed, 'anchor-jitter', cell.id) * 0.2),
      }))
      .sort((a, b) => compareMetric(b.score, a.score) || compareText(a.cell.id, b.cell.id));
    if (!choices.length) return null;
    seeds.push(choices[0]!.cell);
    used.add(choices[0]!.cell.id);
  }
  // Lloyd relaxation moves cores toward the centers of their own areas, not toward the pentagon.
  for (let iteration = 0; iteration < 3; iteration++) {
    const parts = seeds.map(() => [] as TileCell[]);
    for (const cell of pool) {
      let nearest = 0;
      for (let i = 1; i < seeds.length; i++)
        if (
          compareMetric(
            distance(cell.center, seeds[i]!.center),
            distance(cell.center, seeds[nearest]!.center),
          ) < 0
        )
          nearest = i;
      parts[nearest]!.push(cell);
    }
    const taken = new Set<string>();
    parts.forEach((part, index) => {
      if (!part.length) return;
      const mean = {
        x: part.reduce((sum, c) => sum + c.center.x, 0) / part.length,
        y: part.reduce((sum, c) => sum + c.center.y, 0) / part.length,
      };
      const next = part
        .filter((cell) => !taken.has(cell.id))
        .sort(
          (a, b) =>
            compareMetric(distance(a.center, mean), distance(b.center, mean)) ||
            compareText(a.id, b.id),
        )[0];
      if (next) {
        seeds[index] = next;
        taken.add(next.id);
      }
    });
  }
  seeds.forEach((cell, index) => {
    const ids = new Set([cell.id]);
    const region: Region = {
      id: `auto:blob:${index}`,
      ids,
      point: cell.center,
      protected: new Set(ids),
      area: cellSurfaceArea(cell),
      target: Math.max(
        MIN_FIELD_AREA,
        Math.min(0.09, 0.82 / count) * (0.9 + randomAt(seed, 'blob-size', index) * 0.16),
      ),
      locked: false,
    };
    occupied.set(cell.id, region);
    regions.push(region);
  });
  const portalIds = new Set(portals.flatMap((side) => [...side]));
  const permittedContacts = new Set<string>();
  const claimable = (id: string, region: Region) => {
    const cell = map.get(id)!;
    return (
      !outer.has(id) &&
      !occupied.has(id) &&
      !cell.landscapeOnly &&
      cell.surfacePolygons.length > 0 &&
      (cell.entranceSide === undefined || region.id === `auto:entrance:${cell.entranceSide}`) &&
      !portalIds.has(id) &&
      (!permittedContacts.size ||
        cell.neighbors.every((next) => {
          const owner = occupied.get(next);
          return !owner || owner === region || permittedContacts.has(pair(owner.id, region.id));
        }))
    );
  };
  const queue = new Frontier();
  const noise = new Map(
    cells.map((cell) => [
      cell.id,
      perlin(`${seed}:blob-boundary`, cell.center.x * 3.7, cell.center.y * 3.7),
    ]),
  );
  const enqueue = (region: Region, id: string) => {
    for (const next of map.get(id)!.neighbors)
      if (claimable(next, region)) {
        const point = map.get(next)!.center;
        const d = distance(point, region.point);
        queue.push({
          id: next,
          region,
          score:
            d * d * (1 + noise.get(next)! * 0.24) +
            randomAt(seed, 'frontier-tie', region.id, next) * 1e-6,
        });
      }
  };
  for (const region of regions) for (const id of region.ids) enqueue(region, id);
  while (queue.size) {
    const next = queue.pop();
    if (!claimable(next.id, next.region)) continue;
    next.region.ids.add(next.id);
    next.region.area += cellSurfaceArea(map.get(next.id)!);
    occupied.set(next.id, next.region);
    enqueue(next.region, next.id);
  }
  const selectedSides: number[] = [],
    owners = new Set<Region>();
  const wanted = Math.min(count, 2 + Math.floor(randomAt(seed, 'portal-count') * 2));
  const sideOptions = portals.map((ids, side) => ({ ids, side })).filter(({ ids }) => ids.size);
  while (selectedSides.length < wanted && sideOptions.length) {
    sideOptions.sort((a, b) => {
      const score = (side: number) =>
        selectedSides.length
          ? Math.min(
              ...selectedSides.map((other) =>
                Math.min(Math.abs(side - other), 5 - Math.abs(side - other)),
              ),
            ) +
            randomAt(seed, 'portal-spread', side) * 0.75
          : randomAt(seed, 'portal-first', side);
      return compareMetric(score(b.side), score(a.side)) || a.side - b.side;
    });
    const option = sideOptions.shift()!;
    const target = map.get(option.ids.values().next().value!)!.portalTargetId;
    const owner = target ? occupied.get(target) : undefined;
    if (!owner || owner.fixed || owners.has(owner)) continue;
    for (const id of option.ids) {
      owner.ids.add(id);
      owner.protected.add(id);
      owner.area += cellSurfaceArea(map.get(id)!);
      occupied.set(id, owner);
    }
    owners.add(owner);
    owner.protected.add(target!);
    selectedSides.push(option.side);
  }
  if (!selectedSides.length) return null;
  if (
    regions.some(
      (region) =>
        region.area + 1e-10 < MIN_FIELD_AREA || !isConnectedSelection([...region.ids], cells),
    )
  )
    return null;
  const contacts = new Map<string, Contact>();
  for (const cell of cells) {
    const a = occupied.get(cell.id);
    if (!a) continue;
    for (const next of cell.neighbors) {
      if (next < cell.id) continue;
      const b = occupied.get(next);
      if (!b || a === b) continue;
      const key = pair(a.id, b.id),
        contact = contacts.get(key) ?? { a, b, pairs: [], width: 0 };
      contact.pairs.push([cell.id, next]);
      contact.width += sharedBoundaryLength(cell.polygon, map.get(next)!.polygon);
      contacts.set(key, contact);
    }
  }
  const rank = [...contacts.values()].sort((a, b) => {
    const score = (edge: Contact) =>
      (distance(edge.a.point, edge.b.point) *
        (0.85 + randomAt(seed, 'contact-tree', pair(edge.a.id, edge.b.id)) * 0.3)) /
      Math.sqrt(0.03 + edge.width);
    return (
      compareMetric(score(a), score(b)) || compareText(pair(a.a.id, a.b.id), pair(b.a.id, b.b.id))
    );
  });
  const parents = new Map(regions.map((region) => [region.id, region.id]));
  const root = (id: string): string => (parents.get(id) === id ? id : root(parents.get(id)!));
  const selected = new Set<Contact>();
  const degree = new Map(regions.map((region) => [region.id, owners.has(region) ? 1 : 0]));
  const fourWay = count > 2 && randomAt(seed, 'rare-four-way') < 0.05;
  const limit = count === 1 ? 7 : 3;
  const canConnect = (edge: Contact) => {
    const degrees = [degree.get(edge.a.id)!, degree.get(edge.b.id)!];
    return (
      degrees.every((value) => value < limit) ||
      (fourWay &&
        degrees.every((value) => value < 4) &&
        degrees.filter((value) => value === 3).length === 1 &&
        !regions.some((region) => degree.get(region.id)! >= 4))
    );
  };
  const connect = (edge: Contact) => {
    selected.add(edge);
    degree.set(edge.a.id, degree.get(edge.a.id)! + 1);
    degree.set(edge.b.id, degree.get(edge.b.id)! + 1);
  };
  // Prefer a chain through the contact graph; branching has a substantial explicit cost.
  while (new Set(regions.map((region) => root(region.id))).size > 1) {
    const choices = rank.filter((edge) => root(edge.a.id) !== root(edge.b.id) && canConnect(edge));
    choices.sort((a, b) => {
      const cost = (edge: Contact) =>
        [edge.a, edge.b].reduce(
          (sum, region) => sum + Math.max(0, degree.get(region.id)! - 1) * 20,
          0,
        ) + rank.indexOf(edge);
      return cost(a) - cost(b);
    });
    const edge = choices[0];
    if (!edge) return null;
    parents.set(root(edge.a.id), root(edge.b.id));
    connect(edge);
  }
  if (config.paths.loop) {
    const leaves = [...regions].sort((a, b) => degree.get(a.id)! - degree.get(b.id)!);
    for (const region of leaves)
      if (degree.get(region.id)! < 2) {
        const choices = rank.filter(
          (edge) =>
            !selected.has(edge) && (edge.a === region || edge.b === region) && canConnect(edge),
        );
        choices.sort((a, b) => {
          const other = (edge: Contact) => (edge.a === region ? edge.b : edge.a);
          return degree.get(other(a).id)! - degree.get(other(b).id)!;
        });
        if (choices[0]) connect(choices[0]);
      }
  }
  // A fourth neighbor is an intentionally rare junction, never the default repair.
  if (config.paths.loop && fourWay) {
    const junction = rank.find(
      (edge) =>
        !selected.has(edge) &&
        [degree.get(edge.a.id)!, degree.get(edge.b.id)!].includes(3) &&
        Math.min(degree.get(edge.a.id)!, degree.get(edge.b.id)!) <= 2 &&
        canConnect(edge),
    );
    if (junction) connect(junction);
  }
  for (const edge of selected) permittedContacts.add(pair(edge.a.id, edge.b.id));
  const protect = (region: Region, id: string) => {
    region.protected.add(id);
    // Keep a small two-dimensional backing patch without pinning entire long interfaces.
    const backing = map.get(id)!.neighbors.filter((next) => region.ids.has(next));
    backing.sort(
      (a, b) =>
        compareMetric(
          distance(map.get(a)!.center, region.point),
          distance(map.get(b)!.center, region.point),
        ) || compareText(a, b),
    );
    for (const next of backing.slice(0, 2)) region.protected.add(next);
  };
  for (const contact of selected) {
    const midpoint = {
      x: contact.pairs.reduce((sum, [id]) => sum + map.get(id)!.center.x, 0) / contact.pairs.length,
      y: contact.pairs.reduce((sum, [id]) => sum + map.get(id)!.center.y, 0) / contact.pairs.length,
    };
    const exposure = (ids: [string, string]) =>
      ids.reduce(
        (sum, id) =>
          sum +
          map.get(id)!.neighbors.filter((next) => {
            const other = occupied.get(next);
            return other && other !== contact.a && other !== contact.b;
          }).length,
        0,
      );
    const pairs = [...contact.pairs].sort(
      (a, b) =>
        exposure(a) - exposure(b) ||
        compareMetric(
          distance(map.get(a[0])!.center, midpoint),
          distance(map.get(b[0])!.center, midpoint),
        ) ||
        compareText(pair(...a), pair(...b)),
    );
    const [first, second] = pairs[0]!;
    protect(occupied.get(first)!, first);
    protect(occupied.get(second)!, second);
  }
  const connected = (ids: Set<string>) => {
    const first = ids.values().next().value;
    if (!first) return false;
    const reached = new Set([first]),
      queue = [first];
    for (let i = 0; i < queue.length; i++)
      for (const next of map.get(queue[i]!)!.neighbors)
        if (ids.has(next) && !reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
    return reached.size === ids.size;
  };
  // Contacts outside the chosen graph must become visible landscape gaps. Protecting a
  // spanning tree alone leaves all Voronoi contacts in place and produces dense clusters.
  const forbidden = (id: string, region: Region) =>
    map.get(id)!.neighbors.some((next) => {
      const other = occupied.get(next);
      return other && other !== region && !permittedContacts.has(pair(region.id, other.id));
    });
  for (let round = 0; round < cells.length; round++) {
    const candidates = regions
      .flatMap((region) =>
        [...region.ids]
          .filter((id) => !region.protected.has(id) && forbidden(id, region))
          .map((id) => ({ region, id })),
      )
      .sort(
        (a, b) =>
          map.get(a.id)!.neighbors.filter((id) => a.region.ids.has(id)).length -
            map.get(b.id)!.neighbors.filter((id) => b.region.ids.has(id)).length ||
          compareMetric(
            distance(map.get(b.id)!.center, b.region.point),
            distance(map.get(a.id)!.center, a.region.point),
          ) ||
          compareText(a.id, b.id),
      );
    let removed = false;
    for (const { region, id } of candidates) {
      const area = cellSurfaceArea(map.get(id)!);
      if (region.area - area < MIN_FIELD_AREA - 1e-10) continue;
      region.ids.delete(id);
      if (!connected(region.ids)) {
        region.ids.add(id);
        continue;
      }
      occupied.delete(id);
      region.area -= area;
      removed = true;
    }
    if (!removed) break;
  }
  if (regions.some((region) => [...region.ids].some((id) => forbidden(id, region)))) return null;
  const perimeter = (cell: TileCell) =>
    cell.polygon.reduce(
      (sum, a, index) => sum + distance(a, cell.polygon[(index + 1) % cell.polygon.length]!),
      0,
    );
  const cellPerimeters = new Map(cells.map((cell) => [cell.id, perimeter(cell)]));
  const sharedCache = new Map<string, number>();
  const shared = (a: string, b: string) => {
    const key = pair(a, b);
    let value = sharedCache.get(key);
    if (value === undefined) {
      value = sharedBoundaryLength(map.get(a)!.polygon, map.get(b)!.polygon);
      sharedCache.set(key, value);
    }
    return value;
  };
  for (const region of regions) {
    for (let round = 0; round < cells.length; round++) {
      let border = 0;
      for (const id of region.ids) {
        border += cellPerimeters.get(id)!;
        for (const next of map.get(id)!.neighbors)
          if (region.ids.has(next)) border -= shared(id, next);
      }
      const candidates = [...region.ids]
        .filter(
          (id) =>
            !region.protected.has(id) &&
            map.get(id)!.neighbors.some((next) => !region.ids.has(next)),
        )
        .map((id) => {
          let ownShared = 0;
          for (const next of map.get(id)!.neighbors)
            if (region.ids.has(next)) ownShared += shared(id, next);
          const area = cellSurfaceArea(map.get(id)!);
          const nextBorder = border - cellPerimeters.get(id)! + 2 * ownShared;
          return {
            id,
            area,
            compactness: (nextBorder * nextBorder) / (4 * Math.PI * (region.area - area)),
            score:
              nextBorder / Math.sqrt(region.area - area) -
              distance(map.get(id)!.center, region.point) * 0.2,
          };
        })
        .sort((a, b) => compareMetric(a.score, b.score) || compareText(a.id, b.id));
      let removed = false;
      for (const candidate of candidates) {
        if (region.area - candidate.area + 1e-10 < region.target) continue;
        const currentCompactness = (border * border) / (4 * Math.PI * region.area);
        if (candidate.compactness > 3.15 && candidate.compactness > currentCompactness - 1e-8)
          continue;
        const neighbors = map.get(candidate.id)!.neighbors.filter((id) => region.ids.has(id));
        const supported = neighbors.filter((id) =>
          cellHasBody(id, region.ids, map, config.grid.kind),
        );
        region.ids.delete(candidate.id);
        if (
          !connected(region.ids) ||
          supported.some(
            (id) => !map.get(id)!.reserved && !cellHasBody(id, region.ids, map, config.grid.kind),
          )
        ) {
          region.ids.add(candidate.id);
          continue;
        }
        region.area -= candidate.area;
        occupied.delete(candidate.id);
        removed = true;
        break;
      }
      if (!removed) break;
    }
  }
  // Repair isolated narrow tips with neighboring ground, instead of accepting thin connections.
  for (const region of regions) {
    for (let round = 0; round < cells.length; round++) {
      const weak = [...region.ids].filter(
        (id) => !map.get(id)!.reserved && !cellHasBody(id, region.ids, map, config.grid.kind),
      );
      let changed = false;
      for (const id of weak) {
        const options = map
          .get(id)!
          .neighbors.filter((next) => claimable(next, region))
          .sort(
            (a, b) =>
              compareMetric(
                distance(map.get(a)!.center, region.point),
                distance(map.get(b)!.center, region.point),
              ) || compareText(a, b),
          );
        const next = options.find((next) => {
          region.ids.add(next);
          const improves =
            cellHasBody(id, region.ids, map, config.grid.kind) &&
            cellHasBody(next, region.ids, map, config.grid.kind);
          region.ids.delete(next);
          return improves;
        });
        if (next) {
          region.ids.add(next);
          region.area += cellSurfaceArea(map.get(next)!);
          occupied.set(next, region);
          changed = true;
        }
      }
      if (!changed) break;
    }
    if (longestThinChain(region.ids, map, config.grid.kind) > 2) return null;
    // One interior hub must reach all six mouths; larger layouts keep the stricter blob bound.
    if (
      count > 1 &&
      clusterCompactness(region.ids, map) > (config.grid.kind === 'hex' ? 3.45 : 4.4)
    )
      return null;
  }
  return regions;
}

/** Isolated raster corners are normal; a chain of unsupported cells is a narrow corridor. */
export function longestThinChain(
  ids: ReadonlySet<string>,
  cells: ReadonlyMap<string, TileCell>,
  kind: TileConfig['grid']['kind'],
): number {
  const pending = new Set(
    [...ids].filter((id) => !cells.get(id)!.reserved && !cellHasBody(id, ids, cells, kind)),
  );
  let longest = 0;
  while (pending.size) {
    const first = pending.values().next().value!,
      queue = [first];
    pending.delete(first);
    for (let index = 0; index < queue.length; index++)
      for (const next of cells.get(queue[index]!)!.neighbors)
        if (pending.delete(next)) queue.push(next);
    longest = Math.max(longest, queue.length);
  }
  return longest;
}
