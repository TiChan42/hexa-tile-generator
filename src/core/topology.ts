import { boundaryCells, centroid, hexagon, isConnectedSelection } from './geometry';
import { centralSideCells } from './center-sides';
import { compactCandidate, fieldAnchor, fieldArea, MIN_FIELD_AREA } from './fields';
import type { FieldCluster } from './fields';
import { randomAt } from './random';
import type { Entrance, Point, TileCell, TileConfig } from './types';

interface Node {
  id: string;
  base: string;
  point: Point;
  lane: number;
  step: number;
  group: FieldCluster;
}
const pair = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
function lineDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    d2 = dx * dx + dy * dy;
  const t = d2 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / d2)) : 0;
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
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
  const open = new Set(starts),
    costs = new Map([...open].map((id) => [id, 0])),
    previous = new Map<string, string>();
  while (open.size) {
    let current = '',
      best = Infinity;
    for (const id of open) {
      const score = costs.get(id)!;
      if (score < best || (score === best && id < current)) {
        current = id;
        best = score;
      }
    }
    open.delete(current);
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
          lineDistance(cell.center, a, b) * 8 +
          Math.abs(cell.baseHeight - cells.get(current)!.baseHeight) * 2 +
          randomAt(seed, 'lane-route', id) * 0.15;
      if (next < (costs.get(id) ?? Infinity)) {
        costs.set(id, next);
        previous.set(id, current);
        open.add(id);
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

/** Embed an explicit radial lane graph; leave terrain buffers between unrelated fields. */
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
    );
  const ends = Array.from(
    { length: 6 },
    (_, side) =>
      mouths[side]?.center ?? {
        x: (boundary[side]!.x + boundary[(side + 1) % 6]!.x) / 2,
        y: (boundary[side]!.y + boundary[(side + 1) % 6]!.y) / 2,
      },
  );
  const counts = Array.from({ length: 6 }, () => 1),
    lengths = ends.map((end) => distance(end, center));
  for (let i = 6; i < target; i++) {
    let best = 0;
    for (let lane = 1; lane < 6; lane++)
      if (lengths[lane]! / (counts[lane]! + 0.4) > lengths[best]! / (counts[best]! + 0.4))
        best = lane;
    counts[best]++;
  }
  const nodes: Node[] = [],
    lanes: Node[][] = [];
  for (let lane = 0; lane < 6; lane++) {
    const end = ends[lane]!,
      d = lengths[lane]!,
      ux = (end.x - center.x) / d,
      uy = (end.y - center.y) / d,
      list: Node[] = [];
    for (let step = 0; step < counts[lane]!; step++) {
      const last = counts[lane]! - 1,
        inner = Math.min(0.23, d * 0.42),
        outer = Math.max(inner, d - 0.09),
        t = last ? step / last : 1;
      const point = {
        x: center.x + ux * (inner + (outer - inner) * t),
        y: center.y + uy * (inner + (outer - inner) * t),
      };
      const base = step === last ? `auto:entrance:${lane}` : `auto:lane:${lane}:${step}`;
      const node: Node = {
        base,
        id: base,
        point,
        lane,
        step,
        group: { id: base, ids: new Set(), locked: false },
      };
      nodes.push(node);
      list.push(node);
    }
    lanes.push(list);
  }
  const assigned = new Set<Node>();
  for (const group of manual) {
    const entry = entrances.find((entrance) => entrance.cellIds.every((id) => group.ids.has(id)));
    const options = nodes.filter((node) => !assigned.has(node));
    const preferred = entry
      ? lanes[entry.side]!.at(-1)
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
  lanes.forEach((lane) => {
    for (let i = 1; i < lane.length; i++) allow(lane[i - 1]!, lane[i]!, true);
  });
  for (const entrance of entrances) {
    const node = lanes[entrance.side]!.at(-1)!;
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
  const roots = lanes.map((lane) => lane[0]!),
    sideCells = centralSideCells(cells, centerPolygon),
    usedRoots = new Set<Node>();
  const angularCost = (root: Node, side: number): number => {
    const a = centerPolygon[side]!,
      b = centerPolygon[(side + 1) % 5]!,
      x = (a.x + b.x) / 2 - center.x,
      y = (a.y + b.y) / 2 - center.y;
    const rx = root.point.x - center.x,
      ry = root.point.y - center.y;
    return 1 - (x * rx + y * ry) / (Math.hypot(x, y) * Math.hypot(rx, ry));
  };
  const unownedSides = sideCells
    .map((ids, side) => ({ ids, side }))
    .filter((item) => ![...item.ids].every((id) => occupied.has(id)))
    .map((item) => item.side);
  const freeRoots = roots.filter((root) => !root.group.locked && !root.group.fixed),
    portAssignments = new Map<number, Node>();
  if (freeRoots.length >= unownedSides.length) {
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
  } else if (freeRoots.length) {
    for (const side of unownedSides)
      portAssignments.set(
        side,
        [...freeRoots].sort((a, b) => angularCost(a, side) - angularCost(b, side))[0]!,
      );
  }
  sideCells.forEach((ids, side) => {
    if ([...ids].every((id) => occupied.has(id))) return;

    const candidates = roots.filter(
      (root) => !root.group.locked && !root.group.fixed && !usedRoots.has(root),
    );
    const pool = candidates.length
      ? candidates
      : roots.filter((root) => !root.group.locked && !root.group.fixed);
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
    const node = lanes[entrance.side]!.at(-1)!;
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
  for (const root of roots)
    if (!portalOwners.has(root.id)) {
      const neighbors = roots
        .filter((other) => other !== root && portalOwners.has(other.id))
        .sort((a, b) => distance(a.point, root.point) - distance(b.point, root.point));
      if (neighbors[0]) allow(root, neighbors[0], true);
      if (config.paths.loop && neighbors[1]) allow(root, neighbors[1], true);
    }
  const outer = new Set(
    Array.from({ length: 6 }, (_, side) => boundaryCells(cells, side)).flatMap((list) =>
      list.map((cell) => cell.id),
    ),
  );
  const canClaim = (node: Node, id: string): boolean => {
    const cell = map.get(id)!;
    if (!cell.surfacePolygons.length || cell.landscapeOnly) return false;
    const owner = occupied.get(id);
    if (owner) return owner === node.id;
    if (node.group.locked || node.group.fixed) return false;
    if (outer.has(id) || cell.entranceSide !== undefined) return false;
    return cell.neighbors.every((next) => {
      const other = occupied.get(next);
      return !other || other === node.id || allowed.has(pair(node.id, other));
    });
  };
  const claim = (node: Node, ids: Iterable<string>): void => {
    for (const id of ids)
      if (!occupied.has(id) && !node.group.fixed && !node.group.locked) {
        node.group.ids.add(id);
        occupied.set(id, node.id);
      }
  };
  for (const node of nodes)
    if (!node.group.ids.size && !node.group.locked) {
      const candidate = cells
        .filter((cell) => canClaim(node, cell.id))
        .sort(
          (a, b) =>
            distance(a.center, node.point) - distance(b.center, node.point) ||
            (a.id < b.id ? -1 : 1),
        )[0];
      if (candidate) claim(node, [candidate.id]);
    }
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
      const pivot = candidates.sort(
        (x, y) => Math.abs(x - middle.length / 2) - Math.abs(y - middle.length / 2),
      )[0]!;
      middle.forEach((id, i) => claim(i < pivot ? a : b, [id]));
    }
    return adjacent(a, b);
  };
  for (const { a, b } of required) connect(a, b);

  for (let round = 0; round < cells.length; round++) {
    let progress = false;
    for (const node of nodes)
      if (
        !node.group.locked &&
        node.group.ids.size &&
        fieldArea(node.group.ids, map) + 1e-10 < MIN_FIELD_AREA
      ) {
        const candidate = compactCandidate(node.group, occupied, map, config.seed, (id) =>
          canClaim(node, id),
        );
        if (candidate) {
          claim(node, [candidate]);
          progress = true;
        }
      }
    if (!progress) break;
  }
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
  // Shift a lane boundary outward when a central port is just one raster piece short of its area.
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
  // Coarse lattices can block a straight lane; explicitly reroute its branch to a reachable junction.
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

/** Keep hard geometry constraints even when a requested count cannot be embedded in this lattice. */
export function buildAutoTopology(
  config: TileConfig,
  cells: TileCell[],
  entrances: Entrance[],
  centerPolygon: Point[],
  manual: FieldCluster[],
): { clusters: FieldCluster[]; warnings: string[] } {
  const first = topologyAttempt(config, cells, entrances, centerPolygon, manual);
  if (validLayout(first.clusters, cells, entrances, centerPolygon))
    return {
      ...first,
      warnings: first.warnings.filter(
        (warning) => !warning.includes('vollständig verbundenen Weggraphen'),
      ),
    };
  const candidates = [13, 7, ...Array.from({ length: 18 }, (_, i) => 24 - i)].filter(
    (count, index, list) => count !== config.paths.fieldCount && list.indexOf(count) === index,
  );
  for (const fieldCount of candidates) {
    const candidate = { ...config, paths: { ...config.paths, fieldCount } };
    const fallback = topologyAttempt(candidate, cells, entrances, centerPolygon, manual);
    if (validLayout(fallback.clusters, cells, entrances, centerPolygon))
      return {
        clusters: fallback.clusters,
        warnings: [
          `Die gewünschte Gesamtzahl ${config.paths.fieldCount} konnte mit diesem Raster und dieser Pentagonposition nicht gültig angeordnet werden; stattdessen sind ${fallback.clusters.length + 1} verbundene Felder möglich. ${config.paths.fieldCount === 7 ? 'Neben sechs festen Eingangsflächen und dem Pentagon wird mindestens ein inneres Verbindungsfeld benötigt; wähle mindestens acht Gesamtfelder.' : 'Wähle ein feineres Raster, eine andere Feldzahl oder eine andere Pentagonposition.'}`,
        ],
      };
  }
  return {
    clusters: first.clusters,
    warnings: [
      ...first.warnings,
      'Mit dieser manuellen Belegung konnte keine gültige, vollständig verbundene Feldanordnung erzeugt werden.',
    ],
  };
}
