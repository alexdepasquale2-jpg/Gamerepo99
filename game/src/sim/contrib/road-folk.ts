/**
 * G7, people on the road: pilgrims walking to a town's chapel (economy/polity creeds), couriers carrying
 * word between towns, refugees leaving war or despair, and pedlars carrying a town's surplus to a town
 * that is short of it (economy/village-economy). They spawn near the player (their town and its road
 * neighbours), walk the road for real (sim/visitors), and are people with ring verbs: ask where they're
 * bound, ask a blessing, ask for news, feed or guide a refugee (a helped refugee settles where the road
 * ends). A pedlar's pack is bought from through the shop sheet ("Browse wares", contrib/shop and
 * goods/shop), the one way to deal with them, so there is no buy chip here. Pure + deterministic.
 */
import { doctrineRow } from '../doctrine-tick';
import { atWar, CREEDS } from '../economy/polity';
import { COVER_DAYS, scarcity, supplyTown } from '../economy/village-economy';
import { removeItem } from '../goods/inventory';
import { registerTargetProvider, type ActOutcome, type ProvidedAction } from '../play-session/action-providers';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { noteVisitorNews, registerVisitorSource, roadVisitors, settleVisitor, spawnVisitor, visitorOf, type Visitor, type VisitorKind } from '../visitors';
import { legitimacyShort } from './power-page';
import { coinHeld, fill, foodHeld, goodName, line, payCoin, pickLine, townName, visitorVars, VL, warm } from './visitor-lines';

const SOURCE = 'road-folk';
const KINDS: readonly VisitorKind[] = ['pilgrim', 'courier', 'refugee', 'pedlar'];
const CHANCE: Record<string, number> = { pilgrim: 0.35, courier: 0.3, refugee: 0.5, pedlar: 0.4 };
const REFUGEE_DESPAIR = 0.6;
const PEDLAR_MAX = 4;
const PEDLAR_SURPLUS = 4;
const PEDLAR_SHORT = 0.3;

// ---------- where ----------

/** Road neighbours of a town (sorted). */
function neighbours(state: SimState, townId: string): string[] {
  const out = new Set<string>();
  for (const r of state.economyRoutes ?? []) {
    if (r.fromTownId === townId) out.add(r.toTownId);
    if (r.toTownId === townId) out.add(r.fromTownId);
  }
  out.delete(townId);
  return [...out].sort();
}

/** The player's town and its road neighbours: the roads the player is likely to walk. */
function nearTowns(state: SimState): string[] {
  const home = state.player.townId;
  return home ? [home, ...neighbours(state, home)] : [];
}

const despairOf = (state: SimState, townId: string): number => state.towns?.[townId]?.despair ?? 0;
const onlyOne = <T>(xs: T[], rng: { int(a: number, b: number): number }): T | undefined => (xs.length ? xs[rng.int(0, xs.length)] : undefined);

// ---------- who comes ----------

type Plan = { homeTownId: string; toTownId: string; reason: string; stayDays: number; item?: string; qty?: number; take?: () => void };

function planPilgrim(state: SimState, rng: ReturnType<typeof deriveRng>): Plan | undefined {
  const shrines = nearTowns(state).filter((t) => state.polity?.faiths[t]);
  const to = onlyOne(shrines, rng);
  if (!to) return undefined;
  const from = onlyOne(neighbours(state, to), rng);
  const creed = CREEDS.find((c) => c.id === state.polity?.faiths[to]?.creed);
  if (!from || !creed) return undefined;
  return { homeTownId: from, toTownId: to, stayDays: 1, reason: fill(VL.reason.pilgrim!, { to: townName(state, to), creed: creed.name }) };
}

function planCourier(state: SimState, rng: ReturnType<typeof deriveRng>): Plan | undefined {
  const home = state.player.townId;
  if (!home) return undefined;
  const other = onlyOne(neighbours(state, home), rng);
  if (!other) return undefined;
  const [from, to] = rng.next() < 0.5 ? [home, other] : [other, home];
  return { homeTownId: from, toTownId: to, stayDays: 0, reason: fill(VL.reason.courier!, { home: townName(state, from), to: townName(state, to) }) };
}

