import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../src/sim/play-session/play-session-state';
import { actMethod } from '../../src/sim/play-session/play-session-act';
import { advanceToDawn } from '../../src/sim/scenario/scenario-advance';
import { ensureHoard } from '../../src/sim/hoard';
import { ensureStash } from '../../src/sim/hoard/state';
import { acceptDeal } from '../../src/sim/patrons';
import { loadData } from '../../src/sim/load-data';
import { loadState, parseSave, saveState, serializeSave } from '../../src/sim/save';
import type { SimState } from '../../src/sim/types/runtime';

const view = (s: SimState) => {
  const { data: _d, bus: _b, rng: _r, reactionLineSelector: _s, economyHooks: _e, ...rest } = s as SimState & Record<string, unknown>;
  return JSON.parse(JSON.stringify({ ...rest, rngPos: (s.rng as { getState(): number }).getState() }));
};

describe('save round trip', () => {
  it('save -> load -> 10 dawns matches the original', () => {
    const b = bootPlayState(7, 'marrow');
    const st = b.state;
    st.player.townId = 'ashford';
    const voice = Object.keys(st.people).sort().find((id) => st.people[id]!.townId === 'ashford' && st.people[id]!.tags?.includes('doctrine_voice'))!;
    ensureHoard(st).notoriety = 0.5;
    ensureStash(st, 'stash_ashford_cellar').coin = 30;
    st.player.coin = 80;
    const methods = (st.data as unknown as { methods: { id: string }[] }).methods.slice(0, 2);
    for (let d = 0; d < 4; d++) {
      for (const m of methods) actMethod(st, `${m.id}@${voice}`, [], undefined, { interactionCompat: b.interactionRt });
      if (d === 1) acceptDeal(st, 'patron_mill_trust', 'deal_mill_deny_reignite');
      advanceToDawn(st);
    }
    expect(Object.keys(st.patronDeals ?? {}).length).toBeGreaterThan(0);

    const blob = parseSave(serializeSave(saveState(st)))!;
    expect(blob.version).toBe(2);
    expect(JSON.parse(JSON.stringify(blob))).toEqual(blob);
    const loaded = loadState(blob, loadData());
    expect(view(loaded)).toEqual(view(st));

    for (let i = 0; i < 10; i++) {
      advanceToDawn(st);
      advanceToDawn(loaded);
    }
    expect(view(loaded)).toEqual(view(st));
    expect(saveState(loaded)).toEqual(saveState(st));
  });

  it('loads a legacy v1 blob', () => {
    const s = loadState({ version: 1, seed: 3, tick: 5, npcs: [], coin: 12 }, loadData());
    expect(s.player.coin).toBe(12);
    expect(s.day).toBe(5);
  });
});
