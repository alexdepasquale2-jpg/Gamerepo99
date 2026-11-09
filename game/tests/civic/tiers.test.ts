import { describe, expect, it } from 'vitest';
import zonesJson from '../../src/data/civic/zones.json';
import { builtCount, crewTownOf, tierOf, townPopulation, unlockedIn } from '../../src/sim/civic/tiers';
import type { Site } from '../../src/sim/civic/sites';
import type { SimState } from '../../src/sim/types/runtime';

const GROWTH = zonesJson.growth;
const VILLAGE = zonesJson.tiers.find((t) => t.id === 'village')!;

/** A road crew's site, filed (as the registry does) under its road's first town. */
const crewSite = (id: string, townId: string, founded: number, status: Site['status'] = 'working'): Site => ({
  id: `site_fac_${id}`, districtId: 'd', townId, kind: 'mill', building: 'mill', name: 'mill', source: { type: 'facility', ref: id },
  plot: null, zone: 'craft', ownerId: 'x', managerId: 'x', workers: [], haulers: [], wage: 0, coin: 0,
  store: { capacity: 40, spoilage: 0, goods: {} } as unknown as Site['store'], status, founded, history: [], crewRun: true,
});

/** Two towns on one road: `far` (the road's first town) at q 0, `near` at q 100; every crew stands by `near`. */
function road(day: number, crews: number, extra: Partial<SimState> = {}): SimState {
  const facilities = Array.from({ length: crews }, (_, i) => ({ id: `f${i}`, kind: 'mill', name: `Mill ${i}`, q: 90, r: 0, townIds: ['far', 'near'] }));
  const sites = Object.fromEntries(facilities.map((f) => [`site_fac_${f.id}`, crewSite(f.id, 'far', 1)]));
  const people = Object.fromEntries(Array.from({ length: VILLAGE.pop }, (_, i) => [`p${i}`, { id: `p${i}`, name: `P${i} Test`, townId: 'near', flame: 50 }]));
  return {
    day, seed: 7, flags: {}, packets: [], player: { id: 'player', townId: 'near' }, people,
    towns: { far: { id: 'far', q: 0, r: 0 }, near: { id: 'near', q: 100, r: 0 } },
    data: { facilities }, civic: { sites }, build: { plans: [], claims: [], next: 1 },
    ...extra,
  } as unknown as SimState;
}

describe('civic tiers: town growth', () => {
  it('counts a road crew for the nearer of its two towns, not the road\'s first', () => {
    const s = road(1 + GROWTH.crewRampDays, 2);
    expect(crewTownOf(s, Object.values((s as unknown as { civic: { sites: Record<string, Site> } }).civic.sites)[0]!)).toBe('near');
    expect(builtCount(s, 'near')).toBe(2 * GROWTH.crewSite);
    expect(builtCount(s, 'far')).toBe(0);
    // Unmeasurable (a town not yet on the map): the road's first town, as the registry files it.
    delete (s.towns as Record<string, { q?: number }>)['far']!.q;
    expect(builtCount(s, 'far')).toBe(2 * GROWTH.crewSite);
  });

  it('grows a crew\'s weight over its first days, so a world\'s first crews make no village on day one', () => {
    expect(builtCount(road(1, 5), 'near')).toBe(0);
    expect(tierOf(road(1, 5), 'near').id).toBe('hamlet');
    // Whole buildings only: four crews halfway up their ramp make one.
    expect(builtCount(road(1 + GROWTH.crewRampDays / 2, 4), 'near')).toBe(1);
    expect(builtCount(road(1 + GROWTH.crewRampDays / 2 - 1, 4), 'near')).toBe(0);
    expect(builtCount(road(1 + GROWTH.crewRampDays * 3, 2), 'near')).toBe(1);
  });

  it('keeps a station between crews counted, and drops a closed one', () => {
    const s = road(1 + GROWTH.crewRampDays, 4);
    const sites = (s as unknown as { civic: { sites: Record<string, Site> } }).civic.sites;
    sites['site_fac_f0']!.status = 'idle';
    expect(builtCount(s, 'near')).toBe(2);
    sites['site_fac_f1']!.status = 'closed';
    sites['site_fac_f2']!.status = 'closed';
    expect(builtCount(s, 'near')).toBe(1);
    // A station reopened today starts its ramp again.
    sites['site_fac_f1']!.status = 'working';
    sites['site_fac_f1']!.history.push({ day: s.day, what: 'closed' });
    expect(builtCount(s, 'near')).toBe(1);
  });

  it('counts the households\' children toward population', () => {
    const s = road(10, 0, {
      kin: {
        households: [], lineages: {}, next: 3,
        children: [
          { id: 'c1', householdId: 'h', townId: 'near', given: 'A', surname: 'B', sex: 'm', parents: ['p0', 'p1'], born: 2, status: 'child' },
          { id: 'c2', householdId: 'h', townId: 'near', given: 'C', surname: 'B', sex: 'f', parents: ['p0', 'p1'], born: 3, status: 'adult', personId: 'p2' },
        ],
      },
    } as unknown as Partial<SimState>);
    // The grown child is a person already (p2), so only the one still a child adds.
    expect(townPopulation(s, 'near')).toBe(VILLAGE.pop + GROWTH.child);
  });

  it('opens village-tier workshops once the town reaches village', () => {
    const early = road(1, 4);
    expect(tierOf(early, 'near').id).toBe('hamlet');
    // The crews credited to 'near' put it on the registry: the site gate holds until village.
    expect(unlockedIn(early, 'near', 'smithy')).toBe(false);
    expect(unlockedIn(road(1, 0), 'near', 'smithy')).toBe(true); // never seen: the rules from before sites
    const later = road(1 + GROWTH.crewRampDays, 4);
    expect(tierOf(later, 'near').id).toBe('village');
    expect(unlockedIn(later, 'near', 'smithy')).toBe(true);
    expect(unlockedIn(later, 'near', 'pottery')).toBe(true);
  });
});
