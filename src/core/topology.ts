import { boundaryCells, centroid, hexagon, isConnectedSelection } from './geometry';
import { centralSideCells } from './center-sides';
import {
  clusterCompactness,
  compactCandidate,
  fieldAnchor,
  fieldArea,
  MIN_FIELD_AREA,
} from './fields';
import type { FieldCluster } from './fields';
import { buildPathNetwork, selectBranchAnchors } from './path-network';
import { organicTopologyAttempt } from './organic-topology';
import { organicTopologyAttempt as v14TopologyAttempt } from './legacy-organic-topology';
import { randomAt } from './random';
import type { Entrance, Point, TileCell, TileConfig } from './types';

interface Node {
  id: string;
  base: string;
  point: Point;
  entrySide?: number;
  group: FieldCluster;
}
const pair = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
function lineDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    d2 = dx * dx + dy * dy;
  const t = d2 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / d2)) : 0;
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}
function routeGuideDistance(point: Point, a: Point, b: Point, seed: string): number {
  const from = a.x < b.x || (a.x === b.x && a.y <= b.y) ? a : b;
  const to = from === a ? b : a;
  const dx = to.x - from.x,
    dy = to.y - from.y,
    length = Math.hypot(dx, dy) || 1,
    bend =
      (randomAt(
        seed,
        'topology-v13-route-bend',
        from.x.toFixed(3),
        from.y.toFixed(3),
        to.x.toFixed(3),
        to.y.toFixed(3),
      ) -
        0.5) *
      Math.min(0.52, length * 0.34),
    control = {
      x: (from.x + to.x) / 2 - (dy / length) * bend,
      y: (from.y + to.y) / 2 + (dx / length) * bend,
    };
  return Math.min(lineDistance(point, from, control), lineDistance(point, control, to));
}
interface QueueEntry {
  id: string;
  cost: number;
}
class MinQueue {
  private values: QueueEntry[] = [];
  get size(): number {
    return this.values.length;
  }
  push(entry: QueueEntry): void {
    let index = this.values.push(entry) - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2),
        previous = this.values[parent]!;
      if (previous.cost < entry.cost || (previous.cost === entry.cost && previous.id <= entry.id))
        break;
      this.values[index] = previous;
      index = parent;
    }
    this.values[index] = entry;
  }
  pop(): QueueEntry | undefined {
    const first = this.values[0],
      last = this.values.pop();
    if (!this.values.length || !last) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1,
        right = left + 1;
      if (left >= this.values.length) break;
      let child = left;
      if (
        right < this.values.length &&
        (this.values[right]!.cost < this.values[left]!.cost ||
          (this.values[right]!.cost === this.values[left]!.cost &&
            this.values[right]!.id < this.values[left]!.id))
      )
        child = right;
      if (
        last.cost < this.values[child]!.cost ||
        (last.cost === this.values[child]!.cost && last.id <= this.values[child]!.id)
      )
        break;
      this.values[index] = this.values[child]!;
      index = child;
    }
    this.values[index] = last;
    return first;
  }
}
function route(
  starts: Iterable<string>,
  goals: Set<string>,
  cells: Map<string, TileCell>,
  permitted: (id: string) => boolean,
  a: Point,
  b: Point,
  seed: string,
): string[] {
  const costs = new Map<string, number>(),
    previous = new Map<string, string>(),
    open = new MinQueue();
  for (const id of [...starts].sort()) {
    costs.set(id, 0);
    open.push({ id, cost: 0 });
  }
  while (open.size) {
    const currentEntry = open.pop()!,
      best = currentEntry.cost;
    let current = currentEntry.id;
    if (best !== costs.get(current)) continue;
    if (goals.has(current)) {
      const result = [current];
      while (previous.has(current)) {
        current = previous.get(current)!;
        result.push(current);
      }
      return result.reverse();
    }
    for (const id of cells.get(current)!.neighbors) {
      if (!goals.has(id) && !permitted(id)) continue;
      const cell = cells.get(id)!,
        next =
          best +
          1 +
          routeGuideDistance(cell.center, a, b, seed) * 8 +
          Math.abs(cell.baseHeight - cells.get(current)!.baseHeight) * 2 +
          randomAt(seed, 'topology-v13-route-variation', id) * 0.3;
      if (next < (costs.get(id) ?? Infinity)) {
        costs.set(id, next);
        previous.set(id, current);
        open.push({ id, cost: next });
      }
    }
  }
  return [];
}
function components(ids: Set<string>, cells: Map<string, TileCell>): Set<string>[] {
  const pending = new Set(ids),
    output: Set<string>[] = [];
  while (pending.size) {
    const first = pending.values().next().value! as string,
      queue = [first],
      part = new Set(queue);
    pending.delete(first);
    for (let i = 0; i < queue.length; i++)
      for (const next of cells.get(queue[i]!)!.neighbors)
        if (pending.delete(next)) {
          part.add(next);
          queue.push(next);
        }
    output.push(part);
  }
  return output;
}

