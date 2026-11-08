import { describe, it, expect } from 'vitest';
import { createPlaySession } from '../../../src/sim';
import type { PlaySession } from '../../../src/sim/play-session/play-session';
import {
  FAMILIES, RING_MAX, SHORT_MAX, familyOf, flattenChips, groupVerbs, shortLabel, type Verb,
} from '../../../src/sim/play-session/verb-families';

const LEGACY = ['inspire', 'carry_burden', 'challenge', 'shame', 'lie'];

function session(seed = 42): PlaySession {
  const s = createPlaySession({ mode: 'play', seed, archetypeId: 'marrow' });
  if (!s || !('listVerbs' in s)) throw new Error('expected play session');
  s.start();
  return s;
}

const v = (id: string, family?: string, label = id): Verb => ({ id: `${id}@p`, label, family });

describe('verb families (ring grouping)', () => {
  it('families come from deeds.json, at most six, Speak first and tied to the talk choice set', () => {
    expect(FAMILIES.map((f) => f.id)).toEqual(['speak', 'help', 'give', 'promise', 'ask', 'deal']);
    expect(FAMILIES.length).toBeLessThanOrEqual(RING_MAX);
    expect(FAMILIES[0]!.choiceSetId).toBe('talk_choices');
  });

  it('a verb joins its own family, its deed family, an alias, or the family whose choice set lists it', () => {
    expect(familyOf({ id: 'talk_gentle@p' })).toBe('speak'); // catalog choiceSet talk_choices
    expect(familyOf({ id: 'talk_hard_shame@p' })).toBe('speak');
    expect(familyOf({ id: 'favor_do@p' })).toBe('help'); // deeds.json family
    expect(familyOf({ id: 'stash_hide@p', family: 'hoard' })).toBe('deal'); // alias
    expect(familyOf({ id: 'ask_past@p', family: 'ask' })).toBe('ask');
    expect(familyOf({ id: 'mystery@p' })).toBe('other');
  });

  it('six verbs or fewer show flat; more fold into family chips that open their verbs', () => {
    const few = [v('talk_gentle'), v('favor_do'), v('gift_give')];
    expect(groupVerbs(few).map((c) => c.id)).toEqual(few.map((x) => x.id));
    const many = [['talk_gentle', 'Speak gently'], ['talk_hard', 'Speak hard'], ['favor_do', 'Do a favor'], ['work_alongside', 'Work alongside'],
      ['gift_give', 'Give a gift'], ['promise_make', 'Make a promise'], ['favor_ask', 'Ask a favor']].map(([id, label]) => v(id!, undefined, label));
    const top = groupVerbs(many);
    expect(top.map((c) => c.label)).toEqual(['Speak', 'Help', 'Give a gift', 'Make a promise', 'Ask a favor']);
    expect(top[0]!.verbs!.map((c) => c.id)).toEqual(['talk_gentle@p', 'talk_hard@p']);
    // A family of one shows its verb directly, not a one-chip family.
    expect(top[2]!.id).toBe('gift_give@p');
    expect(top[2]!.verbs).toBeUndefined();
    expect(flattenChips(top).map((c) => c.id).sort()).toEqual(many.map((x) => x.id).sort());
  });

  it('never more than six chips on a level, without dropping a verb that fits', () => {
    const big = Array.from({ length: 30 }, (_, i) => v(`x${i}`, ['speak', 'help', 'give', 'promise', 'ask', 'deal', 'other', 'zzz'][i % 8]));
    const top = groupVerbs(big);
    expect(top.length).toBeLessThanOrEqual(RING_MAX);
    for (const c of top) expect((c.verbs ?? []).length).toBeLessThanOrEqual(RING_MAX);
    expect(flattenChips(top)).toHaveLength(30);
  });

  it('chip text is at most 16 characters; the long label stays as the tip', () => {
    expect(shortLabel({ label: 'Work alongside (mend, harvest)', short: 'Work alongside' })).toBe('Work alongside');
    const cut = shortLabel({ label: 'Accept the Wardens deal (caravan)' });
    expect(cut.length).toBeLessThanOrEqual(SHORT_MAX);
    expect(cut.endsWith('…')).toBe(true);
    const [chip] = groupVerbs([{ id: 'introduce@p', label: 'Introduce to someone you met', short: 'Introduce' }]);
    expect(chip).toMatchObject({ label: 'Introduce', tip: 'Introduce to someone you met' });
  });
});

describe('the ring for every person in the known world', () => {
  it('no legacy method chips, ≤6 chips per level, every verb reachable, short labels', () => {
    const s = session();
    for (const p of s.listPeople()) {
      const verbs = s.listVerbs({ kind: 'person', id: p.id });
      for (const x of verbs) expect(LEGACY).not.toContain(x.id.slice(0, x.id.indexOf('@')));
      const top = groupVerbs(verbs);
      expect(top.length).toBeLessThanOrEqual(RING_MAX);
      for (const c of top) {
        expect(c.label.length).toBeLessThanOrEqual(SHORT_MAX);
        for (const sub of c.verbs ?? []) expect(sub.label.length).toBeLessThanOrEqual(SHORT_MAX);
        expect((c.verbs ?? []).length).toBeLessThanOrEqual(RING_MAX);
      }
      expect(flattenChips(top).map((c) => c.id).sort()).toEqual(verbs.map((x) => x.id).sort());
    }
  });

  it('surfaces the talk verbs by name and drops the method duplicates', () => {
    const s = session();
    const pid = s.listPeople()[0]!.id;
    const verbs = s.listVerbs({ kind: 'person', id: pid });
    const label = (verb: string) => verbs.find((x) => x.id === `${verb}@${pid}`)?.label;
    expect(label('talk_gentle')).toBe('Speak gently');
    expect(label('talk_hard')).toBe('Speak hard');
    expect(label('talk_hard_shame')).toBe('Shame them');
    // carry_burden = favor_do and challenge = stand_up: one chip each.
    expect(verbs.filter((x) => /^(favor_do|carry_burden)@/.test(x.id)).map((x) => x.id)).toEqual([`favor_do@${pid}`]);
    expect(verbs.filter((x) => /^(stand_up|challenge)@/.test(x.id)).map((x) => x.id)).toEqual([`stand_up@${pid}`]);
  });
});
