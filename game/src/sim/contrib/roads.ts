/**
 * Roads (G5, G6, G8) on the shared surfaces:
 *   tile      the road in front of you, when worn or broken: mend it with stone, timber and tools → `road.mend@tile:road:<q>,<r>`
 *             (the world puts `{ q, r, roadId }` in target.data)
 *   wagon     a village cart on the road (`wagon:cart:<cartId>`): walk beside it to its town → `escort@wagon:cart:<id>`
 *             (the act only checks; the road sheet then runs the escort journey, as it runs a road)
 *   facility  at a waystation: rest the night (the hearth's 'rest' scene), hear the talk, hire a guide or a watch
 *   dawn      road news through someone in your town; a noticeboard page of the roads out
 * Pure: no Phaser/DOM.
 */
import { registerBoardPage } from '../board-pages';
import { registerDawnLines } from '../dawn-lines';
import { cartPosition } from '../economy/logistics';
import { mendRoad, roadDawnLines, roadNeedsMending, roadWord, routeById, ROADS } from '../economy/roads';
import { hearTalk, hiredOn, hirePrice, hireHelp, INNS, isWaystation, restAtInn, type HireTrade } from '../economy/waystations';
import { hasItem, itemName } from '../goods/inventory';
import { toolAtHand, toolsText } from '../land-acts';
import { happeningTownName } from '../happenings';
import { registerTargetProvider, type ProvidedAction } from '../play-session/action-providers';
import { targetActionId, type Target } from '../play-session/targets';
import type { SimState } from '../types/runtime';

const verbOf = (actionId: string): string => actionId.slice(0, actionId.indexOf('@'));
const rec = (t: Target): Record<string, unknown> => (t.data && typeof t.data === 'object' ? (t.data as Record<string, unknown>) : {});
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The road a tile Thing stands on (target.data.roadId). */
const roadOfTile = (t: Target): string | undefined => {
  const id = rec(t).roadId;
  return t.kind === 'tile' && typeof id === 'string' ? id : undefined;
};

registerTargetProvider({
  id: 'road-mend',
  kinds: ['tile'],
  list(state, t) {
    const r = routeById(state, roadOfTile(t) ?? '');
    if (!r || !roadNeedsMending(r)) return [];
    const short = Object.entries(ROADS.mendCost).filter(([id, n]) => !hasItem(state, id, n)).length + (toolAtHand(state, ROADS.mendTools) === null ? 1 : 0);
    const needs = [...Object.entries(ROADS.mendCost).map(([id, n]) => `${n} ${itemName(id).toLowerCase()}`), toolsText(ROADS.mendTools)].join(' and ');
    return [{ id: targetActionId('road.mend', t), label: short ? `Mend the road (needs ${needs})` : `Mend the road · ${roadWord(r)}`, short: 'Mend the road', family: 'work' }];
  },
  act(state, actionId, t) {
    if (verbOf(actionId) !== 'road.mend') return false;
    const roadId = roadOfTile(t);
    if (!roadId) return { ok: false, line: 'Stand on the road you mean to mend.' };
    return mendRoad(state, roadId);
  },
});

/** The logistics cart behind a `cart:<id>` wagon Thing. */
const cartOf = (state: SimState, t: Target) =>
  t.kind === 'wagon' && t.id.startsWith('cart:') ? state.logistics?.carts.find((c) => c.id === t.id.slice(5)) : undefined;

registerTargetProvider({
  id: 'cart-escort',
  kinds: ['wagon'],
  list(state, t) {
    const c = cartOf(state, t);
    if (!c || !cartPosition(c)) return [];
    const to = happeningTownName(c.toTownId);
    return [{ id: targetActionId('escort', t), label: `Escort this cart · ${plural(Math.max(1, c.daysLeft), 'day')} to ${to}`, short: 'Escort this cart', family: 'help' }];
  },
  act(state, actionId, t) {
    if (verbOf(actionId) !== 'escort' || !t.id.startsWith('cart:')) return false;
    const c = cartOf(state, t);
    if (!c) return { ok: false, line: 'The cart has gone on without you.' };
    return { ok: true, line: `You fall in beside the carter. ${plural(Math.max(1, c.daysLeft), 'day')} to ${happeningTownName(c.toTownId)}, with ${c.qty} ${itemName(c.itemId).toLowerCase()} aboard.` };
  },
});

const HIRE_LABEL: Record<HireTrade, string> = { guide_local: 'Hire a guide', escort_watch: 'Hire a watch' };

registerTargetProvider({
  id: 'waystation',
  kinds: ['facility'],
  list(state, t) {
    const place = isWaystation(state, t.id);
    if (!place) return [];
    const out: ProvidedAction[] = [
      { id: targetActionId('rest', t), label: `Rest the night · ${INNS.restCoin} coin for a bed`, short: 'Rest the night' },
    ];
    const heard = state.roadway?.heard?.[t.id];
    if (heard?.day !== state.day) out.push({ id: targetActionId('hear_talk', t), label: 'Hear the talk of the road', short: 'Hear the talk', family: 'ask' });
    for (const tradeId of INNS.hireTrades) {
      if (hiredOn(state, place.routeId, tradeId)) continue;
      const price = hirePrice(state, place, tradeId);
      if (price !== null) out.push({ id: targetActionId(`hire.${tradeId}`, t), label: `${HIRE_LABEL[tradeId]} · ${price} coin`, short: HIRE_LABEL[tradeId], family: 'deal' });
    }
    return out;
  },
  act(state, actionId, t) {
    if (!isWaystation(state, t.id)) return false;
    const verb = verbOf(actionId);
    if (verb === 'rest') return restAtInn(state, t.id);
    if (verb === 'hear_talk') return hearTalk(state, t.id);
    const trade = verb.startsWith('hire.') ? (verb.slice(5) as HireTrade) : undefined;
    if (trade && INNS.hireTrades.includes(trade)) return hireHelp(state, t.id, trade);
    return false;
  },
});

registerDawnLines('roads', roadDawnLines);

registerBoardPage({
  id: 'roads',
  title: 'The roads',
  render(s, townId, nameOf) {
    const routes = (s.economyRoutes ?? []).filter((r) => r.fromTownId === townId || r.toTownId === townId);
    if (!routes.length) return { lines: ['No road leaves here.'] };
    const lines: string[] = ['The roads out, as the carters tell it', ''];
    for (const r of routes) {
      const other = r.fromTownId === townId ? r.toTownId : r.fromTownId;
      const carts = (s.logistics?.carts ?? []).filter((c) => cartPosition(c)?.routeId === r.id);
      const watch = s.roadway?.watches?.[r.id];
      const bits = [`${roadWord(r)}`];
      if (carts.length) bits.push(`${plural(carts.length, 'cart')} on it`);
      if (watch && watch.until > s.day) bits.push(`${watch.name} keeps watch`);
      if (s.roadway?.crews?.[r.id]) bits.push(`${s.people[s.roadway.crews[r.id]!]?.name?.split(' ')[0] ?? 'someone'} is out mending it`);
      lines.push(`• To ${nameOf(other)}: ${bits.join(', ')}.`);
    }
    lines.push('', 'Mend a worn road: stand on it with stone, timber and tools. Walk beside a cart to see it safe. Rest, hear the talk and hire help at the waystations.');
    return { lines };
  },
});
