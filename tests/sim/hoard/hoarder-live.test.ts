import { describe, expect, it } from 'vitest';
import { createPlaySession } from '../../../src/sim';
import type { PlaySession } from '../../../src/sim/play-session/play-session';
import { STASH_LABELS, stashActions, stashDawnLines } from '../../../src/sim/contrib/stash';
import { collectDawnLines } from '../../../src/sim/dawn-lines';
import { applyStashAct, detectEnding, ensureHoard, hoardEndingOpen, tickStashDawn } from '../../../src/sim/hoard';
import { chooseHoardEnding, hoardEndingView } from '../../../src/sim/hoard/ending';
import { ensureStash, siteInTown } from '../../../src/sim/hoard/state';
import { tickGuardUpkeep } from '../../../src/sim/hoard/events';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { advanceToDawn } from '../../../src/sim/scenario/scenario-advance';
import { presentJuice } from '../../../src/ui/surface';
import { ensureLegacy } from '../../../src/sim/legacy';

function session(): PlaySession {
  const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' }) as PlaySession;
  s.start({ seed: 42, archetypeId: 'marrow' });
  return s;
}

/** Someone who lives in the player's town (the default world's start town has a stash site). */
function neighbour(s: PlaySession): string {
  const st = s.getState()!;
  return Object.keys(st.people).sort().find((id) => st.people[id]!.townId === st.player.townId)!;
}

const chipIds = (s: PlaySession, pid: string): string[] =>
  s.listActions().filter((a) => a.id.endsWith('@' + pid) && a.id.startsWith('stash_')).map((a) => a.id.slice(0, a.id.indexOf('@')));

describe('hoarder chips in the ring', () => {
  it('every town the default world can hold has a stash site', () => {
    const st = session().getState()!;
    for (const t of Object.keys(st.towns ?? {})) expect(siteInTown(st, t), t).toBeDefined();
  });

  it('hide is offered only with coin in hand; guard and dig-up only once something is stashed', () => {
    const s = session();
    const st = s.getState()!;
    const pid = neighbour(s);
    st.player.coin = 0;
    expect(chipIds(s, pid)).toEqual([]);
    st.player.coin = 50;
    expect(chipIds(s, pid)).toEqual(['stash_hide']);
    const chip = s.listActions().find((a) => a.id === `stash_hide@${pid}`)!;
    expect(chip.label).toBe(STASH_LABELS.stash_hide);

    st.player.spark = 100;
    s.act(`stash_hide@${pid}`);
    const site = siteInTown(st, st.player.townId)!;
    expect(st.hoard!.stash[site.id]!.coin).toBe(25);
    expect(st.player.coin).toBe(25);
    expect(chipIds(s, pid)).toEqual(expect.arrayContaining(['stash_hide', 'stash_guard_hire', 'stash_withdraw']));

    s.act(`stash_guard_hire@${pid}`);
    expect(st.hoard!.stash[site.id]!.guardsHired).toBe(1);
    expect(chipIds(s, pid)).not.toContain('stash_guard_hire'); // the one slot is filled
  });

  it('people in other towns, and people who distrust you, offer nothing', () => {
    const s = session();
    const st = s.getState()!;
    st.player.coin = 50;
    const away = Object.keys(st.people).find((id) => st.people[id]!.townId !== st.player.townId)!;
    expect(chipIds(s, away)).toEqual([]);
    const pid = neighbour(s);
    expect(stashActions(st, pid, () => 0.05)).toEqual([]);
    expect(stashActions(st, pid, () => 0.5).map((a) => a.id)).toEqual([`stash_hide@${pid}`]);
  });

  it('food can be hidden too, and digging up returns coin and goods', () => {
    const s = session();
    const st = s.getState()!;
    const pid = neighbour(s);
    st.player.coin = 0;
    st.inventory = { bread: 3, grain: 2, keepsake: 1 };
    expect(chipIds(s, pid)).toEqual(['stash_store']);
    st.player.spark = 100;
    s.act(`stash_store@${pid}`);
    const stash = st.hoard!.stash[siteInTown(st, st.player.townId)!.id]!;
    expect(stash.goods).toEqual({ bread: 3, grain: 2 });
    expect(st.inventory).toEqual({ keepsake: 1 });
    s.act(`stash_withdraw@${pid}`);
    expect(st.inventory).toMatchObject({ bread: 3, grain: 2, keepsake: 1 });
    expect(stash.goods).toEqual({});
  });

  it('the helper speaks: stash juice carries their id and surfaces as their line', () => {
    const s = session();
    const st = s.getState()!;
    const pid = neighbour(s);
    st.player.coin = 30;
    const seen: { id: string; p: unknown }[] = [];
    const off = s.onJuice((id, p) => seen.push({ id, p }));
    s.act(`stash_hide@${pid}`);
    off();
    const hidden = seen.find((e) => e.id === 'stash.hidden')!;
    expect(hidden).toBeDefined();
    const shown = presentJuice('stash.hidden', hidden.p);
    expect(shown?.personId).toBe(pid);
    expect(shown?.line).toBeTruthy();
  });
});

