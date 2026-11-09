// Lanterns lit in older saves (keyed `town:planIndex`) move to the stable slot id only when the save's lot
// is still the same building — same kind, same door — in today's plan; otherwise the flag is dropped.
import { describe, expect, it } from 'vitest';
import { adoptLegacyBuildingFlags, legacyBuildingsOf } from '../../src/sim/map/building-ids';
import { townBuildings, type Building } from '../../src/sim/map/interiors';
import type { LayoutSettlement } from '../../src/sim/map/world-layout';
import type { SimState } from '../../src/sim/types/runtime';

const stateWith = (lit: Record<string, boolean>): SimState => ({ flags: { lanternLit: { ...lit } } }) as unknown as SimState;
const lit = (s: SimState): Record<string, boolean> => s.flags.lanternLit as Record<string, boolean>;
const sameLot = (a: Building | undefined, b: Building): boolean => !!a && a.kind === b.kind && a.door.x === b.door.x && a.door.y === b.door.y;

/** A road running right through the middle of the town box both ways: the plan has to move lots off it. */
const crossLanes = (): { q: number; r: number }[] => {
  const out: { q: number; r: number }[] = [];
  for (let i = -12; i <= 12; i++) out.push({ q: i, r: 1 }, { q: 1, r: i });
  return out;
};

describe('adoptLegacyBuildingFlags', () => {
  it('keeps every lantern when the plan is the one the save was made with', () => {
    const town: LayoutSettlement = { id: 'oakby', q: 120, r: 80, kind: 'town' };
    const today = townBuildings(town);
    expect(today.length).toBeGreaterThan(1);
    const s = stateWith(Object.fromEntries(today.map((b) => [b.legacyId, true])));
    const moved = adoptLegacyBuildingFlags(s, today, [town]);
    expect(moved).toBe(today.length);
    for (const b of today) expect(lit(s)[b.id], b.id).toBe(true);
    expect(Object.keys(lit(s)).some((k) => /:\d+$/.test(k))).toBe(false);
  });

  it('moves a lantern to the building on its old lot, and drops one whose lot no building stands on now', () => {
    // Search a few towns for one where the road moved some lots but not all (deterministic: fixed seeds).
    let found: { town: LayoutSettlement; keep: Building; keptTo: Building; drop: Building } | null = null;
    for (let k = 0; k < 40 && !found; k++) {
      const town: LayoutSettlement = { id: `cross${k}`, q: 60 + k * 31, r: 40 + k * 17, kind: k % 2 ? 'town' : 'village', lanes: crossLanes() };
      const today = townBuildings(town);
      const then = [...legacyBuildingsOf(town).values()];
      const keep = then.find((t) => today.some((b) => sameLot(t, b)));
      const drop = then.find((t) => !today.some((b) => sameLot(t, b)));
      if (keep && drop) found = { town, keep, keptTo: today.find((b) => sameLot(keep, b))!, drop };
    }
    expect(found, 'a town whose road moved some lots').toBeTruthy();
    const { town, keep, keptTo, drop } = found!;
    const today = townBuildings(town);
    const s = stateWith({ [keep.legacyId]: true, [drop.legacyId]: true });
    const moved = adoptLegacyBuildingFlags(s, today, [town]);
    expect(moved).toBe(1);
    expect(lit(s)[keptTo.id]).toBe(true);
    // Only the kept lantern is lit anywhere in the town: the dropped one did not land on another building.
    expect(Object.entries(lit(s)).filter(([, v]) => v).map(([k]) => k)).toEqual([keptTo.id]);
  });

  it('drops a lantern whose old index now names a different building (no silent move)', () => {
    let found: { town: LayoutSettlement; at: Building } | null = null;
    for (let k = 0; k < 40 && !found; k++) {
      const town: LayoutSettlement = { id: `shift${k}`, q: 90 + k * 23, r: 70 + k * 29, kind: k % 2 ? 'village' : 'town', lanes: crossLanes() };
      const then = legacyBuildingsOf(town);
      // Today's building i stands where the save's building i did not, and the save's lot is gone.
      const at = townBuildings(town).find((b) => { const t = then.get(b.legacyId); return t && !sameLot(t, b) && !townBuildings(town).some((x) => sameLot(t, x)); });
      if (at) found = { town, at };
    }
    expect(found, 'a town where an index changed hands').toBeTruthy();
    const { town, at } = found!;
    const s = stateWith({ [at.legacyId]: true });
    expect(adoptLegacyBuildingFlags(s, townBuildings(town), [town])).toBe(0);
    expect(lit(s)[at.id]).toBeUndefined();
    expect(Object.keys(lit(s))).toEqual([]);
  });

  it('drops a legacy key that names no building today, and never overwrites a stable id', () => {
    const town: LayoutSettlement = { id: 'fenmoor', q: 300, r: 210, kind: 'village' };
    const today = townBuildings(town);
    const b = today[0]!;
    const s = stateWith({ [b.legacyId]: true, [b.id]: false, 'fenmoor:99': true, 'elsewhere:2': true });
    adoptLegacyBuildingFlags(s, today, [town]);
    expect(lit(s)[b.id]).toBe(false);
    expect(lit(s)['fenmoor:99']).toBeUndefined();
    // Another town's keys wait for that town's buildings.
    expect(lit(s)['elsewhere:2']).toBe(true);
  });
});
