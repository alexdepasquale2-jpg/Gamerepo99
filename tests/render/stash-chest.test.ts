import { describe, expect, it } from 'vitest';
import { stashChests } from '../../src/render/goods/stash-chest';
import { ensureHoard } from '../../src/sim/hoard';
import type { SimState } from '../../src/sim/types/runtime';

const sites = [{ id: 'a_site', townId: 'a' }, { id: 'b_site', townId: 'b' }];
const towns = [{ id: 'a', q: 3, r: 4 }, { id: 'b', q: 9, r: 9 }];

describe('stashChests', () => {
  it('stocked sites yield a chest; empty ones do not; a lost stash removes it', () => {
    const st = { flags: {} } as unknown as SimState;
    const h = ensureHoard(st);
    h.stash['a_site'] = { siteId: 'a_site', coin: 12, goods: {}, guardsHired: 0 };
    h.stash['b_site'] = { siteId: 'b_site', coin: 0, goods: {}, guardsHired: 0 };
    let c = stashChests(st, sites, towns);
    expect(c.map((x) => x.siteId)).toEqual(['a_site']);
    expect(c[0]!.townId).toBe('a');
    h.stash['a_site']!.coin = 0;
    c = stashChests(st, sites, towns);
    expect(c).toEqual([]);
  });
});
