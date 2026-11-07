/** Turns features + biomes into a chunk's props and tile overrides (streams, farm tracks). Pure, lazy. */
import { bresenhamLine } from '../corridor';
import type { Biome } from '../terrain';
import type { FacilityRenderView } from '../types';
import { featuresIn, fhash, FEATURES as F, inRect, type Pt } from './features';

export type DressCtx = {
  biome(q: number, r: number): Biome;
  isRoad(q: number, r: number): boolean;
  townDistance(q: number, r: number): number;
  nearestRoad(q: number, r: number, cap: number): Pt | null;
  towns: { q: number; r: number }[];
};
export type Dressing = { props: FacilityRenderView[]; tiles: Map<string, string> };

const prop = (type: string, q: number, r: number, state = 'idle'): FacilityRenderView =>
  ({ id: `dress_${type}_${q}_${r}`, type, state, warmth: 0.4, position: { x: q, y: r } });

export function dressChunk(seed: number, q0: number, r0: number, size: number, ctx: DressCtx): Dressing {
  const q1 = q0 + size, r1 = r0 + size;
  const props: FacilityRenderView[] = [], tiles = new Map<string, string>(), used = new Set<string>();
  const free = (q: number, r: number) => inRect({ q, r }, q0, r0, q1, r1) && !used.has(`${q},${r}`) && !ctx.isRoad(q, r) && ctx.biome(q, r) !== 'water' && !tiles.has(`${q},${r}`);
  const put = (type: string, q: number, r: number, state?: string) => { if (!free(q, r)) return; used.add(`${q},${r}`); props.push(prop(type, q, r, state)); };
  const tile = (q: number, r: number, id: string) => { if (inRect({ q, r }, q0, r0, q1, r1) && !ctx.isRoad(q, r) && ctx.biome(q, r) !== 'water' && !used.has(`${q},${r}`)) tiles.set(`${q},${r}`, id); };

  for (const f of featuresIn(seed, ctx.towns, q0, r0, q1, r1)) {
    if (f.kind === 'stream') {
      for (const c of f.cells) tile(c.q, c.r, 'stream');
      f.cells.forEach((c, i) => { if (fhash(seed, c.q, c.r, 71) < F.stream.reeds) put('reeds', c.q + (i % 2 ? 1 : -1), c.r); });
    } else if (f.kind === 'outcrop') {
      f.rocks.forEach((p, i) => put(i === 0 ? 'boulder' : 'rock', p.q, p.r));
      if (f.hills) put('stump', f.center.q + 2, f.center.r + 3);
    } else {
      const { house, field, gate } = f;
      // Track first so the fence and crops leave it clear.
      const road = ctx.nearestRoad(house.q, house.r + 1, F.farm.trackMaxTiles);
      if (road) for (const c of bresenhamLine(house.q, house.r + 1, road.q, road.r)) tile(c.q, c.r, 'road_track');
      put('farmstead', house.q, house.r);
      put('hay', house.q - 1, house.r + 1);
      for (let q = field.q; q < field.q + field.w; q++) for (let r = field.r; r < field.r + field.h; r++) {
        const edgeH = r === field.r || r === field.r + field.h - 1, edgeV = q === field.q || q === field.q + field.w - 1;
        if (q === gate.q && r === gate.r) continue;
        if (edgeH) put('fence_h', q, r);
        else if (edgeV) put('fence_v', q, r);
        else if ((r - field.r) % 2 === 1) put('field', q, r);
      }
    }
  }

  // Build sites: unfinished frames beside the roads, waiting for hands and timber.
  const A = F.anchorTiles;
  for (let Y = Math.floor(r0 / A); Y <= Math.floor((r1 - 1) / A); Y++) for (let X = Math.floor(q0 / A); X <= Math.floor((q1 - 1) / A); X++) {
    const h = (i: number) => fhash(seed ^ 0x517e, X, Y, i);
    if (h(0) >= F.site.chance) continue;
    const q = X * A + 3 + Math.floor(h(1) * (A - 6)), r = Y * A + 3 + Math.floor(h(2) * (A - 6));
    if (ctx.townDistance(q, r) < F.townClearTiles || !ctx.nearestRoad(q, r, F.site.maxRoadTiles)) continue;
    put('build_site', q, r, 'unbuilt');
    put('log', q + 2, r + 1);
    put('sign', q - 2, r + 1);
  }

  // Woods: dense inside, broken at the edge, undergrowth spilling onto open ground.
  const W = F.woods, near = (q: number, r: number, want: boolean) => {
    for (let d = -W.edgeTiles; d <= W.edgeTiles; d++) for (const [dq, dr] of [[d, -W.edgeTiles], [d, W.edgeTiles], [-W.edgeTiles, d], [W.edgeTiles, d]] as const) {
      if ((ctx.biome(q + dq, r + dr) === 'forest') === want) return true;
    }
    return false;
  };
  for (let r = r0; r < r1; r += W.step) for (let q = q0; q < q1; q += W.step) {
    const jq = q + Math.floor(fhash(seed, q, r, 81) * W.step), jr = r + Math.floor(fhash(seed, q, r, 82) * W.step);
    if (ctx.townDistance(jq, jr) < 18) continue;
    const roll = fhash(seed, jq, jr, 83), b = ctx.biome(jq, jr);
    if (b === 'forest') {
      const edge = near(jq, jr, false);
      if (roll < (edge ? W.edge : W.interior)) put('tree', jq, jr, String(Math.floor(fhash(seed, jq, jr, 84) * 3)));
      else if (edge && roll < W.edge + W.undergrowth) put(fhash(seed, jq, jr, 85) < 0.75 ? 'bush' : 'stump', jq, jr);
    } else if (b !== 'water' && roll < W.spill && near(jq, jr, true)) {
      put(fhash(seed, jq, jr, 85) < 0.6 ? 'bush' : 'tree', jq, jr, '0');
    }
  }

  // Life: flowers, bushes, logs on open ground so no screen is bare.
  const L = F.life;
  for (let r = r0; r < r1; r += L.step) for (let q = q0; q < q1; q += L.step) {
    const jq = q + Math.floor(fhash(seed, q, r, 91) * L.step), jr = r + Math.floor(fhash(seed, q, r, 92) * L.step);
    const b = ctx.biome(jq, jr), chance = (L as Record<string, number>)[b] ?? 0;
    if (!chance || fhash(seed, jq, jr, 93) >= chance || ctx.townDistance(jq, jr) < 16) continue;
    const t = fhash(seed, jq, jr, 94);
    put(b === 'hills' ? (t < 0.7 ? 'rock' : 'bush') : t < 0.5 ? 'flowers' : t < 0.85 ? 'bush' : 'log', jq, jr);
  }
  return { props, tiles };
}