describe('theft, rot and a guard walking off are heard at dawn', () => {
  const boot = () => {
    const b = bootPlayState(42, 'marrow');
    return { ...b, site: siteInTown(b.state, b.state.player.townId)! };
  };

  it('theft surfaces as juice through a neighbour and as a dawn line', () => {
    const { state, site } = boot();
    ensureHoard(state).notoriety = 1;
    ensureStash(state, site.id).coin = 50;
    let d = 1;
    for (; d < 60; d++) {
      state.day = d;
      delete state.hoard!.news;
      if (tickStashDawn(state).stolen.length) break;
    }
    expect(d).toBeLessThan(60);
    const news = state.hoard!.news!.find((n) => n.kind === 'theft')!;
    expect(news.personId).toBeTruthy();
    expect(presentJuice('stash.theft', { personId: news.personId, townId: site.townId })?.personId).toBe(news.personId);
    const lines = stashDawnLines(state);
    expect(lines.some((l) => /someone has been at/.test(l) && l.includes(String(news.coin)))).toBe(true);
  });

  it('a small pile of food still rots over a few dawns, and says so', () => {
    const { state, site } = boot();
    ensureStash(state, site.id).goods = { bread: 6 };
    const rotted: string[] = [];
    for (let i = 0; i < 10; i++) {
      advanceToDawn(state);
      rotted.push(...stashDawnLines(state).filter((l) => /damp/.test(l)));
    }
    expect(state.hoard!.stash[site.id]!.goods.bread ?? 0).toBeLessThan(6);
    expect(rotted.length).toBeGreaterThan(0);
    expect(presentJuice('stash.decay', { townId: site.townId }, { nearbyPersonId: () => 'n' })?.personId).toBe('n');
  });

  it('an unpaid guard leaves and a neighbour tells you', () => {
    const { state, site } = boot();
    const s = ensureStash(state, site.id);
    s.coin = 0;
    s.goods = { bread: 1 };
    s.guardsHired = 1;
    state.player.coin = 0;
    tickGuardUpkeep(state);
    expect(s.guardsHired).toBe(0);
    expect(stashDawnLines(state).some((l) => /walked off/.test(l))).toBe(true);
    expect(presentJuice('stash.guard_left', { personId: 'x' })?.line).toBeTruthy();
  });

  it('dawn lines reach the shared collector', () => {
    const { state, site } = boot();
    ensureHoard(state).news = [{ day: state.day, kind: 'guard_left', siteId: site.id, townId: site.townId, personId: Object.keys(state.people)[0] }];
    expect(collectDawnLines(state).some((l) => /walked off/.test(l))).toBe(true);
  });
});

describe('the hoard ending', () => {
  /** A scripted hoarder: hides every coin it is handed, never lights anyone, rests. */
  function hoarderRun(dawns: number): PlaySession {
    const s = session();
    const st = s.getState()!;
    const pid = neighbour(s);
    for (let d = 0; d < dawns && !hoardEndingOpen(st); d++) {
      st.player.spark = 100;
      st.player.coin = (st.player.coin ?? 0) + 30;
      if (s.listActions().some((a) => a.id === `stash_hide@${pid}`)) s.act(`stash_hide@${pid}`);
      s.tick();
    }
    return s;
  }

  it('is offered after the hoard has held a few dawns, with lines about the hoard and the towns', () => {
    const s = hoarderRun(12);
    const st = s.getState()!;
    expect(detectEnding(st)).toBe('ash_hoard');
    expect(hoardEndingOpen(st)).toBe(true);
    const view = hoardEndingView(st)!;
    expect(view.title).toBe('The hoard');
    expect(view.lines.join(' ')).toMatch(/coin lies in the .* It bought you quiet/);
    expect(view.lines.at(-1)).toMatch(/^Meanwhile: /);
    expect(view.buttons).toEqual({ continue: 'Carry on', quit: 'Let it rest' });
    expect(st.ended).toBeUndefined();
  });

  it('"Carry on" sets it aside for this life and play continues', () => {
    const s = hoarderRun(12);
    const st = s.getState()!;
    expect(chooseHoardEnding(st, 'continue').ok).toBe(true);
    expect(hoardEndingView(st)).toBeNull();
    s.tick();
    s.tick();
    expect(hoardEndingOpen(st)).toBe(false);
    expect(st.ended).toBeUndefined();
  });

  it('"Let it rest" ends the run warmly with the ash_hoard imprint', () => {
    const s = hoarderRun(12);
    const st = s.getState()!;
    const res = chooseHoardEnding(st, 'quit');
    expect(res.ok).toBe(true);
    expect(res.restedLine).toBeTruthy();
    expect(st.ended).toBe('rest');
    expect(st.flags.ending).toBe('ash_hoard');
    expect(ensureLegacy(st).lastImprint?.ending).toBe('ash_hoard');
    expect(hoardEndingView(st)).toBeNull();
    expect(chooseHoardEnding(st, 'quit').ok).toBe(false);
  });

  it('is never offered to someone who lit a fire', () => {
    const s = hoarderRun(0);
    const st = s.getState()!;
    st.player.coin = 50;
    applyStashAct(st, 'stash_hide');
    ensureHoard(st).reigniteCount = 1;
    for (let i = 0; i < 6; i++) s.tick();
    expect(hoardEndingOpen(st)).toBe(false);
  });
});
