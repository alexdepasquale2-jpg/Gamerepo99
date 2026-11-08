/**
 * Crafting on the ring (sim/craft):
 *   hearth / facility / plot   "Craft" where the thing is a station (a town hearth; a facility's workbench
 *                              or forge; the bench in your own built workshop)     → `craft.open@<kind>:<id>`
 *                              (the act only checks; the panels then open the craft sheet)
 *   the sheet's buttons        make one batch of a recipe there                   → `craft.make.<recipeId>@<kind>:<id>`
 * Pure: no Phaser/DOM.
 */
import { craft, stationOf } from '../craft/craft';
import { STATIONS } from '../craft/recipes';
import { pushJuice } from '../packets';
import { registerTargetProvider } from '../play-session/action-providers';
import { targetActionId } from '../play-session/targets';

const verbOf = (actionId: string): string => actionId.slice(0, actionId.indexOf('@'));
const MAKE = 'craft.make.';

registerTargetProvider({
  id: 'craft',
  kinds: ['hearth', 'facility', 'plot'],
  list(state, t) {
    const at = stationOf(state, t);
    return at ? [{ id: targetActionId('craft.open', t), label: STATIONS[at.station].label, short: 'Craft', family: 'work' }] : [];
  },
  act(state, actionId, t) {
    const verb = verbOf(actionId);
    if (verb !== 'craft.open' && !verb.startsWith(MAKE)) return false;
    const at = stationOf(state, t);
    if (!at) return { ok: false, line: 'There is nothing here to work at.' };
    if (verb === 'craft.open') return { ok: true };
    const r = craft(state, verb.slice(MAKE.length), at);
    if (r.ok) pushJuice(state, 'craft.made', { verb: verb.slice(MAKE.length), target: t.kind, id: t.id, townId: at.townId, line: r.line });
    return r.ok ? { ok: true, line: r.line, ...(r.hours ? { hours: r.hours } : {}) } : { ok: false, line: r.line };
  },
});
