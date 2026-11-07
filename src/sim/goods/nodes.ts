/** Seeded resource nodes: placement from layout, gather, dawn regrow. Pure. */

import nodesJson from '../../data/world/resource-nodes.json';
import { deriveRng } from '../rng';
import { biomeAt } from '../map/terrain';
import { featuresIn, FEATURES } from '../map/ladder/features';
import { pointOnRoad, type MapPoint } from '../map/world-layout';
import type { SimState } from '../types/runtime';
import { addItem, itemName } from './inventory';

type Yield = { itemId: string; min: number; max: number; chance?: number };
export type NodeKind = { id: string; name: string; yields: Yield[]; charges: number; regrowDawns: number; weight: number; nearTown: number };
type NodesTable = {
  kinds: NodeKind[];
  placement: { perTown: number; townRadiusTiles: [number, number]; perRoadSegment: number; roadJitterTiles: number };
};
export const NODES = nodesJson as unknown as NodesTable;
const KIND_BY_ID = new Map(NODES.kinds.map((k) => [k.id, k]));

export type WorldNode = { id: string; kindId: string; q: number; r: number; townId?: string };
type Place = { id: string; q: number; r: number };

function pickKind(seed: number, q: number, r: number, roll: number): string {
  switch (biomeAt(seed, q, r)) {
    case 'water': return 'fishing_spot';
    case 'forest': return roll < 0.85 ? 'tree' : 'herb_patch';
    case 'hills': return roll < 0.4 ? 'ore_vein' : 'rock';
    default: return roll < 0.4 ? 'berry_bush' : roll < 0.7 ? 'sheep_flock' : 'herb_patch';
  }
}

/** Deterministic node layout: rings around towns plus scatter along roads between them. */
export function placeNodes(seed: number, settlements: Place[], routes: { from: string; to: string; path?: MapPoint[] }[]): WorldNode[] {
  const out: WorldNode[] = [];
  const P = NODES.placement;
  for (const t of settlements) {
    const rng = deriveRng(seed, 'nodes', t.id);
    for (let i = 0; i < P.perTown; i++) {
      const ang = rng.next() * Math.PI * 2;
      const rad = P.townRadiusTiles[0] + rng.next() * (P.townRadiusTiles[1] - P.townRadiusTiles[0]);
      const q = Math.round(t.q + Math.cos(ang) * rad), r = Math.round(t.r + Math.sin(ang) * rad);
      out.push({ id: `${t.id}#${i}`, kindId: pickKind(seed, q, r, rng.next()), q, r, townId: t.id });
    }
  }
  const byId = new Map(settlements.map((s) => [s.id, s]));
  for (const rt of routes) {
    const a = byId.get(rt.from);
    const b = byId.get(rt.to);
    if (!a || !b) continue;
    const rng = deriveRng(seed, 'road-nodes', rt.from, rt.to);
    for (let i = 0; i < P.perRoadSegment; i++) {
      const f = (i + 0.5 + (rng.next() - 0.5) * 0.6) / P.perRoadSegment;
      const j = P.roadJitterTiles;
      const off = (rng.next() < 0.5 ? -1 : 1) * (2 + rng.next() * j);
      const p = pointOnRoad(rt.path ?? [a, b], f);
      const q = Math.round(p.q + off * 0.5), r = Math.round(p.r + off);
      out.push({ id: `${rt.from}>${rt.to}#${i}`, kindId: pickKind(seed, q, r, rng.next()), q, r });
    }
  }
  return out;
}

const WILD_CELL = 9;
/**
 * Wild nodes are never placed up front. The wilderness is only a seeded probability
 * (one per 9-tile cell, kind by biome); a node collapses into a real one when something
 * looks at its tile rect [q0,q1) x [r0,r1). Same cell -> same id, so saved charges
 * (state.worldNodes) still find it.
 */
