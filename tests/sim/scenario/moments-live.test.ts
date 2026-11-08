/**
 * Authored moments fire in play: each shipped special-bar scenario, played through a real session from
 * its own steps, surfaces its beat once per save, and stays quiet when its conditions differ.
 */
import { describe, expect, it } from 'vitest';
import { createPlaySession, type PlaySession } from '../../../src/sim';
import { MOMENTS, momentById, seenMoments, type MomentRow } from '../../../src/sim/scenario/moments-live';
import { resolveScenarioPerson } from '../../../src/sim/scenario/scenario-resolve';
import { collectDawnLines } from '../../../src/sim/dawn-lines';
import { presentJuice } from '../../../src/ui/surface';

type Beat = { momentId: string; personId: string; line: string };

function session(seed: number, archetypeId: string): { s: PlaySession; beats: Beat[] } {
  const s = createPlaySession({ mode: 'play', seed, archetypeId }) as PlaySession;
  s.start();
  const beats: Beat[] = [];
  s.onJuice((id, p) => {
    if (id === 'moment.beat') beats.push(p as Beat);
  });
  return { s, beats };
}

/** Harness setup from the row (flames it pins), plus per-test overrides. */
function setup(s: PlaySession, row: MomentRow, flames: Record<string, number> = {}): void {
  const st = s.getState()!;
  for (const e of row.setup?.ensure ?? []) {
    const p = st.people[e.personId];
    if (p && typeof e.flame === 'number') p.flame = e.flame;
  }
  for (const [id, f] of Object.entries(flames)) st.people[id]!.flame = f;
}

/** Play the row's own steps through the session (approach / method / advance). */
function playSteps(s: PlaySession, row: MomentRow, target: (sid: string) => string = (sid) => sid): void {
  for (const step of row.steps) {
    if (step.op === 'approach') s.act(`approach@${target(step.personId!)}`);
    else if (step.op === 'method') s.act(`${step.methodId}@${target(step.targetPersonId!)}`);
    else if (step.op === 'advance') s.act(`advance:${step.to}`);
  }
}

// Seeds where each moment's expectations hold for its resolved person (mark rolls are seeded).
const PLAY: Record<string, { seed: number; flames?: Record<string, number> }> = {
  first_10_minutes_ashford_hook: { seed: 11 },
  moment_refusal_coal: { seed: 42 },
  moment_mark_comes_back: { seed: 99 },
  moment_chalk_after_the_cut: { seed: 13 },
  moment_nail_across_the_water: { seed: 21 },
  // A warm loaf needs Marta already near burning: one carried burden then has to lift her past 50.
  moment_warm_loaf_cold_hill: { seed: 7, flames: { marta_ellison: 46 } },
};