/** Grow compact field clusters first, then link the rim and selected center portals. */
function topologyAttempt(
  config: TileConfig,
  cells: TileCell[],
  entrances: Entrance[],
  centerPolygon: Point[],
  manual: FieldCluster[],
): { clusters: FieldCluster[]; warnings: string[] } {
  const warnings: string[] = [],
    target = config.paths.fieldCount - 1,
    map = new Map(cells.map((cell) => [cell.id, cell]));
  if (manual.length >= target) {
    if (manual.length > target)
      warnings.push(
        `Gewünscht sind ${config.paths.fieldCount} Felder; die manuelle Belegung enthält bereits ${manual.length + 1}.`,
      );
    return { clusters: manual, warnings };
  }
  const clusters = [...manual],
    occupied = new Map<string, string>();
  manual.forEach((group) => group.ids.forEach((id) => occupied.set(id, group.id)));
  const reservedIds = new Set(['center', ...manual.map((group) => group.id)]);
  const allocate = (base: string): string => {
    let id = base,
      n = 1;
    while (reservedIds.has(id)) id = `${base}:generated:${n++}`;
    reservedIds.add(id);
    return id;
  };
  const center = centroid(centerPolygon),
    boundary = hexagon(),
    mouths = Array.from({ length: 6 }, (_, side) =>
      entrances.find((entrance) => entrance.side === side),
    ),
    outer = new Set(
      Array.from({ length: 6 }, (_, side) => boundaryCells(cells, side)).flatMap((list) =>
        list.map((cell) => cell.id),
      ),
    ),
    blockedSites = new Set([
      ...manual.flatMap((group) => [...group.ids]),
      ...entrances.flatMap((entrance) => entrance.footprintCellIds),
    ]),
    sitePool = cells.filter(
      (cell) =>
        cell.surfacePolygons.length > 0 &&
        !cell.landscapeOnly &&
        !outer.has(cell.id) &&
        !blockedSites.has(cell.id) &&
        Math.min(
          ...boundary.map((point, side) =>
            lineDistance(cell.center, point, boundary[(side + 1) % boundary.length]!),
          ),
        ) >= 0.12,
    ),
    anchors = selectBranchAnchors(config.seed, sitePool, Math.max(0, target - 6));
  // Keep V12's generated IDs so metadata-only edits remain attached after migration.
  const legacyEnds = Array.from(
      { length: 6 },
      (_, side) =>
        mouths[side]?.center ?? {
          x: (boundary[side]!.x + boundary[(side + 1) % 6]!.x) / 2,
          y: (boundary[side]!.y + boundary[(side + 1) % 6]!.y) / 2,
        },
    ),
    legacyCounts = Array.from({ length: 6 }, () => 1),
    legacyLengths = legacyEnds.map((end) => distance(end, center));
  for (let index = 6; index < target; index++) {
    let lane = 0;
    for (let candidate = 1; candidate < 6; candidate++)
      if (
        legacyLengths[candidate]! / (legacyCounts[candidate]! + 0.4) >
        legacyLengths[lane]! / (legacyCounts[lane]! + 0.4)
      )
        lane = candidate;
    legacyCounts[lane]++;
  }
  const legacyInteriorIds = legacyCounts.flatMap((count, lane) =>
    Array.from({ length: count - 1 }, (_, step) => `auto:lane:${lane}:${step}`),
  );
  const entryNodes: Node[] = Array.from({ length: 6 }, (_, side) => {
      const entry = mouths[side],
        point = entry?.center ?? {
          x: (boundary[side]!.x + boundary[(side + 1) % 6]!.x) / 2,
          y: (boundary[side]!.y + boundary[(side + 1) % 6]!.y) / 2,
        },
        base = `auto:entrance:${side}`;
      return {
        base,
        id: base,
        point,
        entrySide: side,
        group: { id: base, ids: new Set(), locked: false },
      };
    }),
    nodes: Node[] = [
      ...entryNodes,
      ...anchors.map((cell, index): Node => {
        const base = legacyInteriorIds[index] ?? `auto:branch:${index}`;
        return {
          base,
          id: base,
          point: cell.center,
          group: { id: base, ids: new Set(), locked: false },
        };
      }),
    ];
  const assigned = new Set<Node>();
  for (const group of manual) {
    const entry = entrances.find((entrance) =>
      entrance.footprintCellIds.every((id) => group.ids.has(id)),
    );
    const options = nodes.filter((node) => !assigned.has(node));
    const preferred = entry
      ? entryNodes[entry.side]
      : options.find((node) => node.base === group.id);
    const node =
      preferred && !assigned.has(preferred)
        ? preferred
        : options.sort(
            (a, b) =>
              distance(a.point, fieldAnchor(group.ids, map)) -
              distance(b.point, fieldAnchor(group.ids, map)),
          )[0]!;
    node.id = group.id;
    node.group = group;
    if (node.entrySide === undefined) node.point = fieldAnchor(group.ids, map);
    assigned.add(node);
  }
  for (const node of nodes)
    if (!assigned.has(node)) {
      node.id = allocate(node.base);
      node.group = { id: node.id, ids: new Set(), locked: false };
      clusters.push(node.group);
    }
  const allowed = new Set<string>(),
    required: { a: Node; b: Node }[] = [];
  const allow = (a: Node, b: Node, connect = false): void => {
    if (a.id === b.id) return;
    allowed.add(pair(a.id, b.id));
    if (connect) required.push({ a, b });
  };
  for (const entrance of entrances) {
    const node = entryNodes[entrance.side]!;
    for (const id of entrance.footprintCellIds) {
      const owner = occupied.get(id);
      if (!owner && !node.group.locked) {
        node.group.ids.add(id);
        occupied.set(id, node.id);
      }
    }
    if (entrance.footprintCellIds.every((id) => occupied.get(id) === node.id))
      node.group.fixed = true;
  }
  const roots = entryNodes,
    sideCells = centralSideCells(cells, centerPolygon),
    usedRoots = new Set<Node>(),
    portalRoots = nodes.filter((node) => node.entrySide === undefined);
  const angularCost = (root: Node, side: number): number => {
    const a = centerPolygon[side]!,
      b = centerPolygon[(side + 1) % 5]!,
      x = (a.x + b.x) / 2 - center.x,
      y = (a.y + b.y) / 2 - center.y;
    const rx = root.point.x - center.x,
      ry = root.point.y - center.y;
    const angular = 1 - (x * rx + y * ry) / (Math.hypot(x, y) * Math.hypot(rx, ry));
    return distance(root.point, { x: x + center.x, y: y + center.y }) * 0.7 + angular * 0.18;
  };
  const ownedSides = sideCells
    .map((ids, side) => ({ ids, side }))
    .filter((item) => item.ids.size > 0 && [...item.ids].every((id) => occupied.has(id)))
    .map((item) => item.side);
  const freeRoots = (portalRoots.length ? portalRoots : nodes).filter(
      (root) => !root.group.locked && !root.group.fixed,
    ),
    candidates = sideCells
      .map((ids, side) => ({ ids, side }))
      .filter((item) => item.ids.size > 0 && !ownedSides.includes(item.side))
      .sort(
        (a, b) =>
          randomAt(config.seed, 'topology-v10.1-center-side', a.side) -
            randomAt(config.seed, 'topology-v10.1-center-side', b.side) || a.side - b.side,
      ),
    desiredPortals = 2 + Math.floor(randomAt(config.seed, 'topology-v10.1-center-count') * 3),
    unownedSides = candidates
      .slice(0, Math.min(Math.max(0, desiredPortals - ownedSides.length), freeRoots.length))
      .map((item) => item.side),
    selectedSides = new Set([...ownedSides, ...unownedSides]),
    portAssignments = new Map<number, Node>();
  if (unownedSides.length) {
    let best = Infinity,
      bestNodes: Node[] = [];
    const assign = (at: number, chosen: Node[], score: number): void => {
      if (score >= best) return;
      if (at === unownedSides.length) {
        best = score;
        bestNodes = [...chosen];
        return;
      }
      for (const root of freeRoots)
        if (!chosen.includes(root))
          assign(at + 1, [...chosen, root], score + angularCost(root, unownedSides[at]!));
    };
    assign(0, [], 0);
    unownedSides.forEach((side, index) => portAssignments.set(side, bestNodes[index]!));
  }
  sideCells.forEach((ids, side) => {
    if (!selectedSides.has(side) || [...ids].every((id) => occupied.has(id))) return;

    const availableRoots = portalRoots.length ? portalRoots : nodes,
      candidates = availableRoots.filter(
        (root) => !root.group.locked && !root.group.fixed && !usedRoots.has(root),
      );
    const pool = candidates.length
      ? candidates
      : availableRoots.filter((root) => !root.group.locked && !root.group.fixed);
    const root =
      portAssignments.get(side) ??
      pool.sort((a, b) => angularCost(a, side) - angularCost(b, side))[0];
    if (!root) {
      warnings.push(
        'Die manuelle Belegung lässt keine vollständige Anbindung einer Pentagonseite zu.',
      );
      return;
    }
    usedRoots.add(root);
    ids.forEach((id) => {
      if (!occupied.has(id) && !root.group.fixed && !root.group.locked) {
        root.group.ids.add(id);
        occupied.set(id, root.id);
      }
    });
  });
  for (const entrance of entrances) {
    const node = entryNodes[entrance.side]!;
    entrance.cellIds.forEach((id) => {
      const owner = occupied.get(id);
      if (!owner) {
        if (!node.group.locked) {
          node.group.ids.add(id);
          occupied.set(id, node.id);
        }
      } else if (owner !== node.id) allowed.add(pair(owner, node.id));
    });
  }
  // Whole central sides necessarily meet at their outer corner fragments: these are explicit junctions.
  for (const cell of cells)
    if (cell.reserved && occupied.has(cell.id))
      for (const neighbor of cell.neighbors) {
        const other = map.get(neighbor)!;
        if (
          other.reserved &&
          occupied.has(neighbor) &&
          occupied.get(cell.id) !== occupied.get(neighbor)
        )
          allowed.add(pair(occupied.get(cell.id)!, occupied.get(neighbor)!));
      }
  const portalOwners = new Set(
    sideCells
      .flatMap((side) => [...side].map((id) => occupied.get(id)))
      .filter((id): id is string => id !== undefined),
  );
  const primaryPortal = [...portalOwners].sort(
    (a, b) =>
      distance(nodes.find((node) => node.id === a)!.point, center) -
        distance(nodes.find((node) => node.id === b)!.point, center) || compareText(a, b),
  )[0];
  const networkLinks = buildPathNetwork(
    config.seed,
    nodes.map((node) => ({ id: node.id, point: node.point })),
    primaryPortal ? [primaryPortal] : [],
    config.paths.loop,
    entryNodes.map((node) => node.id),
  );
  for (const link of networkLinks) {
    const from = nodes.find((node) => node.id === link.from),
      to = nodes.find((node) => node.id === link.to);
    if (from && to) allow(from, to, true);
  }
  const canClaim = (node: Node, id: string, allowNaturalContacts = false): boolean => {
    const cell = map.get(id)!;
    if (!cell.surfacePolygons.length || cell.landscapeOnly) return false;
    const owner = occupied.get(id);
    if (owner) return owner === node.id;
    if (node.group.locked || node.group.fixed) return false;
    if (outer.has(id) || cell.entranceSide !== undefined) return false;
    // Let compact cores meet naturally; restricting core growth to planned tree edges
    // produced narrow single-cell connectors and blocked dense but valid layouts.
    return (
      allowNaturalContacts ||
      cell.neighbors.every((next) => {
        const other = occupied.get(next);
        return !other || other === node.id || allowed.has(pair(node.id, other));
      })
    );
  };
  const claim = (node: Node, ids: Iterable<string>): void => {
    for (const id of ids)
      if (!occupied.has(id) && !node.group.fixed && !node.group.locked) {
        node.group.ids.add(id);
        occupied.set(id, node.id);
      }
  };
  const autoCount = Math.max(1, target - manual.length),
    compactTarget = Math.max(
      MIN_FIELD_AREA,
      Math.min(
        0.11,
        fieldArea(
          cells.map((cell) => cell.id),
          map,
        ) /
          (autoCount * 1.8),
      ),
    );
  const growCompactGroups = (minimumArea = MIN_FIELD_AREA, allowNaturalContacts = false): void => {
    for (let round = 0; round < cells.length; round++) {
      let progress = false;
      for (const node of nodes)
        if (
          !node.group.locked &&
          !node.group.fixed &&
          node.group.ids.size &&
          fieldArea(node.group.ids, map) + 1e-10 < minimumArea
        ) {
          const candidate = compactCandidate(node.group, occupied, map, config.seed, (id) =>
            canClaim(node, id, allowNaturalContacts),
          );
          if (candidate) {
            claim(node, [candidate]);
            progress = true;
          }
        }
      if (!progress) break;
    }
  };
  for (const node of nodes)
    if (!node.group.ids.size && !node.group.locked) {
      const candidate = cells
        .filter((cell) => canClaim(node, cell.id, target > 13))
        .sort(
          (a, b) =>
            distance(a.center, node.point) - distance(b.center, node.point) ||
            (a.id < b.id ? -1 : 1),
        )[0];
      if (candidate) claim(node, [candidate.id]);
    }
  // Grow actual area cores before routing so roads cannot become the field's only thin body.
  growCompactGroups(compactTarget, target > 13);
  for (const node of nodes)
    if (!node.group.locked && node.group.ids.size) {
      for (let i = 0; i < cells.length; i++) {
        const parts = components(node.group.ids, map);
        if (parts.length < 2) break;
        const path = route(
          parts[0]!,
          parts[1]!,
          map,
          (id) => canClaim(node, id),
          fieldAnchor(parts[0]!, map),
          fieldAnchor(parts[1]!, map),
          config.seed,
        );
        if (!path.length) break;
        claim(node, path);
      }
    }
  const adjacent = (a: Node, b: Node): boolean =>
    [...a.group.ids].some((id) => map.get(id)!.neighbors.some((next) => b.group.ids.has(next)));
  const connect = (a: Node, b: Node): boolean => {
    if (adjacent(a, b)) return true;
    if (!a.group.ids.size || !b.group.ids.size) return false;
    const free = (id: string) => {
      const owner = occupied.get(id);
      return owner === a.id || owner === b.id || (!owner && (canClaim(a, id) || canClaim(b, id)));
    };
    let path = route(a.group.ids, b.group.ids, map, free, a.point, b.point, config.seed);
    let candidates: number[] = [];
    const findPivots = () => {
      const middle = path.filter((id) => !occupied.has(id));
      candidates = [];
      for (let pivot = 0; pivot <= middle.length; pivot++)
        if (middle.every((id, i) => canClaim(i < pivot ? a : b, id))) candidates.push(pivot);
      return middle;
    };
    let middle = findPivots();
    if (!candidates.length) {
      path = route(
        a.group.ids,
        b.group.ids,
        map,
        (id) => canClaim(a, id) || b.group.ids.has(id),
        a.point,
        b.point,
        config.seed,
      );
      middle = findPivots();
    }
    if (!candidates.length) {
      path = route(
        a.group.ids,
        b.group.ids,
        map,
        (id) => canClaim(b, id) || a.group.ids.has(id),
        a.point,
        b.point,
        config.seed,
      );
      middle = findPivots();
    }
    if (path.length && candidates.length) {
      const pivotScore = (pivot: number): number => {
        const first = new Set([...a.group.ids, ...middle.slice(0, pivot)]),
          second = new Set([...b.group.ids, ...middle.slice(pivot)]),
          compactness = Math.max(clusterCompactness(first, map), clusterCompactness(second, map));
        return compactness + Math.abs(pivot - middle.length / 2) * 1e-4;
      };
      const pivot = candidates.sort((x, y) => pivotScore(x) - pivotScore(y))[0]!;
      middle.forEach((id, i) => claim(i < pivot ? a : b, [id]));
    }
    return adjacent(a, b);
  };
  for (const { a, b } of required) connect(a, b);
  growCompactGroups();
  // A dense layout may need an explicit local cross-junction rather than losing a whole field.
  const actualNeighbors = (owner: string): Set<string> =>
    new Set(
      nodes
        .filter((node) => node.id === owner)
        .flatMap((node) =>
          [...node.group.ids].flatMap((id) =>
            map.get(id)!.neighbors.map((next) => occupied.get(next)),
          ),
        )
        .filter((id): id is string => id !== undefined && id !== owner),
    );
  const contactChanges = (node: Node, id: string): string[] | null => {
    const cell = map.get(id)!;
    if (
      occupied.has(id) ||
      outer.has(id) ||
      cell.entranceSide !== undefined ||
      !cell.surfacePolygons.length ||
      cell.landscapeOnly
    )
      return null;
    const changes = [
      ...new Set(
        cell.neighbors
          .map((next) => occupied.get(next))
          .filter(
            (owner) =>
              owner !== undefined && owner !== node.id && !allowed.has(pair(node.id, owner)),
          ),
      ),
    ] as string[];
    const own = actualNeighbors(node.id),
      cap = roots.includes(node) ? 5 : 4;
    if (new Set([...own, ...changes]).size > cap) return null;
    for (const owner of changes) {
      const other = nodes.find((candidate) => candidate.id === owner)!;
      if (actualNeighbors(owner).size >= (roots.includes(other) ? 5 : 4)) return null;
    }
    return changes;
  };
  for (let round = 0; round < cells.length; round++) {
    let progress = false;
    for (const node of nodes)
      if (
        !node.group.locked &&
        node.group.ids.size &&
        fieldArea(node.group.ids, map) + 1e-10 < MIN_FIELD_AREA
      ) {
        const next = compactCandidate(
          node.group,
          occupied,
          map,
          config.seed,
          (id) => contactChanges(node, id) !== null,
        );
        if (next) {
          contactChanges(node, next)!.forEach((owner) => allowed.add(pair(node.id, owner)));
          claim(node, [next]);
          progress = true;
        }
      }
    if (!progress) break;
  }
  // Borrow a safe neighboring raster piece if a center portal still falls short of its area.
  const protectedIds = new Set([
    ...sideCells.flatMap((side) => [...side]),
    ...entrances.flatMap((entrance) => entrance.cellIds),
  ]);
  for (let round = 0; round < cells.length; round++) {
    let progress = false;
    for (const node of nodes)
      if (
        !node.group.locked &&
        node.group.ids.size &&
        fieldArea(node.group.ids, map) + 1e-10 < MIN_FIELD_AREA
      ) {
        const candidates = [
          ...new Set([...node.group.ids].flatMap((id) => map.get(id)!.neighbors)),
        ].filter((id) => {
          const owner = occupied.get(id);
          if (
            !owner ||
            owner === node.id ||
            protectedIds.has(id) ||
            map.get(id)!.entranceSide !== undefined
          )
            return false;
          const donor = nodes.find((other) => other.id === owner);
          if (!donor || donor.group.locked || donor.group.fixed) return false;
          if (
            !isConnectedSelection(
              [...donor.group.ids].filter((other) => other !== id),
              cells,
            )
          )
            return false;
          return map.get(id)!.neighbors.every((next) => {
            const owner = occupied.get(next);
            return !owner || owner === node.id || allowed.has(pair(node.id, owner));
          });
        });
        for (const id of candidates) {
          const donor = nodes.find((other) => other.id === occupied.get(id))!,
            pieceArea = fieldArea([id], map);
          for (
            let grow = 0;
            grow < cells.length &&
            fieldArea(donor.group.ids, map) - pieceArea + 1e-10 < MIN_FIELD_AREA;
            grow++
          ) {
            const next = compactCandidate(
              donor.group,
              occupied,
              map,
              config.seed,
              (candidate) =>
                canClaim(donor, candidate) &&
                map
                  .get(candidate)!
                  .neighbors.some((neighbor) => neighbor !== id && donor.group.ids.has(neighbor)),
            );
            if (!next) break;
            claim(donor, [next]);
          }
          if (
            fieldArea(donor.group.ids, map) - pieceArea + 1e-10 < MIN_FIELD_AREA ||
            !isConnectedSelection(
              [...donor.group.ids].filter((other) => other !== id),
              cells,
            )
          )
            continue;
          donor.group.ids.delete(id);
          node.group.ids.add(id);
          occupied.set(id, node.id);
          progress = true;
          break;
        }
      }
    if (!progress) break;
  }
  // Coarse lattices can block a planned branch; reroute it to a reachable junction.
  for (let round = 0; round < nodes.length; round++) {
    const reached = new Set<string>();
    sideCells.forEach((side) =>
      side.forEach((id) => {
        const owner = occupied.get(id);
        if (owner) reached.add(owner);
      }),
    );
    const queue = [...reached];
    for (let i = 0; i < queue.length; i++) {
      const group = clusters.find((candidate) => candidate.id === queue[i]);
      if (!group) continue;
      for (const id of group.ids)
        for (const next of map.get(id)!.neighbors) {
          const owner = occupied.get(next);
          if (owner && !reached.has(owner)) {
            reached.add(owner);
            queue.push(owner);
          }
        }
    }
    const disconnected = nodes.filter((node) => !reached.has(node.id));
    if (!disconnected.length) break;
    const options = disconnected
      .flatMap((a) => nodes.filter((b) => reached.has(b.id)).map((b) => ({ a, b })))
      .sort((x, y) => distance(x.a.point, x.b.point) - distance(y.a.point, y.b.point));
    let repaired = false;
    for (const { a, b } of options) {
      const key = pair(a.id, b.id),
        existing = allowed.has(key);
      allowed.add(key);
      if (connect(a, b)) {
        repaired = true;
        break;
      }
      if (!existing) allowed.delete(key);
    }
    if (!repaired) {
      warnings.push(
        `Die gewünschte Feldzahl ${config.paths.fieldCount} lässt sich hier nicht mit einem vollständig verbundenen Weggraphen anordnen.`,
      );
      break;
    }
  }
  // Preserve every valid node; report geometric impossibility instead of returning undersized pretend fields.
  for (const node of nodes)
    if (
      !node.group.locked &&
      (fieldArea(node.group.ids, map) + 1e-10 < MIN_FIELD_AREA ||
        !isConnectedSelection([...node.group.ids], cells))
    ) {
      const neighbors = nodes
        .filter(
          (other) =>
            other !== node &&
            clusters.includes(other.group) &&
            !other.group.locked &&
            !other.group.fixed &&
            adjacent(node, other) &&
            fieldArea(other.group.ids, map) >= MIN_FIELD_AREA,
        )
        .sort((a, b) => distance(a.point, node.point) - distance(b.point, node.point));
      const into = neighbors[0];
      if (into) {
        node.group.ids.forEach((id) => {
          into.group.ids.add(id);
          occupied.set(id, into.id);
        });
      } else node.group.ids.forEach((id) => occupied.delete(id));
      clusters.splice(clusters.indexOf(node.group), 1);
    }
  if (clusters.length !== target)
    warnings.push(
      `Die gewünschte Gesamtzahl ${config.paths.fieldCount} ist mit diesem Raster, der Pentagonposition und der Mindestfläche nicht erreichbar; erzeugt wurden ${clusters.length + 1} Felder.`,
    );
  return { clusters, warnings };
}

