import { afterEach, describe, expect, it } from 'vitest';
import { createPlaySession } from '../../src/sim';
import type { PlaySession } from '../../src/sim/play-session/play-session';
import { collectDawnLines } from '../../src/sim/dawn-lines';
import { boardPages } from '../../src/sim/board-pages';
import { KIN, voiceOf, type KinState } from '../../src/sim/economy/households';
import { householdDawnLines } from '../../src/sim/contrib/households';
import { houseNewcomers } from '../../src/sim/map/residency';
import type { Building } from '../../src/sim/map/interiors';
import { SURFACED } from '../../src/ui/surface/reaction-lines';

const saved = { ...KIN };
afterEach(() => Object.assign(KIN, saved));

function session(): PlaySession {
  const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' }) as PlaySession;
  s.start({ seed: 42, archetypeId: 'marrow' });
  return s;
}

/** A household in the player's town made of two real villagers, set up before any dawn pairs people. */
function plantHousehold(s: PlaySession): { kin: KinState; mother: string; father: string; townId: string } {
  const st = s.getState()!;
  const townId = st.player.townId!;
  const folk = Object.values(st.people).filter((p) => p.townId === townId).map((p) => p.id).sort();
  const [father, mother] = folk;
  const kin: KinState = (st.kin ??= { households: [], children: [], lineages: {}, next: 1 });
  kin.households.push({ id: 'hh_t', townId, adults: [father!, mother!], surname: 'Tallow', generation: 1, formed: st.day, kids: [] });
  kin.lineages.Tallow = { surname: 'Tallow', founders: [father!, mother!], founded: st.day, generation: 1 };
  return { kin, mother: mother!, father: father!, townId };
}

describe('births and newcomers are live', () => {
  it('a child who comes of age is a person you can see, name and act on, and a parent tells you at dawn', () => {
    const s = session();
    const st = s.getState()!;
    const { kin, townId } = plantHousehold(s);
    kin.children.push({ id: 'kid_t', householdId: 'hh_t', townId, given: 'Wren', surname: 'Tallow', sex: 'f', parents: kin.households[0]!.adults, born: st.day + 1 - KIN.comeOfAgeDays, status: 'child' });
    kin.households[0]!.kids.push('kid_t');
    const before = s.listPeople().length;

    s.tick();

    const grown = kin.children.find((c) => c.id === 'kid_t')!;
    expect(grown.status).toBe('adult');
    expect(grown.grown).toBe(st.day);
    const view = s.listPeople().find((p) => p.id === grown.personId);
    expect(view).toMatchObject({ name: 'Wren Tallow', townId });
    expect(s.listPeople().length).toBeGreaterThan(before);

    // They are in the interaction runtime: chips are offered and a deed actually resolves on them.
    const acts = s.listActions().filter((a) => a.id.endsWith(`@${grown.personId}`));
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.map((a) => a.id)).toContain(`inspire@${grown.personId}`);
    s.act(`inspire@${grown.personId}`);
    expect(s.lastResolve()).toMatchObject({ personId: grown.personId });

    const lines = collectDawnLines(st);
    const voice = voiceOf(st, grown)!;
    expect(lines).toContain(`${st.people[voice]!.name!.split(' ')[0]} says Wren Tallow is grown now, and out among the neighbours.`);
    // Their own bubble on coming of age speaks from the data file.
    expect(SURFACED['kin.grown']!({ personId: grown.personId }, {})).toMatchObject({ kind: 'line', personId: grown.personId });
    expect(SURFACED['kin.grown']!({ personId: grown.personId }, {})!.line).toBeTruthy();
  });

  it('a birth in your town is told at dawn as news from the household, and bubbles over a parent', () => {
    KIN.birthChance = 1;
    KIN.settleDays = 0;
    KIN.birthSecurity = 0;
    const s = session();
    const st = s.getState()!;
    const { kin } = plantHousehold(s);
    const mother = voiceOf(st, { parents: kin.households[0]!.adults })!;
    const juice: { id: string; payload: { personId?: string; line?: string } }[] = [];
    s.onJuice((id, payload) => { if (id.startsWith('kin.')) juice.push({ id, payload: payload as { personId?: string; line?: string } }); });

    s.tick();

    const child = kin.children.find((c) => c.householdId === 'hh_t')!;
    expect(child).toBeDefined();
    expect(child.born).toBe(st.day);
    expect(householdDawnLines(st)).toContain(`${st.people[mother]!.name}'s household has a new child, named ${child.given}.${child.gift ? ` There's something bright about ${child.sex === 'f' ? 'her' : 'him'}, they say.` : ''}`);
    const birth = juice.find((j) => j.id === 'kin.birth' && j.payload.personId === mother);
    expect(birth?.payload.line).toContain(child.given);
    expect(SURFACED['kin.birth']!(birth!.payload, {})).toMatchObject({ kind: 'line', personId: mother });

    // Next dawn the news is old: nobody repeats it.
    KIN.birthChance = 0;
    s.tick();
    expect(householdDawnLines(st).some((l) => l.includes(child.given))).toBe(false);
  });

  it('the Families board page lists households, little ones and the grown', () => {
    const s = session();
    const st = s.getState()!;
    const { kin, townId, mother } = plantHousehold(s);
    kin.children.push({ id: 'kid_a', householdId: 'hh_t', townId, given: 'Pip', surname: 'Tallow', sex: 'm', parents: kin.households[0]!.adults, born: st.day, status: 'child' });
    kin.households[0]!.kids.push('kid_a');
    const page = boardPages().find((p) => p.id === 'families')!;
    const text = page.render(st, townId, (id) => id).lines!.join('\n');
    expect(text).toContain('The Tallows');
    expect(text).toContain(st.people[mother]!.name!.split(' ')[0]!);
    expect(text).toContain('little ones: Pip');
  });

  it('newcomers take a free house without moving anyone already housed', () => {
    const b = (id: string): Building => ({ id, townId: 't', kind: 'house', door: { x: 0, y: 0 } } as unknown as Building);
    const list = [b('h1'), b('h2'), b('h3')];
    const homes = new Map<string, Building>([['ann', list[0]!], ['bob', list[1]!], ['gone', list[2]!]]);
    expect(houseNewcomers(homes, list, ['ann', 'bob', 'zed', 'cat'])).toEqual(['cat']);
    expect(homes.get('ann')!.id).toBe('h1');
    expect(homes.get('bob')!.id).toBe('h2');
    expect(homes.get('cat')!.id).toBe('h3');
    expect(homes.has('gone')).toBe(false);
    expect(homes.has('zed')).toBe(false);
  });
});
