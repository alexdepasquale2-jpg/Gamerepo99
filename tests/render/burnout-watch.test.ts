import { describe, it, expect } from 'vitest';
import { createBurnoutWatch } from '../../src/render/spark-fx/burnout-watch';
import { createPlaySession } from '../../src/sim';
import type { PlaySession } from '../../src/sim/play-session/play-session';
import { forceSpark, isSuccessionOpen } from '../../src/sim/succession';

function playSession(seed = 42): PlaySession {
  const s = createPlaySession({ mode: 'play', seed, archetypeId: 'marrow' });
  if (!s || !('lastResolve' in s)) throw new Error('expected play session');
  s.start();
  return s;
}

describe('burnout watch (dying coal before the succession overlay)', () => {
  it('lets the overlay through while nothing is open', () => {
    const w = createBurnoutWatch(1000);
    expect(w.step(false, true, 0)).toBe(false);
    expect(w.ready(false, 0)).toBe(true);
  });

  it('plays once on opening and holds the overlay for holdMs', () => {
    const w = createBurnoutWatch(1000);
    expect(w.ready(true, 0)).toBe(false);
    expect(w.step(true, true, 100)).toBe(true);
    expect(w.step(true, true, 116)).toBe(false);
    expect(w.ready(true, 600)).toBe(false);
    expect(w.ready(true, 1099)).toBe(false);
    expect(w.ready(true, 1100)).toBe(true);
  });

  it('waits while the screen is faded (resting), then plays', () => {
    const w = createBurnoutWatch(500);
    expect(w.step(true, false, 0)).toBe(false);
    expect(w.step(true, false, 900)).toBe(false);
    expect(w.ready(true, 5000)).toBe(false);
    expect(w.step(true, true, 1000)).toBe(true);
    expect(w.ready(true, 1499)).toBe(false);
    expect(w.ready(true, 1500)).toBe(true);
  });

  it('fail-safe: lets the overlay through if the burnout never gets to play', () => {
    const w = createBurnoutWatch(500, 3000);
    expect(w.step(true, false, 100)).toBe(false);
    expect(w.ready(true, 3099)).toBe(false);
    expect(w.ready(true, 3100)).toBe(true);
  });

  it('re-arms after the offer closes (a successor can burn out too)', () => {
    const w = createBurnoutWatch(200);
    expect(w.step(true, true, 0)).toBe(true);
    expect(w.step(false, true, 300)).toBe(false);
    expect(w.ready(true, 300)).toBe(false);
    expect(w.step(true, true, 400)).toBe(true);
    expect(w.ready(true, 600)).toBe(true);
  });
});

describe('isSuccessionOpen (presentation read)', () => {
  it('flips true when the spark is spent at dawn and false after choosing', () => {
    const s = playSession();
    expect(isSuccessionOpen(s)).toBe(false);
    forceSpark(s, 0);
    s.tick();
    expect(isSuccessionOpen(s)).toBe(true);
    expect(s.successionOffer()).not.toBeNull();
    expect(s.snapshot().burnedOut).toBe(true);
    s.chooseSuccession('quit');
    expect(isSuccessionOpen(s)).toBe(false);
  });

  it('is false for objects without a succession handle', () => {
    expect(isSuccessionOpen({})).toBe(false);
  });

  it('a refusal emits refusal.coal_flicker juice with the person and the spoken line', () => {
    const s = playSession();
    const seen: { id: string; payload: unknown }[] = [];
    const off = s.onJuice((id, payload) => seen.push({ id, payload }));
    s.act('shame@jonah_pike');
    off();
    const r = seen.find((e) => e.id === 'refusal.coal_flicker');
    expect(r).toBeDefined();
    const p = r!.payload as { personId: string; line: string };
    expect(p.personId).toBe('jonah_pike');
    expect(typeof p.line).toBe('string');
    expect(p.line.length).toBeGreaterThan(0);
  });
});
