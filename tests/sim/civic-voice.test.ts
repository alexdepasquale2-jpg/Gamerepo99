import { describe, expect, it } from 'vitest';
import { applyDoctrineAct, ensureDoctrines } from '../../src/sim/doctrine-tick';
import { ensureEconomyState } from '../../src/sim/economy';
import { actMethod } from '../../src/sim/play-session/play-session-act';
import { bootPlayState } from '../../src/sim/play-session/play-session-state';

function setup() {
  const { state, interactionRt } = bootPlayState(7, 'marrow');
  ensureEconomyState(state);
  const d = ensureDoctrines(state);
  const id = Object.keys(d).sort().find((k) => state.towns?.[d[k]!.townId])!;
  const townId = d[id]!.townId;
  const people = Object.values(state.people).filter((p) => p.townId === townId).slice(0, 4);
  expect(people.length).toBeGreaterThanOrEqual(3);
  for (const p of people) p.flame = 0;
  return { state, interactionRt, d, id, people };
}

describe('civic_voice earned by standing up', () => {
  it('inert below 3 distinct stand_ups; granted at 3 and become_voice then works', () => {
    const { state, interactionRt, d, id, people } = setup();
    const log: { type: string }[] = [];
    const stand = (pid: string) =>
      actMethod(state, `challenge@${pid}`, log as never, undefined, { interactionCompat: interactionRt! });
    stand(people[0]!.id);
    stand(people[0]!.id); // same person twice does not count twice
    stand(people[1]!.id);
    expect(state.player.statusTraits).not.toContain('civic_voice');
    d[id]!.propaganda = 0.5;
    expect(applyDoctrineAct(state, 'act_become_voice', people[0]!.id)).toBeUndefined();
    expect(d[id]!.propaganda).toBe(0.5);

    stand(people[2]!.id);
    expect(state.player.statusTraits).toContain('civic_voice');
    expect(state.bus?.lastIds).toContain('status.gain');
    expect(applyDoctrineAct(state, 'act_become_voice', people[0]!.id)).toBe(id);
    expect(d[id]!.propaganda).toBeCloseTo(0.45);
  });
});
