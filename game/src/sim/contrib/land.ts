/**
 * Land acts on the shared surfaces:
 *   tile   the land act the ground in reach allows (lay stones, clear brush, mend the path), through
 *          sim/land-acts.ts; target.data carries q, r and the live LandView       → `land.<act>@tile:<id>`
 *          Acts that need a tool (axe, mallet, tools: crafted, sim/craft) stay listed without one, and say
 *          what is missing, so the ground itself tells you what to make.
 *   dawn   townsfolk talk about ground the player worked near their town.
 * Pure: no Phaser/DOM.
 */
import { registerDawnLines } from '../dawn-lines';
import { LAND_RULES, landActOn, landDawnLines, toolAtHand, toolsText, workLand } from '../land-acts';
import { registerTargetProvider } from '../play-session/action-providers';
import { targetActionId, type Target } from '../play-session/targets';
import { itemVerbs } from './item-verbs';
import { heldItemOf, tileData } from './target-data';

registerDawnLines('land-acts', landDawnLines);

const verbOf = (actionId: string): string => actionId.slice(0, actionId.indexOf('@'));

/** The held item already offers this land act (stone → lay stones): don't list it twice. */
function heldCovers(t: Target, actId: string): boolean {
  const held = heldItemOf(t);
  return !!held && itemVerbs(held).some((v) => v.target === 'tile' && v.effect.do === 'land' && v.effect.act === actId);
}

registerTargetProvider({
  id: 'tile-land',
  kinds: ['tile'],
  list(state, t) {
    const d = tileData(t);
    const act = d?.view ? landActOn(d.view, d.q, d.r) : null;
    if (!act || heldCovers(t, act.id)) return [];
    // Without the tool, the chip names it; other shortfalls (goods, a tired back) come with the refusal.
    const label = toolAtHand(state, act.tools) === null ? `${act.label} (needs ${toolsText(act.tools!)})` : act.label;
    return [{ id: targetActionId(`land.${act.id}`, t), label, short: act.short ?? act.label, family: 'work' }];
  },
  act(state, actionId, t) {
    const verb = verbOf(actionId);
    if (!verb.startsWith('land.')) return false;
    const actId = verb.slice('land.'.length);
    const d = tileData(t);
    if (!LAND_RULES.acts.some((a) => a.id === actId)) return false;
    if (!d?.view) return { ok: false, line: 'Stand by the ground you mean to work.' };
    const r = workLand(state, d.view, actId, d.q, d.r, d.towns ?? []);
    return { ok: r.ok, line: r.line };
  },
});
