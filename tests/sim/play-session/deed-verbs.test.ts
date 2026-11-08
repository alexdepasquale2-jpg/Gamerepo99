import { describe, it, expect } from 'vitest';
import { createPlaySession } from '../../../src/sim';
import type { PlaySession } from '../../../src/sim/play-session/play-session';
import { DEEDS } from '../../../src/sim/play-session/play-session-act';
import { applyDeedGoods } from '../../../src/sim/goods/deed-goods';
import { inventoryOf } from '../../../src/sim/goods/inventory';
import type { SimState } from '../../../src/sim/types/runtime';

function playSession(seed = 42): { s: PlaySession; st: SimState; pid: string } {
  const s = createPlaySession({ mode: 'play', seed, archetypeId: 'marrow' });
  if (!s || !('lastResolve' in s)) throw new Error('expected play session');
  s.start();
  const st = s.getState()! as SimState;
  // Someone who trusts you enough to be asked for a favor.
  const pid = s.listPeople().map((p) => p.id).find((id) => (st.people[id]!.trust ?? 0.35) >= 0.25)!;
  return { s, st, pid };
}

const chips = (s: PlaySession, pid: string): string[] =>
  s.listActions().filter((a) => a.id.endsWith('@' + pid)).map((a) => a.id.slice(0, a.id.indexOf('@')));

function act(s: PlaySession, id: string): { juice: { id: string; payload: Record<string, unknown> }[] } {
  const juice: { id: string; payload: Record<string, unknown> }[] = [];
  const off = s.onJuice((jid, p) => juice.push({ id: jid, payload: p as Record<string, unknown> }));
  s.act(id);
  off();
  return { juice };
}

const reactionLine = (j: { id: string; payload: Record<string, unknown> }[]): string | undefined =>
  j.find((x) => x.id === 'person.reaction')?.payload.line as string | undefined;
const unspokenClasses = (st: SimState, pid: string): string[] =>
  (st.unspoken?.instances ?? []).filter((x) => x.sourcePersonId === pid).map((x) => x.classId);