export function wildNodesIn(seed: number, settlements: Place[], q0: number, r0: number, q1: number, r1: number): WorldNode[] {
  const out: WorldNode[] = [];
  if (!settlements.length) return out;
  const bq0 = Math.min(...settlements.map((s) => s.q)) - 30, bq1 = Math.max(...settlements.map((s) => s.q)) + 30;
  const br0 = Math.min(...settlements.map((s) => s.r)) - 30, br1 = Math.max(...settlements.map((s) => s.r)) + 30;
  const C = WILD_CELL;
  const xa = Math.max(Math.floor(bq0 / C), Math.floor(q0 / C)), xb = Math.min(Math.ceil(bq1 / C), Math.floor((q1 - 1) / C));
  const ya = Math.max(Math.floor(br0 / C), Math.floor(r0 / C)), yb = Math.min(Math.ceil(br1 / C), Math.floor((r1 - 1) / C));
  for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) {
    const rng = deriveRng(seed, 'biome-nodes', x, y);
    const q = x * C + rng.int(1, 8), r = y * C + rng.int(1, 8);
    if (q < q0 || q >= q1 || r < r0 || r >= r1) continue;
    if (settlements.some((s) => Math.hypot(s.q - q, s.r - r) < 10)) continue;
    out.push({ id: `wild#${x},${y}`, kindId: pickKind(seed, q, r, rng.next()), q, r });
  }
  // Features carry their own resources: ore at outcrops, fish along streams, sheep on farms.
  const inside = (p: { q: number; r: number }) => p.q >= q0 && p.q < q1 && p.r >= r0 && p.r < r1;
  for (const f of featuresIn(seed, settlements, q0, r0, q1, r1)) {
    if (f.kind === 'outcrop') {
      const p = { q: f.center.q + 1, r: f.center.r + 2 };
      if (inside(p)) out.push({ id: `${f.id}#ore`, kindId: f.hills ? 'ore_vein' : 'rock', ...p });
    } else if (f.kind === 'stream') {
      f.cells.forEach((c, i) => { const p = { q: c.q + 1, r: c.r }; if (i % FEATURES.stream.fishEvery === 10 && inside(p)) out.push({ id: `${f.id}#fish${i}`, kindId: 'fishing_spot', ...p }); });
    } else {
      f.sheep.forEach((p, i) => { if (inside(p)) out.push({ id: `${f.id}#sheep${i}`, kindId: 'sheep_flock', ...p }); });
    }
  }
  return out;
}

export const nodeKind = (id: string): NodeKind | undefined => KIND_BY_ID.get(id);

export function nodeCharges(state: SimState, n: WorldNode): number {
  return state.worldNodes?.[n.id]?.charges ?? nodeKind(n.kindId)?.charges ?? 0;
}

/** Gather one charge: items into the inventory. Returns a line, or null when depleted. */
export function gatherNode(state: SimState, n: WorldNode): string | null {
  const k = nodeKind(n.kindId);
  if (!k) return null;
  const nodes = (state.worldNodes ??= {});
  const cur = nodes[n.id] ?? { charges: k.charges, regrowIn: 0 };
  if (cur.charges <= 0) return null;
  const rng = deriveRng(state.seed, 'gather', n.id, state.day, cur.charges);
  const got: string[] = [];
  for (const y of k.yields) {
    if (y.chance !== undefined && rng.next() >= y.chance) continue;
    const q = rng.int(y.min, y.max + 1);
    if (q <= 0) continue;
    addItem(state, y.itemId, q);
    got.push(`+${q} ${itemName(y.itemId)}`);
  }
  cur.charges -= 1;
  if (cur.charges <= 0) cur.regrowIn = k.regrowDawns;
  nodes[n.id] = cur;
  return got.join(' ');
}

/** Dawn: depleted nodes count down and regrow to full. */
export function regrowNodes(state: SimState): void {
  for (const [id, s] of Object.entries(state.worldNodes ?? {})) {
    if (s.charges > 0) continue;
    s.regrowIn -= 1;
    if (s.regrowIn <= 0) delete state.worldNodes![id];
  }
}
