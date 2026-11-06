import { describe, it, expect } from 'vitest';
import { createPlaySession } from '../../src/sim';
import type { PlaySession } from '../../src/sim/play-session/play-session';

function playSession(compat = true): PlaySession {
  const s = createPlaySession({
    mode: 'play',
    seed: 42,
    archetypeId: 'marrow',
    interactionCompat: compat,
  });
  if (!s || !('lastResolve' in s)) throw new Error('expected play session');
  s.start();
  return s;
}

describe('play-session interaction compat (opt-in)', () => {
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

  it('default (compat off) keeps legacy commitMethod path for inspire', () => {
    const s = playSession(false);
    const personId = s.listPeople()[0]!.id;
    s.act(`inspire@${personId}`);
    expect(s.events().some((e) => e.type === 'interaction')).toBe(false);
  });
});
