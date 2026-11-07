/** Lazy, deterministic density between towns: props per 4-tile cell and hamlets per 16-tile cell. Pure. */
import rules from '../../../data/world/scatter.json';
import type { Biome } from '../terrain';
import type { FacilityRenderView } from '../types';

export type ScatterCtx = {
  biome(q: number, r: number): Biome;
  isRoad(q: number, r: number): boolean;
  /** Tiles to the nearest settlement centre. */
  townDistance(q: number, r: number): number;
  /** Tiles to the nearest road cell, capped at `cap`. */
  roadDistance(q: number, r: number, cap: number): number;
};

type Rule = { type: string; chance: number };
const CELL_RULES = rules.cell as Partial<Record<Biome, Rule[]>>;

function hash(seed: number, a: number, b: number, c: number): number {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2246822519) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function prop(type: string, q: number, r: number): FacilityRenderView {
  return { id: `scatter_${type}_${q}_${r}`, type, state: 'idle', warmth: 0.4, position: { x: q, y: r } };
}

/** Props whose tile lies in the tile rect [q0, q0+size) x [r0, r0+size). size must be a multiple of 16. */
export function scatterProps(seed: number, q0: number, r0: number, size: number, ctx: ScatterCtx): FacilityRenderView[] {
  const out: FacilityRenderView[] = [];
  const used = new Set<string>();
  const ok = (q: number, r: number) => {
    const b = ctx.biome(q, r);
    return b !== 'water' && !ctx.isRoad(q, r) && !used.has(`${q},${r}`) && ctx.townDistance(q, r) > rules.townClearTiles;
  };
  const place = (type: string, q: number, r: number) => { used.add(`${q},${r}`); out.push(prop(type, q, r)); };
  // Hamlets: a small cluster of farmsteads and fields in a 16-tile cell close to a road.
  const h = rules.hamlet;
  for (let y = r0; y < r0 + size; y += 16) for (let x = q0; x < q0 + size; x += 16) {
    const X = Math.floor(x / 16), Y = Math.floor(y / 16);
    if (hash(seed ^ 0x4a17, X, Y, 0) >= h.chance) continue;
    const cq = x + 8, cr = y + 8;
    if (!h.biomes.includes(ctx.biome(cq, cr)) || ctx.roadDistance(cq, cr, h.maxRoadTiles) >= h.maxRoadTiles) continue;
    const span = (lo: number, hi: number, i: number) => lo + Math.floor(hash(seed ^ 0x4a17, X, Y, i) * (hi - lo + 1));
    const nf = span(h.farmsteads[0]!, h.farmsteads[1]!, 1), nc = span(h.fields[0]!, h.fields[1]!, 2);
    for (let i = 0; i < nf + nc; i++) {
      const q = x + 2 + Math.floor(hash(seed ^ 0x4a17, X, Y, 10 + i) * 12), r = y + 2 + Math.floor(hash(seed ^ 0x4a17, X, Y, 40 + i) * 12);
      if (ok(q, r)) place(i < nf ? 'farmstead' : 'field', q, r);
    }
  }
  // Single props per 4-tile cell by biome.
  for (let y = r0; y < r0 + size; y += 4) for (let x = q0; x < q0 + size; x += 4) {
    const X = x >> 2, Y = y >> 2;
    const q = x + Math.floor(hash(seed ^ 0x5c47, X, Y, 1) * 4), r = y + Math.floor(hash(seed ^ 0x5c47, X, Y, 2) * 4);
    const roll = hash(seed ^ 0x5c47, X, Y, 0);
    let acc = 0;
    for (const rule of CELL_RULES[ctx.biome(q, r)] ?? []) {
      acc += rule.chance;
      if (roll < acc) { if (ok(q, r)) place(rule.type, q, r); break; }
    }
  }
  return out;
}
