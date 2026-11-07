/** One deterministic geography shared by worldgen, travel, economy and rendering. */
import type { FabricWorld } from '../gen/world-types';
import type { SettlementGen } from '../gen/places/settlements-gen';
import { deriveRng } from '../rng';
import { WORLD_SCALE as S } from './constants';

export type MapPoint = { q: number; r: number };
export type SettlementKind = 'city' | 'town' | 'village';
export type LayoutSettlement = MapPoint & { id: string; kind?: SettlementKind };
export type LayoutRoute = { id: string; from: string; to: string; path: MapPoint[] };
export type WorldLayout = { settlements: LayoutSettlement[]; routes: LayoutRoute[] };

// Polity area is an old art-footprint proxy, not population. The gap axis records
// rural/urban identity; use it consistently rather than calling every stamp a city.
export const settlementKind = (s: { gap01: number }): SettlementKind =>
  s.gap01 >= 0.7 ? 'city' : s.gap01 >= 0.3 ? 'town' : 'village';

/** Best-candidate clustered placement. Cities seed regions, towns orbit cities,
 * villages orbit towns. Maximise separation with a bounded deterministic search. */
export function placeSettlements(raw: SettlementGen[], seed: number): LayoutSettlement[] {
  const rank = { city: 0, town: 1, village: 2 };
  const ordered = raw.slice().sort((a, b) => rank[settlementKind(a)] - rank[settlementKind(b)] || a.id.localeCompare(b.id));
  const placed: LayoutSettlement[] = [];
  const cityCount = Math.max(1, ordered.filter((s) => settlementKind(s) === 'city').length);
  const cols = Math.ceil(Math.sqrt(cityCount));
  for (const s of ordered) {
    const rng = deriveRng(seed, 'geography-v2', s.id);
    const kind = settlementKind(s);
    const parents = placed.filter((p) => kind === 'village' ? p.kind === 'town' : p.kind === 'city');
    const anchors = parents.length ? parents : placed;
    let best = { q: 0, r: 0 }, score = -Infinity;
    if (kind === 'city' || !anchors.length) {
      const i = placed.filter((p) => p.kind === 'city').length;
      best = { q: Math.round((i % cols) * 420 + rng.next() * 80), r: Math.round(Math.floor(i / cols) * 420 + rng.next() * 80) };
    } else {
      const anchor = anchors[rng.int(0, anchors.length)]!;
      const lo = kind === 'village' ? 65 : 155;
      const hi = kind === 'village' ? 125 : 280;
      for (let attempt = 0; attempt < 96; attempt++) {
        const angle = rng.next() * Math.PI * 2;
        const radius = lo + rng.next() * (hi - lo);
        const p = { q: Math.round(anchor.q + Math.cos(angle) * radius), r: Math.round(anchor.r + Math.sin(angle) * radius) };
        const distance = Math.min(...placed.map((other) => Math.hypot(p.q - other.q, p.r - other.r)));
        if (distance > score) { best = p; score = distance; }
      }
    }
    placed.push({ id: s.id, kind, ...best });
  }
  // Placed at the original scale, then stretched, so the layout is exactly proportional.
  // Keep input order stable: it controls existing player spawning and social allocation.
  return raw.map((s) => placed.find((p) => p.id === s.id)!).map((p) => ({ ...p, q: Math.round(p.q * S), r: Math.round(p.r * S) }));
}

/** Shared small-amplitude curve, sampled in tiles; endpoints are exact. */
export function roadPath(a: MapPoint, b: MapPoint, seed: number, id: string): MapPoint[] {
  const rng = deriveRng(seed, 'road-curve', id);
  const dx = b.q - a.q, dy = b.r - a.r, len = Math.hypot(dx, dy) || 1;
  const amplitude = Math.min(9 * S, len * 0.025) * (rng.next() < 0.5 ? -1 : 1);
  const count = Math.max(2, Math.ceil(len / (3 * S)));
  return Array.from({ length: count + 1 }, (_, i) => {
    const f = i / count;
    const offset = Math.sin(f * Math.PI) * (Math.sin(f * Math.PI * 2) * 0.35 + 0.65) * amplitude;
    return { q: a.q + dx * f - dy / len * offset, r: a.r + dy * f + dx / len * offset };
  });
}

