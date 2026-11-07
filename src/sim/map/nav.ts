/** Water-aware walking: A* over tiles that never steps on water except bridge decks and fords. Pure. */
import { TILE_PX } from './constants';
import { pointOnRoad, type MapPoint } from './world-layout';
import type { TerrainAccess } from './terrain-access';

export type Tile = { q: number; r: number };
export type Pt = { x: number; y: number };
export type Navigator = {
  walkable: (q: number, r: number) => boolean;
  /** Same foot test the player uses (feet +-5px, 2px up). */
  walkableAt: (x: number, y: number) => boolean;
  tileAt: (x: number, y: number) => Tile;
  centerOf: (q: number, r: number) => Pt;
  /** Nearest walkable tile within `maxRadius` rings (the tile itself if walkable). */
  snap: (q: number, r: number, maxRadius?: number) => Tile | null;
  /** Inclusive 8-way tile path with no corner cutting, or null when unreachable within budget. */
  findPath: (from: Tile, to: Tile, maxNodes?: number) => Tile[] | null;
  /** World waypoints from `from` to `to`; never crosses water off bridge/ford. Null if unreachable. */
  route: (from: Pt, to: Pt, maxNodes?: number) => Pt[] | null;
  /** Point on a road polyline; guaranteed to rest on a walkable tile (bridge/ford/land). */
  roadPoint: (path: MapPoint[], progress: number) => MapPoint;
};

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];
const MAX_NODES = 6000;

export function createNavigator(terrain: Pick<TerrainAccess, 'passable'>, tilePx = TILE_PX): Navigator {
  const walkable = (q: number, r: number) => terrain.passable(q, r);
  const tileAt = (x: number, y: number): Tile => ({ q: Math.floor(x / tilePx), r: Math.floor((y - 2) / tilePx) });
  const walkableAt = (x: number, y: number) => [-5, 5].every((o) => { const t = tileAt(x + o, y); return walkable(t.q, t.r); });
  const centerOf = (q: number, r: number): Pt => ({ x: q * tilePx + tilePx / 2, y: r * tilePx + tilePx / 2 });

  const snap = (q: number, r: number, maxRadius = 10): Tile | null => {
    if (walkable(q, r)) return { q, r };
    for (let rad = 1; rad <= maxRadius; rad++) {
      let best: Tile | null = null, bd = Infinity;
      for (let dr = -rad; dr <= rad; dr++) for (let dq = -rad; dq <= rad; dq++) {
        if (Math.max(Math.abs(dq), Math.abs(dr)) !== rad || !walkable(q + dq, r + dr)) continue;
        const d = dq * dq + dr * dr;
        if (d < bd) { bd = d; best = { q: q + dq, r: r + dr }; }
      }
      if (best) return best;
    }
    return null;
  };

  const findPath = (from: Tile, to: Tile, maxNodes = MAX_NODES): Tile[] | null => {
    if (!walkable(from.q, from.r) || !walkable(to.q, to.r)) return null;
    if (from.q === to.q && from.r === to.r) return [{ ...from }];
    const key = (q: number, r: number) => `${q},${r}`;
    const h = (q: number, r: number) => {
      const dx = Math.abs(q - to.q), dy = Math.abs(r - to.r);
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    };
    type Node = { q: number; r: number; g: number; f: number; parent?: Node };
    const open: Node[] = [];
    const push = (n: Node) => { // binary min-heap on f
      open.push(n);
      for (let i = open.length - 1; i > 0;) {
        const p = (i - 1) >> 1;
        if (open[p]!.f <= open[i]!.f) break;
        [open[p], open[i]] = [open[i]!, open[p]!];
        i = p;
      }
    };
    const pop = (): Node => {
      const top = open[0]!, last = open.pop()!;
      if (open.length) {
        open[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, rr = l + 1;
          let m = i;
          if (l < open.length && open[l]!.f < open[m]!.f) m = l;
          if (rr < open.length && open[rr]!.f < open[m]!.f) m = rr;
          if (m === i) break;
          [open[m], open[i]] = [open[i]!, open[m]!];
          i = m;
        }
      }
      return top;
    };
    const best = new Map<string, number>();
    const closed = new Set<string>();
    push({ q: from.q, r: from.r, g: 0, f: h(from.q, from.r) });
    best.set(key(from.q, from.r), 0);
    while (open.length && closed.size < maxNodes) {
      const cur = pop();
      const ck = key(cur.q, cur.r);
      if (closed.has(ck)) continue;
      closed.add(ck);
      if (cur.q === to.q && cur.r === to.r) {
        const out: Tile[] = [];
        for (let n: Node | undefined = cur; n; n = n.parent) out.push({ q: n.q, r: n.r });
        return out.reverse();
      }
      for (const [dq, dr, cost] of DIRS) {
        const q = cur.q + dq, r = cur.r + dr, k = key(q, r);
        if (closed.has(k) || !walkable(q, r)) continue;
        // No cutting a corner across water/impassable cells.
        if (dq !== 0 && dr !== 0 && (!walkable(cur.q + dq, cur.r) || !walkable(cur.q, cur.r + dr))) continue;
        const g = cur.g + cost;
        if (g >= (best.get(k) ?? Infinity)) continue;
        best.set(k, g);
        push({ q, r, g, f: g + h(q, r), parent: cur });
      }
    }
    return null;
  };

  const route = (from: Pt, to: Pt, maxNodes?: number): Pt[] | null => {
    const a = tileAt(from.x, from.y), b0 = tileAt(to.x, to.y);
    const start = snap(a.q, a.r, 3), goal = snap(b0.q, b0.r);
    if (!start || !goal) return null;
    const tiles = findPath(start, goal, maxNodes);
    if (!tiles) return null;
    const stranded = start.q !== a.q || start.r !== a.r;
    const pts = tiles.slice(stranded ? 0 : 1).map((t) => centerOf(t.q, t.r));
    // Finish on the exact requested spot only when it is itself dry/bridged footing.
    if (goal.q === b0.q && goal.r === b0.r && walkableAt(to.x, to.y)) {
      if (pts.length) pts[pts.length - 1] = { x: to.x, y: to.y }; else pts.push({ x: to.x, y: to.y });
    }
    return pts;
  };

  const roadPoint = (path: MapPoint[], progress: number): MapPoint => {
    const p = pointOnRoad(path, progress);
    const q = Math.round(p.q), r = Math.round(p.r);
    if (walkable(q, r)) return p;
    const s = snap(q, r, 4);
    return s ? { q: s.q, r: s.r } : p;
  };

  return { walkable, walkableAt, tileAt, centerOf, snap, findPath, route, roadPoint };
}
