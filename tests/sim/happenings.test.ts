import { describe, expect, it } from 'vitest';
import { createPlaySession } from '../../src/sim';
import type { PlaySession } from '../../src/sim/play-session/play-session';
import { collectDawnLines } from '../../src/sim/dawn-lines';
import { loadState, saveState } from '../../src/sim/save';
import { loadData } from '../../src/sim/load-data';
import {
  happeningCandidates,
  happeningMethodMul,
  happeningRelapseMul,
  happeningRows,
  happeningTags,
  happeningTownName,
  lapseHappenings,
  mapBiasTown,
  startHappening,
  tickHappenings,
  type HappeningRow,
} from '../../src/sim/happenings';
import { advanceToDawn } from '../../src/sim/scenario/scenario-advance';
import { deriveRng } from '../../src/sim/rng';
import { presentJuice } from '../../src/ui/surface';
import type { SimState } from '../../src/sim/types/runtime';

function session(seed = 42): PlaySession {
  const s = createPlaySession({ mode: 'play', seed, archetypeId: 'marrow' }) as PlaySession;
  s.start({ seed, archetypeId: 'marrow' });
  return s;
}

function rest(s: PlaySession, n: number): void {
  for (let i = 0; i < n; i++) s.tick();
}

const row = (st: SimState, id: string): HappeningRow => happeningRows(st).find((e) => e.id === id)!;

