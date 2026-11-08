/**
 * Graves as things (I8). Every stone in state.legacy.graves is a `grave:<personId>#<day>` target (the world
 * draws and emits them, world/things/graves.ts) with two verbs:
 *   - Visit: stand a while; once a day per stone it steadies you (+spark), and their family feels it.
 *   - Lay a keepsake: the keepsake's own "Lay it on the grave" use (items.json, contrib/item-verbs), offered
 *     here whenever you carry one; with the keepsake in hand the item-verbs provider lists it instead.
 * The older convention (a plot whose id starts with "grave", contrib/target-data isGrave) still works.
 */
import { kinOf } from '../economy/mortality';
import { hasItem } from '../goods/inventory';
import type { Grave } from '../legacy/types';
import { pushJuice } from '../packets';
import { registerTargetProvider, type ActOutcome } from '../play-session/action-providers';
import { targetActionId, type Target } from '../play-session/targets';
import { encodeUnspokenForState } from '../social/unspoken';
import type { SimState } from '../types/runtime';
import { actItemVerb, itemVerbAct } from './item-verbs';
import { heldItemOf } from './target-data';
import { markUsed, usedToday } from './use-effects';

export const GRAVE_VISIT = 'grave_visit';
export const GRAVE_KEEPSAKE = 'grave_keepsake';
export const VISIT_SPARK = 2;
const KEEPSAKE = 'keepsake';

/** The target id of a grave (a person can only be buried once, but imported stones may repeat a name). */
export const graveId = (g: Pick<Grave, 'personId' | 'day'>): string => `${g.personId}#${g.day}`;
export const graveOf = (state: SimState, id: string): Grave | undefined => (state.legacy?.graves ?? []).find((g) => graveId(g) === id);

const first = (name: string): string => name.split(' ')[0] ?? name;

/** Who mourns them: family named when they died (life events), else living kin. */
function mournerOf(state: SimState, g: Grave): string | undefined {
  const e = (state.life?.events ?? []).find((x) => x.kind === 'died' && x.personId === g.personId);
  if (e?.kin && e.teller && state.people[e.teller]) return e.teller;
  return kinOf(state, g.personId);
}

function visit(state: SimState, t: Target, g: Grave): ActOutcome {
  const key = targetActionId(GRAVE_VISIT, t);
  if (usedToday(state, key)) return { ok: true, line: `You stand a little longer by ${first(g.name)}'s stone.` };
  markUsed(state, key);
  const cap = state.player.sparkMax ?? 100;
  const gain = Math.max(0, Math.min(VISIT_SPARK, cap - state.player.spark));
  state.player.spark += gain;
  const mourner = mournerOf(state, g);
  if (mourner) encodeUnspokenForState(state, 'show_up', mourner, { tags: ['grief', 'kin', 'memory'] });
  pushJuice(state, 'grave.visited', { graveId: t.id, personId: mourner, townId: g.townId });
  const kin = mourner && state.people[mourner]?.townId === state.player.townId ? ` ${first(state.people[mourner]!.name ?? mourner)} will hear you came.` : '';
  return { ok: true, line: `You stand a while at ${g.name}'s stone, laid on day ${g.day}. The quiet steadies you.${gain ? ` +${gain} spark` : ''}${kin}` };
}

registerTargetProvider({
  id: 'graves',
  kinds: ['grave'],
  list: (state, t) => {
    if (!graveOf(state, t.id)) return [];
    const out = [{ id: targetActionId(GRAVE_VISIT, t), label: 'Visit the grave', short: 'Visit', family: 'work' }];
    if (hasItem(state, KEEPSAKE) && heldItemOf(t) !== KEEPSAKE) out.push({ id: targetActionId(GRAVE_KEEPSAKE, t), label: 'Lay a keepsake on the stone', short: 'Lay a keepsake', family: 'give' });
    return out;
  },
  act: (state, actionId, t, ctx) => {
    const g = graveOf(state, t.id);
    if (actionId === targetActionId(GRAVE_VISIT, t)) return g ? visit(state, t, g) : { ok: false, line: 'There is no stone here.' };
    if (actionId === targetActionId(GRAVE_KEEPSAKE, t)) {
      if (!g) return { ok: false, line: 'There is no stone here.' };
      const data = { ...((t.data as object | undefined) ?? {}), grave: true, personId: g.personId, name: g.name, townId: g.townId };
      return actItemVerb(state, targetActionId(itemVerbAct(KEEPSAKE, 'grave'), t), { ...t, data }, ctx.eventLog, ctx.rt);
    }
    return false;
  },
});