function validLayout(
  clusters: FieldCluster[],
  cells: TileCell[],
  entrances: Entrance[],
  centerPolygon: Point[],
): boolean {
  const map = new Map(cells.map((cell) => [cell.id, cell])),
    owners = new Map<string, string>();
  for (const group of clusters) {
    if (
      fieldArea(group.ids, map) + 1e-10 < MIN_FIELD_AREA ||
      !isConnectedSelection([...group.ids], cells)
    )
      return false;
    for (const id of group.ids) {
      if (owners.has(id)) return false;
      owners.set(id, group.id);
    }
  }
  for (const entrance of entrances) {
    const ids = new Set(entrance.cellIds.map((id) => owners.get(id)));
    if (ids.size !== 1 || ids.has(undefined)) return false;
    const contacts = new Set(
      boundaryCells(cells, entrance.side)
        .map((cell) => owners.get(cell.id))
        .filter((id) => id !== undefined),
    );
    if (contacts.size !== 1 || [...contacts][0] !== [...ids][0]) return false;
  }
  const touching = centralSideCells(cells, centerPolygon),
    reached = new Set<string>();
  for (const side of touching) {
    const ids = new Set([...side].map((id) => owners.get(id) ?? null));
    if (ids.size !== 1) return false;
    const id = [...ids][0];
    if (id) reached.add(id);
  }
  const queue = [...reached];
  for (let i = 0; i < queue.length; i++) {
    const group = clusters.find((candidate) => candidate.id === queue[i])!;
    for (const id of group.ids)
      for (const next of map.get(id)!.neighbors) {
        const owner = owners.get(next);
        if (owner && !reached.has(owner)) {
          reached.add(owner);
          queue.push(owner);
        }
      }
  }
  return reached.size === clusters.length;
}