function warOf(state: SimState, townId: string): string | undefined {
  const w = (state.polity?.wars ?? []).find((x) => x.status === 'active' && (x.aggressor === townId || x.defender === townId));
  return w ? (w.aggressor === townId ? w.defender : w.aggressor) : undefined;
}

function planRefugee(state: SimState, rng: ReturnType<typeof deriveRng>): Plan | undefined {
  const troubled = nearTowns(state).filter((t) => warOf(state, t) || despairOf(state, t) >= REFUGEE_DESPAIR);
  const from = onlyOne(troubled, rng);
  if (!from) return undefined;
  const safe = neighbours(state, from).filter((t) => !atWar(state, from, t)).sort((a, b) => despairOf(state, a) - despairOf(state, b) || a.localeCompare(b));
  const to = safe[0];
  if (!to) return undefined;
  const reason = fill(warOf(state, from) ? VL.reason.refugee_war! : VL.reason.refugee_despair!, { home: townName(state, from) });
  return { homeTownId: from, toTownId: to, stayDays: 2, reason };
}

function planPedlar(state: SimState, rng: ReturnType<typeof deriveRng>): Plan | undefined {
  const offers: Plan[] = [];
  for (const from of nearTowns(state)) {
    const l = state.villageEconomy?.towns[from];
    if (!l) continue;
    for (const item of Object.keys(l.goods).sort()) {
      const surplus = (l.goods[item] ?? 0) - (l.need[item] ?? 0) * COVER_DAYS;
      if (surplus < PEDLAR_SURPLUS) continue;
      const to = neighbours(state, from).find((t) => scarcity(state, t, item) >= PEDLAR_SHORT);
      if (!to) continue;
      const qty = Math.min(PEDLAR_MAX, Math.floor(surplus / 2));
      offers.push({
        homeTownId: from, toTownId: to, stayDays: 1, item, qty,
        reason: fill(VL.reason.pedlar!, { item: goodName(item), to: townName(state, to) }),
        take: () => { l.goods[item] = Math.max(0, (l.goods[item] ?? 0) - qty); },
      });
    }
  }
  return onlyOne(offers, rng);
}

const PLANS: Record<string, (s: SimState, r: ReturnType<typeof deriveRng>) => Plan | undefined> = {
  pilgrim: planPilgrim, courier: planCourier, refugee: planRefugee, pedlar: planPedlar,
};

function spawnRoadFolk(state: SimState): void {
  for (const kind of KINDS) {
    const rng = deriveRng(state.seed, 'road-folk', state.day, kind);
    if (rng.next() >= CHANCE[kind]!) continue;
    // One of a kind on the roads at a time keeps the roads varied.
    if (roadVisitors(state).some((v) => v.kind === kind)) continue;
    const plan = PLANS[kind]!(state, rng);
    if (!plan) continue;
    const id = spawnVisitor(state, { kind, source: SOURCE, ...plan });
    if (!id) continue;
    plan.take?.();
    const v = visitorOf(state, id)!;
    const home = state.player.townId;
    if (plan.homeTownId === home || plan.toTownId === home) {
      noteVisitorNews(state, home, id, line(VL.news, `setout_${kind}`, id, visitorVars(state, v)));
    }
  }
}

registerVisitorSource({
  id: SOURCE,
  spawn: spawnRoadFolk,
  arrive(state, v) {
    let key = `arrive_${v.kind}`;
    let settle = false;
    if (v.kind === 'pedlar' && v.item && (v.qty ?? 0) > 1) {
      // Most goes to the town's store; one is kept back for anyone who asks.
      supplyTown(state, v.townId!, v.item, v.qty! - 1);
      v.qty = 1;
    }
    if (v.kind === 'refugee' && v.answered === 'helped') { key = 'settled_refugee'; settle = true; }
    if (v.townId === state.player.townId) noteVisitorNews(state, v.townId, v.id, line(VL.news, key, v.id, visitorVars(state, v)));
    return settle ? 'settle' : 'stay';
  },
  leave(state, v) {
    if (v.kind === 'pedlar' && v.item && (v.qty ?? 0) > 0 && v.townId) supplyTown(state, v.townId, v.item, v.qty!);
  },
});

// ---------- verbs ----------

const ours = (state: SimState, id: string): Visitor | undefined => {
  const v = visitorOf(state, id);
  return v && v.source === SOURCE ? v : undefined;
};

