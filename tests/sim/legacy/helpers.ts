import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { actMethod } from '../../../src/sim/play-session/play-session-act';
import { maybeOpenSuccession } from '../../../src/sim/succession';
import type { SimState } from '../../../src/sim/types/runtime';

/** Boot, bond with the first person(s) via kind acts, then burn out. */
export function bondedState(seed = 7, archetype = 'marrow', rounds = 4): { state: SimState; pid: string; ids: string[] } {
  const { state, interactionRt } = bootPlayState(seed, archetype);
  const ids = Object.keys(state.people).sort();
  const pid = ids[0]!;
  state.player.townId = state.people[pid]!.townId;
  for (let i = 0; i < rounds; i++) {
    state.player.spark = 100;
    for (const m of ['carry_burden', 'inspire']) {
      actMethod(state, `${m}@${pid}`, [], undefined, { interactionCompat: interactionRt });
    }
    actMethod(state, 'advance:dawn', []);
  }
  return { state, pid, ids };
}

export function burnOut(state: SimState): void {
  state.player.spark = 0;
  maybeOpenSuccession(state, [], { value: false });
}