/** Removes dispensable route tendrils while keeping every field and connection valid. */
function trimFieldTendrils(
  clusters: FieldCluster[],
  cells: TileCell[],
  entrances: Entrance[],
  centerPolygon: Point[],
): void {
  const map = new Map(cells.map((cell) => [cell.id, cell])),
    protectedIds = new Set([
      ...Array.from({ length: 6 }, (_, side) => boundaryCells(cells, side)).flatMap((side) =>
        side.map((cell) => cell.id),
      ),
      ...centralSideCells(cells, centerPolygon).flatMap((side) => [...side]),
      ...entrances.flatMap((entrance) => entrance.footprintCellIds),
    ]);
  for (const group of clusters) {
    if (group.locked || group.fixed) continue;
    for (let round = 0; round < group.ids.size; round++) {
      const current = clusterCompactness(group.ids, map);
      if (current <= 3.5) break;
      const anchor = fieldAnchor(group.ids, map);
      const candidates = [...group.ids]
        .filter((id) => !protectedIds.has(id))
        .map((id) => ({
          id,
          neighbors: map.get(id)!.neighbors.filter((next) => group.ids.has(next)).length,
          distance: Math.hypot(map.get(id)!.center.x - anchor.x, map.get(id)!.center.y - anchor.y),
        }))
        .sort(
          (a, b) => a.neighbors - b.neighbors || b.distance - a.distance || compareText(a.id, b.id),
        );
      let removed = false;
      for (const candidate of candidates) {
        group.ids.delete(candidate.id);
        const area = fieldArea(group.ids, map);
        if (area + 1e-10 < MIN_FIELD_AREA) {
          group.ids.add(candidate.id);
          continue;
        }
        const compactness = clusterCompactness(group.ids, map);
        if (
          compactness < current - 1e-8 &&
          isConnectedSelection([...group.ids], cells) &&
          validLayout(clusters, cells, entrances, centerPolygon)
        ) {
          removed = true;
          break;
        }
        group.ids.add(candidate.id);
      }
      if (!removed) break;
    }
  }
}

