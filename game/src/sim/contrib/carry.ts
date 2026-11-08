/**
 * Carrying by hand as direct verbs (sim/carry): a pile offers "Pick up" when your arms are empty and
 * "Set down" when what you carry belongs there; a plot under construction, a hearth and a halted wagon offer
 * "Set down" only while you carry something they would take. Each is the thing's one verb where it can be,
 * so pressing E just does it (interact/controller). Thanks come through people at dawn.
 */
import { registerDawnLines } from '../dawn-lines';
import { registerDawnTick } from '../dawn-ticks';
import { acceptsLoad, carryDawnLines, carrying, loadName, pickUp, pileKeyOf, pileView, pruneCarry, putDown } from '../carry';
import { registerTargetProvider, type ProvidedAction } from '../play-session/action-providers';
import { targetActionId, type Target } from '../play-session/targets';
import type { SimState } from '../types/runtime';

const LIFT = 'carry.lift', PUT = 'carry.put';
const verbOf = (actionId: string): string => actionId.slice(0, actionId.indexOf('@'));

function verbs(state: SimState, t: Target): ProvidedAction[] {
  const c = carrying(state);
  if (c) {
    if (!acceptsLoad(state, t)) return [];
    const where = t.kind === 'wagon' ? 'Load the' : t.kind === 'plot' ? 'Stack the' : 'Set down the';
    const label = `${where} ${loadName(c)}`;
    return [{ id: targetActionId(PUT, t), label, short: t.kind === 'wagon' ? 'Load it' : 'Set down', family: 'work' }];
  }
  const key = pileKeyOf(t);
  const p = key ? pileView(state, key) : null;
  if (!p || p.load <= 0) return [];
  const label = t.kind === 'wagon' ? `Take the ${p.name} off` : `Pick up ${p.load} ${p.name}`;
  return [{ id: targetActionId(LIFT, t), label, short: t.kind === 'wagon' ? 'Unload' : 'Pick up', family: 'work' }];
}

registerTargetProvider({
  id: 'carry',
  kinds: ['prop', 'plot', 'hearth', 'wagon'],
  list: (state, t) => (t.kind === 'prop' && !pileKeyOf(t) ? [] : verbs(state, t)),
  act(state, actionId, t) {
    const v = verbOf(actionId);
    if (v === LIFT) { const key = pileKeyOf(t); return key ? pickUp(state, key) : { ok: false, line: 'There is nothing here to lift.' }; }
    if (v === PUT) return putDown(state, t);
    return false;
  },
});

registerDawnLines('carry-thanks', carryDawnLines);
registerDawnTick('late', 'carry', pruneCarry);
