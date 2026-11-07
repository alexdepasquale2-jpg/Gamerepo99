import { describe, expect, it } from 'vitest';
import { townBuildings } from '../../../src/sim/map/interiors';
import { isIndoorsAt, phaseRow, placeAt, residences, scheduledBuilding, scheduledResidents } from '../../../src/sim/map/residency';
import type { LayoutSettlement } from '../../../src/sim/map/world-layout';

const town: LayoutSettlement = { id: 't1', q: 300, r: 80, kind: 'town' };
const village: LayoutSettlement = { id: 'v1', q: 100, r: 50, kind: 'village' };
const people = ['zed', 'amy', 'bob', 'cy', 'dee'];

describe('residency schedule', () => {
  it('every phase names a place and a valid inside list', () => {
    for (let t = 0; t < 1; t += 0.01) {
      const row = phaseRow(t);
      expect(['home', 'work', 'gather']).toContain(row.place);
      for (const k of row.inside) expect(['house', 'shop', 'inn']).toContain(k);
    }
  });

  it('everyone is at home overnight, shopkeepers stay at their post by day, and nobody is in at the noon gathering', () => {
    expect(placeAt(0.05)).toBe('home');
    for (const k of ['house', 'shop', 'inn'] as const) expect(isIndoorsAt(k, 0.9)).toBe(true);
    expect(isIndoorsAt('house', 0.3)).toBe(false);
    expect(isIndoorsAt('shop', 0.3)).toBe(true);
    for (const k of ['house', 'shop', 'inn'] as const) expect(isIndoorsAt(k, 0.5)).toBe(false);
    expect(isIndoorsAt('inn', 0.75)).toBe(true);
    expect(isIndoorsAt('shop', 0.75)).toBe(false);
  });

  it('wraps the clock', () => {
    expect(phaseRow(1.05)).toBe(phaseRow(0.05));
    expect(phaseRow(-0.1)).toBe(phaseRow(0.9));
  });
});

describe('who is home', () => {
  const bs = townBuildings(village);
  const homes = residences(bs, people);

  it('maps the first residents (sorted by id) to buildings and leaves the rest without one', () => {
    expect([...homes.keys()].sort()).toEqual(['amy', 'bob', 'cy']);
    expect(homes.get('amy')!.id).toBe('v1:0');
    expect(homes.has('zed')).toBe(false);
  });

  it('a person is scheduled inside only when their building is occupied at that hour', () => {
    expect(scheduledBuilding('amy', homes, 0.05)?.id).toBe('v1:0');
    expect(scheduledBuilding('amy', homes, 0.3)).toBeNull(); // out working
    expect(scheduledBuilding('zed', homes, 0.05)).toBeNull(); // no building -> always outdoors
  });

  it('a room lists exactly the people the schedule puts in it - never someone who is out', () => {
    const t = townBuildings(town);
    const present = (hour: number) => t.map((b) => scheduledResidents(b, t, people, hour));
    expect(present(0.9)).toEqual([['amy'], ['bob'], ['cy']]);
    expect(present(0.3)).toEqual([['amy'], ['bob'], ['cy']]); // shop, inn, shop keepers on shift
    expect(present(0.5)).toEqual([[], [], []]);
    expect(present(0.75)).toEqual([[], ['bob'], []]);
    // Consistency: whoever a room lists is scheduledBuilding'd to that very room, and nobody else is.
    const tHomes = residences(t, people);
    for (const hour of [0.05, 0.3, 0.5, 0.6, 0.75, 0.95]) {
      for (const p of people) {
        const inside = t.filter((b) => scheduledResidents(b, t, people, hour).includes(p));
        expect(inside.length).toBeLessThanOrEqual(1);
        expect(inside[0]?.id ?? null).toBe(scheduledBuilding(p, tHomes, hour)?.id ?? null);
      }
    }
  });
});
