/**
 * Hoarder path in the ring and at dawn. Anyone in a town with a stash site who does not distrust you
 * will help you hide coin (in their cellar, under their boards), tuck away food, hire a watcher, or dig
 * it all back up. The acts are catalog interactions (stash_*), so the generic dispatcher plays them.
 * What happens to a stash overnight (theft, rot, a guard walking off) is heard at dawn through people.
 */
import { registerDawnLines } from '../dawn-lines';
import { actDefs, applyStashAct, siteDefs, siteInTown, stashRoom, storableGoods, totalGoods } from '../hoard';
import { townDisplayName } from '../hoard/ending';
import { townRole } from '../economy/town-roles';
import { registerActionProvider, registerTargetProvider, type ProvidedAction } from '../play-session/action-providers';
import type { SimState } from '../types/runtime';
import { firstNameOf } from '../names';

/** Below this trust a person will not keep your secret (first impressions start around 0.25-0.45). */
export const STASH_TRUST_MIN = 0.2;

export const STASH_LABELS = {
  stash_hide: 'Hide coin here',
  stash_store: 'Hide food here',
  stash_guard_hire: 'Hire a guard',
  stash_withdraw: 'Dig up the hoard',
} as const;
const STASH_SHORT: Record<keyof typeof STASH_LABELS, string> = {
  stash_hide: 'Hide coin', stash_store: 'Hide food', stash_guard_hire: 'Hire a guard', stash_withdraw: 'Dig up hoard',
};

/** Stash chips on offer for this person right now (only in the player's town, only when they apply). */
export function stashActions(state: SimState, personId: string, trustOf?: (id: string) => number | undefined): ProvidedAction[] {
  const person = state.people[personId];
  const townId = state.player.townId;
  if (!person || !townId || person.townId !== townId) return [];
  const def = siteInTown(state, townId);
  if (!def) return [];
  const trust = trustOf?.(personId) ?? person.trust ?? STASH_TRUST_MIN;
  if (trust < STASH_TRUST_MIN) return [];
  const s = state.hoard?.stash[def.id];
  const coin = s?.coin ?? 0;
  const goods = s ? totalGoods(s) : 0;
  const carried = state.player.coin ?? 0;
  const room = stashRoom(def, coin, goods);
  const acts = actDefs(state);
  const out: ProvidedAction[] = [];
  const add = (id: keyof typeof STASH_LABELS): void => void out.push({ id: `${id}@${personId}`, label: STASH_LABELS[id], short: STASH_SHORT[id], family: 'hoard' });
  if (carried > 0 && room > 0 && acts.some((a) => a.id === 'stash_hide')) add('stash_hide');
  if (room > 0 && storableGoods(state, acts.find((a) => a.id === 'stash_store')).length > 0) add('stash_store');
  const guard = acts.find((a) => a.id === 'stash_guard_hire');
  if (guard && coin + goods > 0 && (s?.guardsHired ?? 0) < def.guardSlots && carried >= (guard.coinCost ?? 0)) add('stash_guard_hire');
  if (coin + goods > 0 && acts.some((a) => a.id === 'stash_withdraw')) add('stash_withdraw');
  return out;
}

registerActionProvider({
  id: 'stash',
  list: (state, personId, rt) => {
    // Without the interaction runtime nothing can play these acts, so offer none.
    if (!rt || !rt.catalog.has('stash_hide')) return [];
    return stashActions(state, personId, (id) => rt.people.get(id)?.trust).filter((a) => rt.catalog.has(a.id.slice(0, a.id.indexOf('@'))));
  },
});

/**
 * The chest itself (target kind 'chest', id = stash site): dig it up, or put coin / food in, standing in its
 * town. Same stash acts as the ring on a helper, through session.act, with nobody else involved.
 */
export function chestActions(state: SimState, siteId: string): ProvidedAction[] {
  const townId = state.player.townId;
  const def = townId ? siteInTown(state, townId) : undefined;
  if (!def || def.id !== siteId) return [];
  const s = state.hoard?.stash[def.id];
  const coin = s?.coin ?? 0;
  const goods = s ? totalGoods(s) : 0;
  const room = stashRoom(def, coin, goods);
  const acts = actDefs(state);
  const out: ProvidedAction[] = [];
  const add = (id: keyof typeof STASH_LABELS): void => void out.push({ id: `${id}@chest:${siteId}`, label: STASH_LABELS[id], short: STASH_SHORT[id], family: 'hoard' });
  if (coin + goods > 0 && acts.some((a) => a.id === 'stash_withdraw')) add('stash_withdraw');
  if ((state.player.coin ?? 0) > 0 && room > 0 && acts.some((a) => a.id === 'stash_hide')) add('stash_hide');
  if (room > 0 && storableGoods(state, acts.find((a) => a.id === 'stash_store')).length > 0) add('stash_store');
  return out;
}

registerTargetProvider({
  id: 'stash-chest',
  kinds: ['chest'],
  list: (state, target) => chestActions(state, target.id),
  act(state, actionId, target) {
    const verb = actionId.slice(0, actionId.indexOf('@'));
    if (!(verb in STASH_LABELS) || !chestActions(state, target.id).some((a) => a.id === actionId)) return false;
    const ok = applyStashAct(state, verb);
    return { ok, line: ok ? undefined : 'Nothing to do with it just now.' };
  },
});

const nameOf = (state: SimState, id: string | undefined): string => (id ? firstNameOf(state.people[id]?.name ?? id)! : 'Someone');

/** This dawn's stash news, told by the neighbour who noticed. */
export function stashDawnLines(state: SimState): string[] {
  const h = state.hoard;
  if (!h?.news?.length) return [];
  // siteDefs, not the raw table: a district town's generated spot has its own name too.
  const sites = siteDefs(state);
  const out: string[] = [];
  for (const n of h.news) {
    if (n.day !== state.day) continue;
    const who = nameOf(state, n.personId);
    const site = (sites.find((x) => x.id === n.siteId)?.name ?? 'your hiding place').toLowerCase();
    const town = townRole(state.seed, n.townId)?.name ?? townDisplayName(n.townId);
    if (n.kind === 'theft') out.push(`${who} says someone has been at the ${site} in ${town}. ${n.coin ? `${n.coin} coin gone.` : 'Things moved.'}`);
    else if (n.kind === 'decay') out.push(`${who} says the damp got into the ${site} in ${town}. ${n.goods} ${n.goods === 1 ? 'thing' : 'things'} spoiled.`);
    else if (n.kind === 'guard_left') out.push(`${who} says your guard at the ${site} in ${town} walked off. Nobody paid them.`);
  }
  return out;
}

registerDawnLines('stash-news', stashDawnLines);