/** What the courier's home town is like, in a few words. */
function townNews(state: SimState, townId: string | undefined): string {
  if (!townId) return VL.townNews.quiet!;
  const other = warOf(state, townId);
  if (other) return fill(VL.townNews.war!, { other: townName(state, other) });
  const docs = Object.values(state.doctrines ?? {}).filter((d) => d.townId === townId).sort((a, b) => a.id.localeCompare(b.id));
  const name = (id: string): string => doctrineRow(state, id)?.name ?? 'compact';
  if (docs.some((d) => d.collapsed)) return fill(VL.townNews.fallen!, { doctrine: name(docs.find((d) => d.collapsed)!.id) });
  if (despairOf(state, townId) >= 0.5) return VL.townNews.despair!;
  const live = docs.find((d) => !d.collapsed);
  return live ? fill(VL.townNews.calm!, { doctrine: name(live.id), standing: legitimacyShort(live.legitimacy) }) : VL.townNews.quiet!;
}

/** A refugee who has been helped stays: at the end of the road, or here and now if they have arrived. */
function helpRefugee(state: SimState, v: Visitor, by: number): void {
  warm(state, v.id, by);
  v.answered = 'helped';
  if (!v.legs && v.townId) settleVisitor(state, v.id, v.townId);
}

registerTargetProvider({
  id: 'road-folk',
  kinds: ['person'],
  list(state, target) {
    const v = ours(state, target.id);
    if (!v) return [];
    const id = v.id;
    const out: ProvidedAction[] = [{ id: `road_bound@${id}`, label: v.legs ? 'Ask where they are bound' : 'Ask about their road', short: 'Where bound?', family: 'ask' }];
    if (v.kind === 'pilgrim') out.push({ id: `road_bless@${id}`, label: 'Ask their blessing', short: 'Ask a blessing', family: 'ask' });
    if (v.kind === 'courier') out.push({ id: `road_news@${id}`, label: 'Ask for news from their road', short: 'Ask for news', family: 'ask' });
    if (v.kind === 'refugee' && v.answered !== 'helped') {
      if (foodHeld(state)) out.push({ id: `road_food@${id}`, label: 'Share food with them', short: 'Share food', family: 'give' });
      if (coinHeld(state) >= 1) out.push({ id: `road_coin@${id}`, label: 'Give them a coin for the road', short: 'Give a coin', family: 'give' });
      if (v.legs) out.push({ id: `road_point@${id}`, label: `Point the way to ${townName(state, v.toTownId)}`, short: 'Point the way', family: 'help' });
    }
    return out;
  },
  act(state, actionId, target): ActOutcome | false {
    const v = ours(state, target.id);
    const at = actionId.indexOf('@');
    if (!v || at < 0 || !actionId.startsWith('road_')) return false;
    const verb = actionId.slice(0, at);
    const key = `${state.day}:${v.id}:${verb}`;
    const vars = visitorVars(state, v);
    const say = (k: string, extra = {}): ActOutcome => ({ ok: true, line: line(VL.answers, k, key, { ...vars, ...extra }) });
    switch (verb) {
      case 'road_bound':
        return { ok: true, line: fill(pickLine(v.legs ? VL.bound[v.kind] : VL.bound.arrived, key), vars) };
      case 'road_bless': {
        if (v.answered) return say('blessed_pilgrim');
        const max = state.player.sparkMax ?? 100;
        state.player.spark = Math.min(max, state.player.spark + 1);
        warm(state, v.id, 3);
        v.answered = 'helped';
        return say('bless_pilgrim');
      }
      case 'road_news':
        return say('news_courier', { news: townNews(state, v.homeTownId) });
      case 'road_food': {
        const food = foodHeld(state);
        if (!food || !removeItem(state, food, 1)) return { ok: false, line: 'You have nothing to share.' };
        helpRefugee(state, v, 8);
        return say('food_refugee');
      }
      case 'road_coin':
        if (!payCoin(state, 1)) return { ok: false, line: "You haven't a coin to give." };
        helpRefugee(state, v, 5);
        return say('coin_refugee');
      case 'road_point':
        helpRefugee(state, v, 4);
        return say('point_refugee');
      default:
        return false;
    }
  },
});
