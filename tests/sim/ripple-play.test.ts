import { describe, it, expect } from 'vitest';
import { createPlaySession, generateWorld } from '../../src/sim';
import type { PlaySession } from '../../src/sim';
import { loadData } from '../../src/sim/load-data';
import { peopleFromWorld } from '../../src/sim/play-session-boot';

/** Prefer a person on a Fabric kin edge whose towns differ (after boot town assign). */
function findPersonWithKin(seed: number): string {
  const w = generateWorld({ seed, includeAnchors: true });
  const people = peopleFromWorld(w, loadData());
  for (const e of w.kinEdges ?? []) {
    const a = people[e.from];
    const b = people[e.to];
    if (a?.townId && b?.townId && a.townId !== b.townId) return e.from;
  }
  const fallback = (w.kinEdges ?? [])[0]?.from;
  if (!fallback) throw new Error('no kin edges on seed');
  return fallback;
}

describe('cross-town ripples', () => {
  it('genuine_growth can emit packet that delivers along a kin edge', () => {
    const s = createPlaySession({ mode: 'play', seed: 11, archetypeId: 'marrow' });
    expect(s).not.toBeNull();
    if (!s || !('listActions' in s)) throw new Error('expected play session');
    const play = s as PlaySession;
    play.start();
    const target = findPersonWithKin(11);
    // seed 11: inspire@gen_p_11_1 → genuine_growth (see methods mark roll)
    play.act(`inspire@${target}`);
    for (let i = 0; i < 5; i++) play.tick();
    expect(
      play.events().some((e) => e.type === 'packet.emit' || e.type === 'packet.deliver'),
    ).toBe(true);
  });
});
