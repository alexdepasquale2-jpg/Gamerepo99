/** Seeded resource nodes: placement from layout, gather, dawn regrow. Pure. */

import nodesJson from '../../data/world/resource-nodes.json';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { addItem, itemName } from './inventory';

type Yield = { itemId: string; min: number; max: number };
export type NodeKind = { id: string; name: string; yields: Yield[]; charges: number; regrowDawns: number; weight: number; nearTown: number };
type NodesTable = {
  kinds: NodeKind[];
  placement: { perTown: number; townRadiusTiles: [number, number]; perRoadSegment: number; roadJitterTiles: number };
};
export const NODES = nodesJson as unknown as NodesTable;
const KIND_BY_ID = new Map(NODES.kinds.map((k) => [k.id, k]));

export type WorldNode = { id: string; kindId: string; q: number; r: number; townId?: string };
type Place = { id: string; q: number; r: number };

function pickKind(roll: number, nearTown: boolean): NodeKind {
  const w = NODES.kinds.map((k) => k.weight * (nearTown ? 0.3 + k.nearTown : 1.3 - k.nearTown));
  let t = roll * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) if ((t -= w[i]!) <= 0) return NODES.kinds[i]!;
  return NODES.kinds[0]!;
}

/** Deterministic node layout: rings around towns plus scatter along roads between them. */
export function placeNodes(seed: number, settlements: Place[], routes: { from: string; to: string }[]): WorldNode[] {
  const out: WorldNode[] = [];
  const P = NODES.placement;
  for (const t of settlements) {
    const rng = deriveRng(seed, 'nodes', t.id);
    for (let i = 0; i < P.perTown; i++) {
      const ang = rng.next() * Math.PI * 2;
      const rad = P.townRadiusTiles[0] + rng.next() * (P.townRadiusTiles[1] - P.townRadiusTiles[0]);
      const k = pickKind(rng.next(), true);
      out.push({ id: `${t.id}#${i}`, kindId: k.id, q: Math.round(t.q + Math.cos(ang) * rad), r: Math.round(t.r + Math.sin(ang) * rad * 0.8), townId: t.id });
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
      const k = pickKind(rng.next(), false);
      out.push({ id: `${rt.from}>${rt.to}#${i}`, kindId: k.id, q: Math.round(a.q + (b.q - a.q) * f + off * 0.5), r: Math.round(a.r + (b.r - a.r) * f + off) });
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
    const q = rng.int(y.min, y.max + 1);
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
