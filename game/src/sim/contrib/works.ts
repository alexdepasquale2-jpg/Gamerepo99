/**
 * The Works on the ring (sim/works):
 *   hearth   "The Works"                  → `works.open@hearth:<townId>` (panels open the Works sheet)
 *   board    "Town contracts"             → `works.open.contracts@board:<townId>`
 *   person   "Enlist in your band"        → `works.enlist@person:<id>` (a band stands in their town, room, bounty)
 *            "Hire for your line"         → `works.hire@person:<id>` (a line of yours in their town has room)
 * The dawn tick and dawn lines register from sim/works/tick. Pure: no Phaser/DOM.
 */
import '../works/tick';
import { pushJuice } from '../packets';
import { registerTargetProvider, type ProvidedAction } from '../play-session/action-providers';
import { targetActionId, type Target } from '../play-session/targets';
import { checkArcs } from '../works/arcs';
import { RECIPE_BY_ID, TUNING } from '../works/data';
import { hireHand, lineCap, linesIn } from '../works/lines';
import { freeHands, worksIfAny } from '../works/state';
import { bandCap, bandOf, enlist } from '../works/war';
import type { Result } from '../works/types';
import type { SimState } from '../types/runtime';

const verbOf = (actionId: string): string => actionId.slice(0, actionId.indexOf('@'));
const act = (verb: string, t: Target, label: string, short: string, family: string): ProvidedAction => ({ id: targetActionId(verb, t), label, short, family });

/** Run a Works act and claim any arc tiers it met; the tiers' lines ride after the act's own. */
export function withArcs(state: SimState, r: Result, juice: string): Result {
  if (!r.ok) return r;
  const more = checkArcs(state);
  pushJuice(state, `works.${juice}`, { line: r.line });
  return more.length ? { ...r, line: `${r.line} ${more.join(' ')}` } : r;
}

registerTargetProvider({
  id: 'works-hearth',
  kinds: ['hearth'],
  list: (_state, t) => [act('works.open', t, 'The Works: your yards, lines, vehicles, convoys and war', 'The Works', 'work')],
  act(state, actionId) {
    return verbOf(actionId) === 'works.open' ? { ok: !!state } : false;
  },
});

registerTargetProvider({
  id: 'works-board',
  kinds: ['board'],
  list(state, t) {
    const n = (worksIfAny(state)?.contracts ?? []).length;
    return [act('works.open.contracts', t, n ? `Town contracts (${n} posted)` : 'Town contracts and the Works', 'Contracts', 'deal')];
  },
  act(_state, actionId) {
    return verbOf(actionId) === 'works.open.contracts' ? { ok: true } : false;
  },
});

registerTargetProvider({
  id: 'works-person',
  kinds: ['person'],
  list(state, t) {
    const verbs: ProvidedAction[] = [];
    const p = state.people[t.id];
    if (!p?.townId || !worksIfAny(state)) return verbs;
    const free = freeHands(state, p.townId).includes(t.id);
    if (!free) return verbs;
    const b = bandOf(state);
    if (b && !b.march && b.townId === p.townId && b.soldiers.length < bandCap(state)) {
      verbs.push(act('works.enlist', t, `Enlist in your band (${TUNING.enlistCoin} coin bounty)`, 'Enlist', 'deal'));
    }
    const line = linesIn(state, p.townId).find((l) => l.workers.length < lineCap(l.level));
    if (line) verbs.push(act('works.hire', t, `Hire for your ${RECIPE_BY_ID.get(line.recipeId)?.label.toLowerCase() ?? ''} line (${TUNING.wage} coin a dawn)`, 'Hire for line', 'deal'));
    return verbs;
  },
  act(state, actionId, t) {
    const verb = verbOf(actionId);
    if (verb === 'works.enlist') return withArcs(state, enlist(state, t.id), 'enlist');
    if (verb === 'works.hire') {
      const p = state.people[t.id];
      const line = p?.townId ? linesIn(state, p.townId).find((l) => l.workers.length < lineCap(l.level)) : undefined;
      return line ? withArcs(state, hireHand(state, line.id, t.id), 'hire') : { ok: false, line: 'You have no line here with room.' };
    }
    return false;
  },
});