describe('missing verbs: ask a favor, show up, empty cheer, return', () => {
  it('deeds.json carries the four new verbs with labels', () => {
    const byId = new Map(DEEDS.map((d) => [d.id, d.label]));
    expect(byId.get('favor_ask')).toBe('Ask a favor');
    expect(byId.get('show_up')).toBe('Show up');
    expect(byId.get('talk_empty_cheer')).toMatch(/empty/i);
    expect(byId.get('return_item')).toMatch(/Return/);
  });

  it('ask a favor, show up and empty cheer are offered; return is not until you hold something of theirs', () => {
    const { s, pid } = playSession();
    const c = chips(s, pid);
    expect(c).toEqual(expect.arrayContaining(['favor_ask', 'show_up', 'talk_empty_cheer']));
    expect(c).not.toContain('return_item');
  });

  it('show up resolves through the interaction model, leaves presence + its unspoken, then waits for tomorrow', () => {
    const { s, st, pid } = playSession();
    const { juice } = act(s, `show_up@${pid}`);
    expect(s.events()).toContainEqual({ type: 'interaction', methodId: 'show_up' });
    expect(reactionLine(juice)).toMatch(/came|room|here again/);
    expect(unspokenClasses(st, pid)).toContain('unspoken_show_presence');
    expect(chips(s, pid)).not.toContain('show_up');
    s.act('advance:day');
    expect(chips(s, pid)).toContain('show_up');
  });

  it('presence accrues across days: the third show-up lands the threshold warmth', () => {
    const { s, st, pid } = playSession();
    const flames: number[] = [];
    for (let d = 0; d < 3; d++) {
      const before = st.people[pid]!.flame;
      s.act(`show_up@${pid}`);
      flames.push(st.people[pid]!.flame - before);
      s.act('advance:day');
    }
    // show_up touch is empty; only the presence>=3 bonus (+0.05 flame01) warms them.
    expect(flames[2]!).toBeGreaterThan(flames[0]!);
  });

  it('ask a favor is gated by trust and by once a day; they lend you something to return', () => {
    const { s, st, pid } = playSession();
    const trust = st.people[pid]!.trust;
    st.people[pid]!.trust = 0.1;
    expect(chips(s, pid)).not.toContain('favor_ask');
    st.people[pid]!.trust = trust ?? 0.35;
    expect(chips(s, pid)).toContain('favor_ask');

    const { juice } = act(s, `favor_ask@${pid}`);
    expect(s.events()).toContainEqual({ type: 'interaction', methodId: 'favor_ask' });
    expect(reactionLine(juice)).toBeTruthy();
    expect(unspokenClasses(st, pid)).toContain('unspoken_favor_asked');
    expect(chips(s, pid)).not.toContain('favor_ask');

    const loan = st.loans?.find((l) => l.fromPersonId === pid);
    expect(loan).toBeTruthy();
    if (!loan) return;
    expect(reactionLine(juice)).toMatch(/Lends you/);
    expect(chips(s, pid)).toContain('return_item');
    const held = inventoryOf(st)[loan.itemId] ?? 0;
    const r = act(s, `return_item@${pid}`);
    expect(s.events()).toContainEqual({ type: 'interaction', methodId: 'return_item' });
    expect(reactionLine(r.juice)).toMatch(/brought it back/);
    expect(inventoryOf(st)[loan.itemId] ?? 0).toBe(held - 1);
    expect(st.loans?.some((l) => l.fromPersonId === pid)).toBe(false);
    expect(unspokenClasses(st, pid)).toContain('unspoken_returned_faith');
    expect(chips(s, pid)).not.toContain('return_item');
  });

  it('some person lends something in this village (the favor→return loop is reachable)', () => {
    const { s, st } = playSession();
    for (const p of s.listPeople()) if (chips(s, p.id).includes('favor_ask')) s.act(`favor_ask@${p.id}`);
    expect((st.loans ?? []).length).toBeGreaterThan(0);
  });

  it('return hands back cargo they gave you to carry', () => {
    const { s, st, pid } = playSession();
    const r = applyDeedGoods(st, 'carry_goods', pid)!;
    expect(r.ok).toBe(true);
    const c = st.cargo!.find((x) => x.fromPersonId === pid)!;
    expect(chips(s, pid)).toContain('return_item');
    const before = inventoryOf(st)[c.itemId] ?? 0;
    const { juice } = act(s, `return_item@${pid}`);
    expect(reactionLine(juice)).toMatch(/could have kept it/);
    expect(inventoryOf(st)[c.itemId] ?? 0).toBe(before - c.qty);
    expect(st.cargo!.some((x) => x.fromPersonId === pid)).toBe(false);
  });

  it('return is not offered (and does nothing) once their cargo has left your satchel', () => {
    const { s, st, pid } = playSession();
    applyDeedGoods(st, 'carry_goods', pid);
    const c = st.cargo!.find((x) => x.fromPersonId === pid)!;
    inventoryOf(st)[c.itemId] = 0;
    expect(chips(s, pid)).not.toContain('return_item');
    s.act(`return_item@${pid}`);
    expect(s.events()).not.toContainEqual({ type: 'interaction', methodId: 'return_item' });
    expect(st.cargo!.length).toBe(1);
  });

  it('empty cheer resolves through the interaction model and leaves its burden-leaning unspoken', () => {
    const { s, st, pid } = playSession();
    const { juice } = act(s, `talk_empty_cheer@${pid}`);
    expect(s.lastResolve()?.kind).toBe('resolved');
    expect(s.events()).toContainEqual({ type: 'interaction', methodId: 'talk_empty_cheer' });
    expect(reactionLine(juice)).toMatch(/reach the eyes|looks away|Nothing changes/);
    expect(unspokenClasses(st, pid)).toContain('unspoken_empty_cheer');
    expect(chips(s, pid)).not.toContain('talk_empty_cheer');
  });

  it('empty cheer fails on someone hollowed out: they see through it', () => {
    const { s, st, pid } = playSession();
    st.people[pid]!.marks = [...(st.people[pid]!.marks ?? []), { markId: 'hollowness', stacks: 1 }];
    const { juice } = act(s, `talk_empty_cheer@${pid}`);
    const flick = juice.find((j) => j.id === 'refusal.coal_flicker');
    expect(flick).toBeTruthy();
    expect(s.events()).not.toContainEqual({ type: 'interaction', methodId: 'talk_empty_cheer' });
    expect(s.lastResolve()?.kind).toBe('refused');
    expect(chips(s, pid)).not.toContain('talk_empty_cheer');
  });

  it('daily gates live in state.flags and reset by day number', () => {
    const { s, st, pid } = playSession();
    s.act(`show_up@${pid}`);
    expect((st.flags.deedUsedDay as Record<string, number>)[`show_up@${pid}`]).toBe(st.day);
    st.day += 1;
    expect(chips(s, pid)).toContain('show_up');
  });
});