/** Kruskal MST plus short non-crossing chords. Reject crossings of the curved
 * paths too, and edges passing through a third settlement's stamp. */
export function geographicRoads(settlements: SettlementGen[], seed: number): LayoutRoute[] {
  const points = placeSettlements(settlements, seed);
  const candidates: (LayoutRoute & { distance: number })[] = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const a = points[i]!, b = points[j]!;
    const ids = [a.id, b.id].sort();
    const id = `road_${ids[0]}_${ids[1]}`;
    candidates.push({ id, from: a.id, to: b.id, path: [a, b], distance: Math.hypot(a.q - b.q, a.r - b.r) });
  }
  candidates.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  const parent = new Map(points.map((p) => [p.id, p.id]));
  const root = (id: string): string => { while (parent.get(id) !== id) id = parent.get(id)!; return id; };
  const chosen: LayoutRoute[] = [];
  const crosses = (a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint): boolean => {
    const side = (p: MapPoint, q: MapPoint, r: MapPoint) => (q.q - p.q) * (r.r - p.r) - (q.r - p.r) * (r.q - p.q);
    return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
  };
  const clear = (edge: LayoutRoute): boolean => !chosen.some((other) => {
    if (edge.id === other.id) return false;
    for (let i = 1; i < edge.path.length; i++) for (let j = 1; j < other.path.length; j++) {
      if (crosses(edge.path[i - 1]!, edge.path[i]!, other.path[j - 1]!, other.path[j]!)) return true;
    }
    return false;
  });
  // Build the entire straight Euclidean MST first: guaranteed connected and
  // planar. Only curve an edge after checking it against every other MST edge.
  for (const edge of candidates) {
    if (root(edge.from) === root(edge.to)) continue;
    parent.set(root(edge.from), root(edge.to));
    chosen.push(edge);
  }
  for (const edge of chosen) {
    const straight = edge.path;
    edge.path = roadPath(straight[0]!, straight[1]!, seed, edge.id);
    if (!clear(edge)) edge.path = straight;
  }
  const target = Math.max(0, points.length - 1) + Math.ceil(points.length / 3);
  for (const edge of candidates) {
    if (chosen.length >= target) break;
    if (chosen.some((r) => r.id === edge.id)) continue;
    edge.path = roadPath(edge.path[0]!, edge.path[edge.path.length - 1]!, seed, edge.id);
    if (!clear(edge)) continue;
    if (points.some((p) => p.id !== edge.from && p.id !== edge.to && edge.path.some((v) => Math.hypot(v.q - p.q, v.r - p.r) < 14 * S))) continue;
    chosen.push(edge);
  }
  return chosen.map(({ id, from, to, path }) => ({ id, from, to, path }));
}

export function layoutWorld(world: FabricWorld, seed: number): WorldLayout {
  const settlements = placeSettlements(world.settlements ?? [], seed);
  const byId = new Map(settlements.map((s) => [s.id, s]));
  const generated = new Map(geographicRoads(world.settlements ?? [], seed).map((r) => [r.id, r]));
  const routes = (world.routes ?? []).flatMap((r) => {
    const a = byId.get(r.fromId), b = byId.get(r.toId);
    if (!a || !b || a.id === b.id) return [];
    return [{ id: r.id, from: a.id, to: b.id, path: generated.get(r.id)?.path ?? roadPath(a, b, seed, r.id) }];
  });
  return { settlements, routes };
}

/** Arc-length interpolation shared by road-side resources and visible wagons. */
export function pointOnRoad(path: MapPoint[], progress: number): MapPoint {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p.q - path[i]!.q, p.r - path[i]!.r));
  let remaining = Math.max(0, Math.min(1, progress)) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i]!;
    if (remaining <= len) {
      const a = path[i]!, b = path[i + 1]!, f = len ? remaining / len : 0;
      return { q: a.q + (b.q - a.q) * f, r: a.r + (b.r - a.r) * f };
    }
    remaining -= len;
  }
  return path[path.length - 1] ?? { q: 0, r: 0 };
}
