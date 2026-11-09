import { describe, expect, it } from 'vitest';
import { storeSpots } from '../../src/world/civic-ground';
import { townSpots } from '../../src/world/town-spots';
import { planFootprints } from '../../src/sim/map/town-plan';
import { TILE_PX } from '../../src/sim/map/constants';
import type { LayoutSettlement } from '../../src/sim/map/world-layout';

const T = TILE_PX;
const towns: LayoutSettlement[] = [];
for (const kind of ['village', 'town', 'city'] as const) for (let i = 0; i < 40; i++) towns.push({ id: `t_${kind}_${i}`, kind, q: i * 37 - 500, r: i * 23 - 300, lanes: i % 3 ? [] : Array.from({ length: 23 }, (_, k) => ({ q: k - 11, r: (i % 5) - 2 })) });

describe('civic ground: the town stores stand on clear plaza ground', () => {
  it('keeps granary and storehouse off every plan stamp, the fixtures and each other, the same every time', () => {
    for (const town of towns) {
      const t = townSpots(town);
      const s = storeSpots(t);
      const rect = (p: { x: number; y: number }) => {
        const q = (p.x - t.centre.x) / T, r = (p.y - t.centre.y) / T;
        return { x0: q - 1.1, y0: r - 2.2, x1: q + 1.1, y1: r + 0.4 };
      };
      const hit = (a: { x0: number; y0: number; x1: number; y1: number }, b: typeof a) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
      const g = rect(s.granary), h = rect(s.storehouse);
      expect(hit(g, h), town.id).toBe(false);
      for (const f of planFootprints(town)) { expect(hit(g, f), `${town.id} granary`).toBe(false); expect(hit(h, f), `${town.id} storehouse`).toBe(false); }
      for (const p of [t.board, t.signpost, t.well, t.stall, t.hearth]) {
        const q = (p.x - t.centre.x) / T, r = (p.y - t.centre.y) / T;
        const fx = { x0: q - 0.4, y0: r - 1, x1: q + 0.4, y1: r };
        expect(hit(g, fx) || hit(h, fx), `${town.id} fixture`).toBe(false);
      }
      expect(storeSpots(townSpots(town))).toEqual(s);
    }
  });
});
