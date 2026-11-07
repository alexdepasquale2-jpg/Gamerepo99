/** Turns features + biomes into a chunk's props and tile overrides (streams, farm tracks). Pure, lazy. */
import { bresenhamLine } from '../corridor';
import type { Biome } from '../terrain';
import type { FacilityRenderView } from '../types';
import { featuresIn, fhash, FEATURES as F, inRect, type Pt } from './features';

type Put = (type: string, q: number, r: number, state?: string) => void;
type Tile = (q: number, r: number, id: string) => void;

/** What each kind of wild spot looks like (props around its centre). */
function dressSpot(type: string, c: Pt, h: (i: number) => number, put: Put, tile: Tile): void {
  const ring = (n: number, rad: number, kind: string, salt: number, state?: string) => {
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + h(salt) * 6; put(kind, Math.round(c.q + Math.cos(a) * rad), Math.round(c.r + Math.sin(a) * rad), state); }
  };
  const scatter = (n: number, rad: number, kind: string, salt: number, state?: string) => {
    for (let i = 0; i < n; i++) put(kind, c.q + Math.round((h(salt + i) - 0.5) * 2 * rad), c.r + Math.round((h(salt + 40 + i) - 0.5) * 2 * rad), state);
  };
  switch (type) {
    case 'camp': put('campfire', c.q, c.r); put('tent', c.q - 2, c.r - 1); put('log', c.q + 2, c.r); put('log', c.q, c.r + 2); break;
    case 'ruin': for (let d = -2; d <= 2; d++) for (const [dq, dr] of [[d, -2], [d, 2], [-2, d], [2, d]] as const) if (h(60 + (dq + 2) * 5 + dr + 2) < 0.6) put('ruin_wall', c.q + dq, c.r + dr); put('stump', c.q, c.r); break;
    case 'shrine': put('shrine', c.q, c.r); ring(5, 2, 'flowers', 3); break;
    case 'thicket': scatter(8, 3, 'bush', 10); break;
    case 'deer': scatter(3, 3, 'critter', 10, 'deer'); break;
    case 'foxes': scatter(2, 2, 'critter', 10, 'fox'); break;
    case 'rabbits': scatter(4, 3, 'critter', 10, 'rabbit'); break;
    case 'birds': scatter(5, 3, 'critter', 10, 'bird'); break;
    case 'pond': for (let dr = -2; dr <= 2; dr++) for (let dq = -3; dq <= 3; dq++) if ((dq * dq) / 9 + (dr * dr) / 4 <= 1) tile(c.q + dq, c.r + dr, 'stream'); ring(6, 4, 'reeds', 5); break;
    case 'cart': put('cart', c.q, c.r); put('hay', c.q + 2, c.r + 1); put('log', c.q - 2, c.r + 1); break;
    case 'flowers': scatter(9, 3, 'flowers', 10); break;
    case 'haystacks': scatter(3, 3, 'hay', 10); break;
    case 'clearing': scatter(5, 3, 'stump', 10); put('log', c.q + 1, c.r); put('campfire', c.q - 1, c.r + 1); break;
    case 'cairn': put('boulder', c.q, c.r); ring(4, 1, 'rock', 3); break;
  }
}

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
  // Roads keep a clear verge (logistics); towns keep their plots (building). Everything else fills up.
  const RC = F.roadClearTiles;
  const nearRoad = (q: number, r: number) => { for (let dr = -RC; dr <= RC; dr++) for (let dq = -RC; dq <= RC; dq++) if (ctx.isRoad(q + dq, r + dr)) return true; return false; };
  const free = (q: number, r: number) => inRect({ q, r }, q0, r0, q1, r1) && !used.has(`${q},${r}`) && ctx.biome(q, r) !== 'water' && !tiles.has(`${q},${r}`) && !nearRoad(q, r);
  const reserve = (c: Pt, rad: number) => { for (let dr = -rad; dr <= rad; dr++) for (let dq = -rad; dq <= rad; dq++) if (dq * dq + dr * dr <= rad * rad) used.add(`${c.q + dq},${c.r + dr}`); };
  const put = (type: string, q: number, r: number, state?: string) => { if (!free(q, r)) return; used.add(`${q},${r}`); props.push(prop(type, q, r, state)); };
  const tile = (q: number, r: number, id: string) => { if (inRect({ q, r }, q0, r0, q1, r1) && !ctx.isRoad(q, r) && ctx.biome(q, r) !== 'water' && !used.has(`${q},${r}`)) tiles.set(`${q},${r}`, id); };

  for (const f of featuresIn(seed, ctx.towns, q0, r0, q1, r1)) {
    if (f.kind === 'stream') {
      for (const c of f.cells) tile(c.q, c.r, 'stream');
      f.cells.forEach((c, i) => { if (fhash(seed, c.q, c.r, 71) < F.stream.reeds) put('reeds', c.q + (i % 2 ? 1 : -1), c.r); });
    } else if (f.kind === 'outcrop') {
      f.rocks.forEach((p, i) => put(i === 0 ? 'boulder' : 'rock', p.q, p.r));
      if (f.hills) put('stump', f.center.q + 2, f.center.r + 3);
    } else if (f.kind === 'spot') {
      dressSpot(f.type, f.center, (i) => fhash(seed ^ 0x5b07, f.center.q, f.center.r, 100 + i), put, tile);
      reserve(f.center, 3);
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
      for (let r = field.r - 1; r <= field.r + field.h; r++) for (let q = house.q - 2; q <= field.q + field.w; q++) used.add(`${q},${r}`);
    }
  }

  // Critters: small groups that wander about their spot (render only; see paintProp).
  const A = F.anchorTiles, CR = F.critters;
  for (let Y = Math.floor(r0 / A); Y <= Math.floor((r1 - 1) / A); Y++) for (let X = Math.floor(q0 / A); X <= Math.floor((q1 - 1) / A); X++) {
    const h = (i: number) => fhash(seed ^ 0xc417, X, Y, i);
    if (h(0) >= CR.chance) continue;
    const q = X * A + 2 + Math.floor(h(1) * (A - 4)), r = Y * A + 2 + Math.floor(h(2) * (A - 4));
    const kinds = (CR.biomes as Record<string, string[]>)[ctx.biome(q, r)];
    if (!kinds || ctx.townDistance(q, r) < 24) continue;
    const kind = kinds[Math.floor(h(3) * kinds.length)]!;
    const n = 1 + Math.floor(h(4) * 3);
    for (let i = 0; i < n; i++) put('critter', q + Math.floor(h(10 + i) * 5) - 2, r + Math.floor(h(20 + i) * 5) - 2, kind);
  }

  // Build sites: unfinished frames beside the roads, waiting for hands and timber.
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
