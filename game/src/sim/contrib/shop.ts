/**
 * The way into a shop is walking up to it: a market stall or a shop counter offers its one verb, Shop
 * (a thing with one verb runs at once), and a pedlar, shopkeeper, baker or smith in the street adds a
 * "Browse wares" chip. The act only checks someone is there to deal with; the panels open the shop
 * sheet on the 'act' event (panels/shop watchShopVerbs), and the sheet settles through sim/goods/shop.
 */
import { registerTargetProvider } from '../play-session/action-providers';
import { targetActionId, type Target } from '../play-session/targets';
import { sellsWares, shopRefOfPerson, shopRefOfStall, shopStock, type ShopRef } from '../goods/shop';
import type { SimState } from '../types/runtime';

export const SHOP_VERB = 'shop';
export const BROWSE_VERB = 'browse_wares';

/** What a `stall` Thing carries: who the scene sees behind a shop counter. */
export type StallData = { keeperId?: string };

/** The shop a target opens (stall or counter Thing, or a person who sells), or null. */
export function shopRefOfTarget(state: SimState, t: Target): ShopRef | null {
  if (t.kind === 'stall') return shopRefOfStall(t.id, (t.data as StallData | undefined)?.keeperId);
  if (t.kind === 'person' && sellsWares(state, t.id)) return shopRefOfPerson(state, t.id);
  return null;
}

const verbOf = (actionId: string): string => actionId.slice(0, actionId.indexOf('@'));

registerTargetProvider({
  id: 'shop',
  kinds: ['stall', 'person'],
  list(state, t) {
    if (t.kind === 'stall') return [{ id: targetActionId(SHOP_VERB, t), label: 'Shop', short: 'Shop', family: 'deal' }];
    if (!shopRefOfTarget(state, t)) return [];
    return [{ id: targetActionId(BROWSE_VERB, t), label: 'Browse their wares', short: 'Browse wares', family: 'deal' }];
  },
  act(state, actionId, t) {
    const verb = verbOf(actionId);
    if (verb !== SHOP_VERB && verb !== BROWSE_VERB) return false;
    const ref = shopRefOfTarget(state, t);
    if (!ref) return false;
    const closed = shopStock(state, ref).closed;
    return closed ? { ok: false, line: closed } : { ok: true };
  },
});
