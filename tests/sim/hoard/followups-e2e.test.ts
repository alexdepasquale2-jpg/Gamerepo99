import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { applyStashAct, ensureHoard } from '../../../src/sim/hoard';
import { advanceToDawn } from '../../../src/sim/scenario/scenario-advance';

function run(seed: number) {
  const { state: s } = bootPlayState(seed, 'marrow');
  s.player.townId = 'ashford';
  s.player.coin = 60;
  applyStashAct(s, 'stash_hide');
  applyStashAct(s, 'stash_hide');
  applyStashAct(s, 'stash_guard_hire');
  ensureHoard(s).notoriety = 0.7;
  const seen = new Set<string>();
  for (let d = 0; d < 30; d++) {
    advanceToDawn(s);
    for (const id of s.bus?.lastIds ?? []) seen.add(id);
    s.player.coin = Math.max(0, s.player.coin ?? 0);
  }
  return { h: JSON.stringify(s.hoard), coin: s.player.coin, spark: s.player.spark, seen: [...seen].sort() };
}

describe('30-dawn hoarder run', () => {
  it('is deterministic and the new behaviors fire', () => {
    const a = run(21);
    expect(run(21)).toEqual(a);
    expect(a.seen).toContain('stash.guard_left');
    expect(a.seen).toContain('notoriety.attractor');
  });
});