describe('happenings', { timeout: 60_000 }, () => {
  it('are deterministic per seed and day, and rare', () => {
    const a = session(42);
    const b = session(42);
    rest(a, 30);
    rest(b, 30);
    const logA = a.getState()!.happenings!.log;
    expect(logA).toEqual(b.getState()!.happenings!.log);
    expect(logA.length).toBeGreaterThan(1);
    // At most one per minGapDays (3), so ≤ 10 in 30 dawns.
    expect(logA.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < logA.length; i++) expect(logA[i]!.day - logA[i - 1]!.day).toBeGreaterThanOrEqual(3);
    const c = session(1337);
    rest(c, 30);
    expect(c.getState()!.happenings!.log).not.toEqual(logA);
  });

  it('the draw uses its own stream: other rolls on state.rng do not shift it', () => {
    const a = session(42);
    const b = session(42);
    rest(a, 5);
    rest(b, 5);
    (b.getState()!.rng as { next: () => number }).next();
    rest(a, 20);
    rest(b, 20);
    expect(b.getState()!.happenings!.log.map((e) => e.day)).toEqual(a.getState()!.happenings!.log.map((e) => e.day));
  });

  it('weights favour townBias towns (authored ids mapped onto this world) and where the player woke', () => {
    const st = session(1).getState()!;
    const present = Object.keys(st.towns!).sort();
    // seed 1 has ashford; lowmere maps to the nearest gap; the den is the player's home hearth.
    expect(mapBiasTown(st, 'ashford', present)).toBe('ashford');
    expect(present).toContain(mapBiasTown(st, 'lowmere', present));
    expect(mapBiasTown(st, 'marrow_den', present)).toBe(st.player.homeTownId);
    const cands = happeningCandidates(st);
    const rain = cands.filter((c) => c.ev.id === 'grey_rain');
    const w = (town: string): number => rain.find((c) => c.townId === town)?.weight ?? 0;
    const other = present.find((t) => t !== 'ashford' && t !== mapBiasTown(st, 'lowmere', present) && t !== st.player.townId)!;
    expect(w('ashford')).toBeGreaterThan(w(other));
    expect(w(other)).toBe(12);
    // Den cold only at home, and only after a night away from it.
    expect(cands.some((c) => c.ev.id === 'den_cold')).toBe(st.player.townId !== st.player.homeTownId);
    for (const c of cands.filter((x) => x.ev.id === 'den_cold')) expect(c.townId).toBe(st.player.homeTownId);
  });

  it('grey rain: player spark (when there), relapse on the burning, lapses next dawn', () => {
    const st = session(42).getState()!;
    const town = st.player.townId!;
    const folk = Object.values(st.people).filter((p) => p.townId === town);
    folk[0]!.flame = 60;
    const spark = st.player.spark;
    const act = startHappening(st, row(st, 'grey_rain'), town, deriveRng(1, 'x'));
    expect(st.player.spark).toBe(spark - 3);
    expect(happeningRelapseMul(st, town)).toBeCloseTo(1.25);
    expect(act.endsDay).toBe(st.day + 1);
    expect(st.happenings!.active).toHaveLength(1);
    expect(collectDawnLines(st)).toContain(
      `Grey rain over ${happeningTownName(town)}. ${st.people[act.speakerId!]!.name!.split(' ')[0]} says even the mended ones are slowing.`,
    );
    st.day += 1;
    tickHappenings(st);
    expect(happeningRelapseMul(st, town)).toBe(1);
    expect(st.happenings!.active.find((a) => a.eventId === 'grey_rain')).toBeUndefined();
  });

  it('relapse pressure takes a little flame from the burning while it lasts', () => {
    const st = session(42).getState()!;
    const town = st.player.townId!;
    const p = Object.values(st.people).find((x) => x.townId === town)!;
    p.flame = 60;
    st.happenings = { active: [{ eventId: 'grey_rain', townId: town, startDay: st.day, endsDay: st.day + 2, tags: [], mods: [{ kind: 'relapse', until: st.day + 2, mul: 1.25 }] }], log: [], lastStartDay: st.day };
    st.day += 1;
    tickHappenings(st);
    expect(p.flame).toBe(58);
  });

  it('market ghost: despair up and inspire blunted for a day, then undone', () => {
    const st = session(42).getState()!;
    const town = Object.keys(st.towns!).find((t) => t !== st.player.townId)!;
    const before = st.towns![town]!.despair;
    const spark = st.player.spark;
    startHappening(st, row(st, 'market_ghost'), town, deriveRng(1, 'x'));
    expect(st.towns![town]!.despair).toBeCloseTo(before + 0.05);
    expect(happeningMethodMul(st, town, 'inspire')).toBeCloseTo(0.85);
    expect(happeningMethodMul(st, town, 'challenge')).toBe(1);
    expect(st.player.spark).toBe(spark); // the player was not there
    st.day += 1;
    tickHappenings(st);
    expect(st.towns![town]!.despair).toBeCloseTo(before);
    expect(happeningMethodMul(st, town, 'inspire')).toBe(1);
  });

  it('bad news rider: a burning person loses flame and carries fragile hope for two days', () => {
    const st = session(42).getState()!;
    const town = st.player.townId!;
    const folk = Object.values(st.people).filter((p) => p.townId === town);
    for (const p of folk) p.flame = 10;
    folk[2]!.flame = 50;
    folk[2]!.marks = [];
    const act = startHappening(st, row(st, 'bad_news_rider'), town, deriveRng(1, 'x'));
    expect(act.targetId).toBe(folk[2]!.id);
    expect(folk[2]!.flame).toBe(38);
    expect(folk[2]!.marks).toContainEqual({ markId: 'fragile_hope', stacks: 1 });
    expect(act.speakerId).not.toBe(folk[2]!.id);
    st.day += 1;
    tickHappenings(st);
    expect(folk[2]!.marks).toContainEqual({ markId: 'fragile_hope', stacks: 1 });
    st.day += 1;
    tickHappenings(st);
    expect(folk[2]!.marks ?? []).not.toContainEqual(expect.objectContaining({ markId: 'fragile_hope' }));
  });

  it('hill rumor opens a breach tag for the day', () => {
    const st = session(42).getState()!;
    const town = st.player.townId!;
    startHappening(st, row(st, 'hill_rumor'), town, deriveRng(1, 'x'));
    expect(happeningTags(st, town)).toContain('breach_open');
    st.day += 1;
    tickHappenings(st);
    expect(happeningTags(st, town)).not.toContain('breach_open');
  });

  it('is announced through a person: a happening.start bubble with their line', () => {
    const s = session(42);
    const seen: { id: string; payload: unknown }[] = [];
    s.onJuice((id, payload) => seen.push({ id, payload }));
    rest(s, 30);
    const starts = seen.filter((e) => e.id === 'happening.start');
    expect(starts.length).toBe(s.getState()!.happenings!.log.length);
    const p = presentJuice('happening.start', starts[0]!.payload);
    expect(p).toMatchObject({ kind: 'line', tell: 'glance', cue: 'happening' });
    expect(p!.line).toBeTruthy();
    expect(s.getState()!.people[p!.personId!]!.townId).toBe((starts[0]!.payload as { townId: string }).townId);
  });

  it('survives save/load: active happenings keep lapsing on the same schedule', () => {
    const a = session(42);
    rest(a, 6);
    const st = a.getState()!;
    const town = st.player.townId!;
    st.happenings!.active = [];
    startHappening(st, row(st, 'market_ghost'), town, deriveRng(1, 'x'));
    const loaded = loadState(saveState(st), loadData());
    expect(loaded.happenings).toEqual(st.happenings);
    expect(happeningMethodMul(loaded, town, 'inspire')).toBeCloseTo(0.85);
    advanceToDawn(loaded);
    expect(happeningMethodMul(loaded, town, 'inspire')).toBe(1);
    expect(loaded.happenings!.active.some((h) => h.eventId === 'market_ghost')).toBe(false);
  });

  it('never takes the last of your spark; lapses when travel moves the day', () => {
    const st = session(42).getState()!;
    const town = st.player.townId!;
    st.player.spark = 2;
    startHappening(st, row(st, 'grey_rain'), town, deriveRng(1, 'x'));
    expect(st.player.spark).toBe(0);
    st.happenings!.active = [];
    const other = Object.keys(st.towns!).find((t) => t !== town)!;
    const before = st.towns![other]!.despair;
    startHappening(st, row(st, 'market_ghost'), other, deriveRng(1, 'x'));
    st.day += 1;
    lapseHappenings(st);
    expect(st.towns![other]!.despair).toBeCloseTo(before);
    expect(st.happenings!.active).toEqual([]);
  });

  it('a state without towns or data has no happenings', () => {
    const st = { day: 5, seed: 1, player: { spark: 10 }, people: {}, flags: {}, packets: [] } as unknown as SimState;
    expect(tickHappenings(st)).toBeUndefined();
    expect(st.happenings).toBeUndefined();
  });
});
