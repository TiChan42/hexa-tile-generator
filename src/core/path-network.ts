import { randomAt } from './random';
import type { Point, TileCell } from './types';

export interface PathNetworkSite {
  id: string;
  point: Point;
}

export interface PathNetworkLink {
  from: string;
  to: string;
  loop: boolean;
}

const pair = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Seeded farthest-point sampling spreads field cores across the board without radial lanes. */
export function selectBranchAnchors(
  seed: string,
  candidates: readonly TileCell[],
  count: number,
): TileCell[] {
  const remaining = [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    selected: TileCell[] = [];
  for (let index = 0; index < count && remaining.length; index++) {
    if (!selected.length) {
      const start = Math.floor(randomAt(seed, 'topology-v13-anchor-start') * remaining.length);
      selected.push(remaining.splice(start, 1)[0]!);
      continue;
    }
    const ranked = remaining
      .map((cell) => ({
        cell,
        score:
          Math.min(...selected.map((anchor) => distance(cell.center, anchor.center))) *
          (0.82 + randomAt(seed, 'topology-v13-anchor-jitter', index, cell.id) * 0.36),
      }))
      .sort(
        (a, b) => b.score - a.score || (a.cell.id < b.cell.id ? -1 : a.cell.id > b.cell.id ? 1 : 0),
      );
    const choiceCount = Math.min(5, ranked.length),
      choice = Math.floor(randomAt(seed, 'topology-v13-anchor-choice', index) * choiceCount),
      anchor = ranked[choice]!.cell;
    selected.push(anchor);
    remaining.splice(
      remaining.findIndex((cell) => cell.id === anchor.id),
      1,
    );
  }
  return selected;
}

/**
 * Connects center-facing roots to every field core with a seeded Prim tree.
 * Optional loops add a few cross-links between nearby branches.
 */
export function buildPathNetwork(
  seed: string,
  sites: readonly PathNetworkSite[],
  rootIds: readonly string[],
  loop: boolean,
  terminalIds: readonly string[] = [],
): PathNetworkLink[] {
  const ordered = [...sites].sort((a, b) => compareText(a.id, b.id)),
    byId = new Map(ordered.map((site) => [site.id, site]));
  if (ordered.length < 2) return [];

  const connected = new Set(rootIds.filter((id) => byId.has(id)));
  if (!connected.size) {
    const root = ordered
      .map((site) => ({ site, value: randomAt(seed, 'topology-v13-network-root', site.id) }))
      .sort(
        (a, b) => a.value - b.value || (a.site.id < b.site.id ? -1 : a.site.id > b.site.id ? 1 : 0),
      )[0]!.site;
    connected.add(root.id);
  }
  const links: PathNetworkLink[] = [],
    linked = new Set<string>(),
    degree = new Map(ordered.map((site) => [site.id, 0]));

  while (connected.size < ordered.length) {
    let best:
      { from: PathNetworkSite; to: PathNetworkSite; score: number; key: string } | undefined;
    for (const fromId of connected)
      for (const to of ordered) {
        if (connected.has(to.id)) continue;
        const from = byId.get(fromId)!,
          key = pair(from.id, to.id),
          jitter = 0.82 + randomAt(seed, 'topology-v13-network-edge', key) * 0.36,
          branchCost = Math.max(0, (degree.get(from.id) ?? 0) - 1) * 0.16,
          score = distance(from.point, to.point) * jitter * (1 + branchCost);
        if (!best || score < best.score || (score === best.score && key < best.key))
          best = { from, to, score, key };
      }
    if (!best) break;
    links.push({ from: best.from.id, to: best.to.id, loop: false });
    linked.add(best.key);
    degree.set(best.from.id, degree.get(best.from.id)! + 1);
    degree.set(best.to.id, degree.get(best.to.id)! + 1);
    connected.add(best.to.id);
  }

  if (loop && ordered.length >= 4) {
    const terminals = new Set(terminalIds);
    while (ordered.some((site) => !terminals.has(site.id) && degree.get(site.id)! < 2)) {
      const candidates = ordered
        .flatMap((from, index) =>
          ordered.slice(index + 1).map((to) => {
            const key = pair(from.id, to.id),
              deficient =
                (!terminals.has(from.id) && degree.get(from.id)! < 2 ? 1 : 0) +
                (!terminals.has(to.id) && degree.get(to.id)! < 2 ? 1 : 0);
            return {
              from,
              to,
              key,
              deficient,
              score:
                distance(from.point, to.point) *
                  (0.82 + randomAt(seed, 'topology-v13-network-repair', key) * 0.36) +
                (degree.get(from.id)! + degree.get(to.id)!) * 0.025,
            };
          }),
        )
        .filter(
          (edge) =>
            edge.deficient > 0 &&
            !linked.has(edge.key) &&
            degree.get(edge.from.id)! < 5 &&
            degree.get(edge.to.id)! < 5,
        )
        .sort(
          (a, b) => b.deficient - a.deficient || a.score - b.score || compareText(a.key, b.key),
        );
      const edge = candidates[0];
      if (!edge) break;
      links.push({ from: edge.from.id, to: edge.to.id, loop: true });
      linked.add(edge.key);
      degree.set(edge.from.id, degree.get(edge.from.id)! + 1);
      degree.set(edge.to.id, degree.get(edge.to.id)! + 1);
    }
    const extras = Math.min(4, Math.max(2, Math.floor(ordered.length / 5))),
      candidates = ordered
        .flatMap((from, index) =>
          ordered.slice(index + 1).map((to) => {
            const key = pair(from.id, to.id),
              branchCost = ((degree.get(from.id) ?? 0) + (degree.get(to.id) ?? 0)) * 0.03;
            return {
              from,
              to,
              key,
              score:
                distance(from.point, to.point) *
                  (0.78 + randomAt(seed, 'topology-v13-network-loop', key) * 0.44) +
                branchCost,
            };
          }),
        )
        .filter((edge) => !linked.has(edge.key))
        .sort((a, b) => a.score - b.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    for (const edge of candidates) {
      if (links.filter((link) => link.loop).length >= extras) break;
      if (degree.get(edge.from.id)! >= 5 || degree.get(edge.to.id)! >= 5) continue;
      links.push({ from: edge.from.id, to: edge.to.id, loop: true });
      linked.add(edge.key);
      degree.set(edge.from.id, degree.get(edge.from.id)! + 1);
      degree.set(edge.to.id, degree.get(edge.to.id)! + 1);
    }
  }
  return links;
}