/** Keep hard geometry constraints even when a requested count cannot be embedded in this lattice. */
export function buildAutoTopology(
  config: TileConfig,
  cells: TileCell[],
  entrances: Entrance[],
  centerPolygon: Point[],
  manual: FieldCluster[],
): { clusters: FieldCluster[]; warnings: string[] } {
  if (!config.legacyLayout && manual.length === 0) {
    const counts = Array.from({ length: 17 }, (_, index) => index + 8).sort(
      (a, b) =>
        Math.abs(a - config.paths.fieldCount) - Math.abs(b - config.paths.fieldCount) || a - b,
    );
    for (const fieldCount of counts) {
      const candidate = { ...config, paths: { ...config.paths, fieldCount } };
      for (
        let attempt = 0;
        attempt < (fieldCount === config.paths.fieldCount ? (fieldCount >= 20 ? 20 : 8) : 2);
        attempt++
      ) {
        const clusters = (
          config.layoutVersion === 14 ? v14TopologyAttempt : organicTopologyAttempt
        )(candidate, cells, entrances, centerPolygon, attempt);
        if (!clusters || !validLayout(clusters, cells, entrances, centerPolygon)) continue;
        return {
          clusters,
          warnings:
            fieldCount === config.paths.fieldCount
              ? []
              : [
                  `Die gewünschte Gesamtzahl ${config.paths.fieldCount} ist bei diesem Raster und dieser Pentagonposition nicht als zusammenhängende flächige Felder möglich; erzeugt wurden ${fieldCount} Felder. ${config.paths.fieldCount === 7 ? 'Neben sechs festen Eingangsflächen und dem Pentagon wird mindestens ein inneres Verbindungsfeld benötigt; wähle mindestens acht Gesamtfelder.' : 'Wähle ein feineres Raster, eine andere Feldzahl oder eine andere Pentagonposition.'}`,
                ],
        };
      }
    }
    throw new Error(
      'Mit diesem Raster und dieser Pentagonposition ist keine gültige organische Feldanordnung möglich.',
    );
  }
  const first = topologyAttempt(config, cells, entrances, centerPolygon, manual);
  if (validLayout(first.clusters, cells, entrances, centerPolygon)) {
    trimFieldTendrils(first.clusters, cells, entrances, centerPolygon);
    return {
      ...first,
      warnings: first.warnings.filter(
        (warning) => !warning.includes('vollständig verbundenen Weggraphen'),
      ),
    };
  }
  const candidates = Array.from({ length: 18 }, (_, index) => index + 7)
    .filter((count) => count !== config.paths.fieldCount)
    .sort(
      (a, b) =>
        Math.abs(a - config.paths.fieldCount) - Math.abs(b - config.paths.fieldCount) || a - b,
    );
  for (const fieldCount of candidates) {
    const candidate = { ...config, paths: { ...config.paths, fieldCount } };
    const fallback = topologyAttempt(candidate, cells, entrances, centerPolygon, manual);
    if (validLayout(fallback.clusters, cells, entrances, centerPolygon)) {
      trimFieldTendrils(fallback.clusters, cells, entrances, centerPolygon);
      return {
        clusters: fallback.clusters,
        warnings: [
          `Die gewünschte Gesamtzahl ${config.paths.fieldCount} konnte mit diesem Raster und dieser Pentagonposition nicht gültig angeordnet werden; stattdessen sind ${fallback.clusters.length + 1} verbundene Felder möglich. ${config.paths.fieldCount === 7 ? 'Neben sechs festen Eingangsflächen und dem Pentagon wird mindestens ein inneres Verbindungsfeld benötigt; wähle mindestens acht Gesamtfelder.' : 'Wähle ein feineres Raster, eine andere Feldzahl oder eine andere Pentagonposition.'}`,
        ],
      };
    }
  }
  return {
    clusters: first.clusters,
    warnings: [
      ...first.warnings,
      'Mit dieser manuellen Belegung konnte keine gültige, vollständig verbundene Feldanordnung erzeugt werden.',
    ],
  };
}
