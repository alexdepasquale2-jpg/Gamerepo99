import { describe, it, expect } from 'vitest';
import { createPlaySession } from '../../../src/sim';
import type { PlaySession } from '../../../src/sim/play-session/play-session';

function playSession(seed = 42): PlaySession {
  const s = createPlaySession({ mode: 'play', seed, archetypeId: 'marrow' });
  if (!s || !('lastResolve' in s)) throw new Error('expected play session');
  s.start();
  return s;
}

describe('play-session interaction compat (default on)', () => {
  it('inspire@<person> resolves talk_gentle: interaction event + spark -1 (strain 1, gain 0)', () => {
    const s = playSession();
    const personId = s.listPeople()[0]!.id;
    const sparkBefore = s.snapshot().spark;

    s.act(`inspire@${personId}`);

    const events = s.events();
    expect(events).toContainEqual({ type: 'interaction', methodId: 'talk_gentle' });
    // Legacy methods.sparkCost path must not run.
    expect(events.some((e) => e.type === 'spark.spend')).toBe(false);
    expect(events.some((e) => e.methodId === 'inspire')).toBe(false);
    expect(s.snapshot().spark).toBe(sparkBefore - 1);
  });

  it('advance:/travel:/approach@ still route outside compat', () => {
    const s = playSession();
    const personId = s.listPeople()[0]!.id;
    s.act(`approach@${personId}`);
    s.act('advance:day');
    const route = s.listActions().find((a) => a.id.startsWith('travel:'));
    if (route) s.act(route.id);
    const types = s.events().map((e) => e.type);
    expect(types).toContain('approach');
    expect(types).toContain('advance');
    if (route) expect(types).toContain('travel');
    expect(types).not.toContain('interaction');
  });

  it('special-bar juice: refusal coal on a child, no spark.spend, refused lastResolve', () => {
    const s = playSession();
    s.act('shame@jonah_pike');
    const types = s.events().map((e) => e.type);
    expect(types).toContain('refusal.coal_flicker');
    expect(types).not.toContain('spark.spend');
    expect(types).not.toContain('interaction');
    expect(s.lastResolve()).toMatchObject({ kind: 'refused', personId: 'jonah_pike', methodId: 'shame' });
    expect(s.metrics().firstConsequenceAtTick).toBe(0);
  });

  it('resolve mirrors runtime marks/flame/trust onto people and emits mark.applied', () => {
    const s = playSession(99);
    const before = s.listPeople().find((p) => p.id === 'harold_finch')!;
    s.act('challenge@harold_finch');
    const r = s.lastResolve()!;
    expect(r).toMatchObject({ kind: 'resolved', personId: 'harold_finch', methodId: 'challenge' });
    expect(r.flameDelta).toBe(8); // stand_up touch.flame01 0.08
    expect(r.sparkCost).toBe(2); // stand_up strain 4 - gain 2
    const after = s.listPeople().find((p) => p.id === 'harold_finch')!;
    expect(after.marks).toEqual(r.marks);
    expect((after.marks ?? []).length).toBeGreaterThan(before.marks?.length ?? 0);
    const types = s.events().map((e) => e.type);
    expect(types).toContain('mark.applied');
    expect(types).toContain('person.reaction');
    expect(types).not.toContain('spark.spend');
  });
});