describe('authored moments in play', () => {
  it('every special-bar scenario ships a beat and is covered here', () => {
    expect(MOMENTS.map((m) => m.id).sort()).toEqual(Object.keys(PLAY).sort());
    for (const m of MOMENTS) expect(m.beat!.lines.length).toBeGreaterThan(0);
  });

  for (const row of MOMENTS) {
    it(`${row.id}: fires once with its authored lines`, () => {
      const cfg = PLAY[row.id]!;
      const { s, beats } = session(cfg.seed, row.archetypeId);
      setup(s, row, cfg.flames);
      playSteps(s, row);
      expect(seenMoments(s.getState()!)[row.id], JSON.stringify(s.events().map((e) => e.type))).toBeTruthy();
      expect(beats.map((b) => b.line)).toEqual(row.beat!.lines.map((l) => l.text));
      expect(beats.every((b) => b.momentId === row.id && !!s.getState()!.people[b.personId])).toBe(true);
      expect(s.events().some((e) => e.type === 'moment.beat')).toBe(true);
      // The surface turns it into a bubble over that person.
      expect(presentJuice('moment.beat', beats[0])).toMatchObject({ kind: 'line', personId: beats[0]!.personId, line: beats[0]!.line });
      // Doing it all again in the same save does not fire it twice.
      setup(s, row, cfg.flames);
      playSteps(s, row);
      expect(beats.length).toBe(row.beat!.lines.length);
    }, 20_000);
  }

  it('refusal coal: shaming a grown person, or challenging the boy, is not the moment', () => {
    const { s, beats } = session(42, 'marrow');
    s.act('shame@harold_finch');
    s.act('challenge@jonah_pike');
    expect(beats).toEqual([]);
    expect(seenMoments(s.getState()!).moment_refusal_coal).toBeUndefined();
  });

  it('refusal coal lands on whoever resolves in a world without the anchor', () => {
    const row = momentById('moment_refusal_coal')!;
    const { s, beats } = session(42, 'marrow');
    const st = s.getState()!;
    delete st.people.jonah_pike;
    const other = Object.values(st.people).find((p) => !p.anchor && p.id !== 'jonah_pike')!;
    other.tags = [...(other.tags ?? []), 'child'];
    other.woundId = 'fear';
    expect(resolveScenarioPerson(s, row.resolvePerson!)).toBe(other.id);
    s.act(`shame@${other.id}`);
    expect(beats.map((b) => b.personId)).toEqual([other.id]);
  });

  it('mark comes back: wrong order, or the second visit on another day, is not the moment', () => {
    {
      const { s, beats } = session(99, 'marrow');
      s.act('carry_burden@harold_finch');
      s.act('challenge@harold_finch');
      expect(beats).toEqual([]);
    }
    {
      const { s, beats } = session(99, 'marrow');
      s.act('challenge@harold_finch');
      s.tick();
      s.act('carry_burden@harold_finch');
      expect(beats).toEqual([]);
    }
  }, 20_000);

  it('warm loaf: not while the hill is burning, and not if the act leaves her cold', () => {
    const row = momentById('moment_warm_loaf_cold_hill')!;
    {
      const { s, beats } = session(7, 'marrow');
      setup(s, row, { marta_ellison: 46, jonah_pike: 60 });
      playSteps(s, row);
      expect(beats).toEqual([]);
    }
    {
      const { s, beats } = session(7, 'marrow');
      setup(s, row);
      playSteps(s, row);
      expect(beats).toEqual([]);
    }
  }, 20_000);

  it('chalk after the cut: only for the archetype it was written for, and only with the boy burning', () => {
    const row = momentById('moment_chalk_after_the_cut')!;
    {
      const { s, beats } = session(13, 'marrow');
      setup(s, row);
      playSteps(s, row);
      expect(beats).toEqual([]);
    }
    {
      const { s, beats } = session(13, row.archetypeId);
      setup(s, row, { jonah_pike: 10 });
      playSteps(s, row);
      expect(beats).toEqual([]);
    }
  }, 20_000);

  it('nail across the water: a challenge that leaves resentment is not the moment', () => {
    const row = momentById('moment_nail_across_the_water')!;
    const { s, beats } = session(99, 'marrow');
    setup(s, row);
    playSteps(s, row);
    expect(s.getState()!.people.elias_boone!.marks?.some((m) => m.markId === 'resentment')).toBe(true);
    expect(beats).toEqual([]);
    expect(seenMoments(s.getState()!)[row.id]).toBeUndefined();
  }, 20_000);

  it('first ten minutes: carrying the boy alone is not the hook', () => {
    const { s, beats } = session(11, 'marrow');
    s.act('carry_burden@jonah_pike');
    s.act('advance:dawn');
    s.act('inspire@marta_ellison');
    expect(beats).toEqual([]);
  }, 20_000);

  it('a moment that lands overnight is heard at dawn; a rest settles it', () => {
    const row = momentById('moment_nail_across_the_water')!;
    const { s, beats } = session(21, 'marrow');
    setup(s, row);
    s.act('challenge@elias_boone');
    expect(beats).toEqual([]);
    expect(collectDawnLines(s.getState()!).some((l) => l.includes('over the water'))).toBe(false);
    s.tick();
    expect(beats.map((b) => b.personId)).toEqual(['elias_boone']);
    expect(collectDawnLines(s.getState()!)).toContain('Word came over the water: Elias is at the forge again.');
  }, 20_000);

  it('seen moments ride the save and do not fire again after loading', () => {
    const { s, beats } = session(42, 'marrow');
    s.act('shame@jonah_pike');
    expect(beats.length).toBe(1);
    const blob = s.saveBlob()!;
    const { s: s2, beats: beats2 } = session(42, 'marrow');
    s2.loadBlob(blob);
    expect(seenMoments(s2.getState()!).moment_refusal_coal).toBeTruthy();
    s2.act('shame@jonah_pike');
    expect(beats2).toEqual([]);
  }, 20_000);
});
