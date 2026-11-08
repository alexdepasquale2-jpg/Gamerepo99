/**
 * H9, notoriety drives encounters: the attractors in data/economy/notoriety.json become people at your
 * door. When a dawn attractor fires (att_tax_collector, att_patron_demand, att_spy) its caller walks into
 * the player's town; att_thief (a road-channel attractor) gets its own roll here and comes if there is
 * something to steal, taking a raid goal on the town's stash while they stay. Beggars come with the
 * despair of the towns around, petitioners with a shortage nearby and a name people know. The player
 * answers each with ring verbs: pay, refuse, confront, give, help, turn away. Pure + deterministic.
 */
import { addNotoriety, ensureHoard, noteCoinSpend, notorietyTable, siteInTown, totalGoods } from '../hoard';
import { townNeeds, supplyTown } from '../economy/village-economy';
import { priceAt } from '../goods/deed-goods';
import { removeItem } from '../goods/inventory';
import { findDeal } from '../patrons';
import { registerTargetProvider, type ActOutcome, type ProvidedAction } from '../play-session/action-providers';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { noteVisitorNews, registerVisitorSource, spawnVisitor, visitorOf, type Visitor, type VisitorKind, type VisitorSpec } from '../visitors';
import { coinHeld, fill, foodHeld, goodName, line, payCoin, townName, visitorVars, VL, warm } from './visitor-lines';

const SOURCE = 'notoriety-callers';
/** Dawn attractors (notoriety.json ids) that send someone in person. */
const CALLERS: Record<string, VisitorKind> = { att_tax_collector: 'tax_collector', att_patron_demand: 'patron_man', att_spy: 'spy' };
const THIEF = 'att_thief';
const THIEF_COIN = 8;
const BEGGAR = { base: 0.05, despair: 0.3, notoriety: 0.2 };
const PETITION = { base: 0.08, notoriety: 0.5, minNotoriety: 0.1, gift: 2 };

const notoriety = (state: SimState): number => ensureHoard(state).notoriety;
const despairOf = (state: SimState, townId: string): number => state.towns?.[townId]?.despair ?? 0;

function neighbours(state: SimState, townId: string): string[] {
  const out = new Set<string>();
  for (const r of state.economyRoutes ?? []) {
    if (r.fromTownId === townId) out.add(r.toTownId);
    if (r.toTownId === townId) out.add(r.fromTownId);
  }
  out.delete(townId);
  return [...out].sort();
}

/** The live patron deal a demand is about (the soonest due), if the player has one. */
function activeDeal(state: SimState): { patronName: string } | undefined {
  const ids = Object.keys(state.patronDeals ?? {}).filter((id) => state.patronDeals![id]!.status === 'active').sort((a, b) => state.patronDeals![a]!.dueDay - state.patronDeals![b]!.dueDay || a.localeCompare(b));
  const found = ids.map((id) => findDeal(state, id)).find((f) => !!f);
  return found ? { patronName: found.patron.name } : undefined;
}

/** Something worth stealing in this town: a stocked stash, or a heavy purse. */
function stashWorthRaiding(state: SimState, townId: string): string | undefined {
  const site = siteInTown(state, townId);
  const s = site ? ensureHoard(state).stash[site.id] : undefined;
  return site && s && s.coin + totalGoods(s) > 0 ? site.id : undefined;
}

function spawnCallers(state: SimState): void {
  const town = state.player.townId;
  if (!town) return;
  const n = notoriety(state);
  const h = ensureHoard(state);
  const fired = h.attractorsToday?.day === state.day ? h.attractorsToday.ids : [];
  const specs: VisitorSpec[] = [];
  const base = { source: SOURCE, townId: town, homeTownId: town };

  for (const [att, kind] of Object.entries(CALLERS)) {
    if (!fired.includes(att)) continue;
    if (kind === 'tax_collector') specs.push({ ...base, kind, attractorId: att, stayDays: 1, coin: Math.max(2, Math.round(2 + n * 16)), reason: VL.reason.tax_collector! });
    else if (kind === 'patron_man') {
      const deal = activeDeal(state);
      if (deal) specs.push({ ...base, kind, attractorId: att, stayDays: 1, coin: Math.max(3, Math.round(3 + n * 12)), item: deal.patronName, reason: fill(VL.reason.patron_man!, { patron: deal.patronName }) });
    } else specs.push({ ...base, kind, attractorId: att, stayDays: 1, reason: VL.reason.spy! });
  }

  const thief = notorietyTable(state)?.attractors.find((a) => a.id === THIEF);
  const scale = notorietyTable(state)?.attractorRollScale ?? 0.25;
  const loot = stashWorthRaiding(state, town);
  if (thief && n >= thief.minNotoriety && (loot || coinHeld(state) >= THIEF_COIN) && deriveRng(state.seed, 'visitor-thief', state.day).next() < Math.min(1, thief.weight * n * scale)) {
    specs.push({ ...base, kind: 'thief', attractorId: THIEF, stayDays: 2, item: loot, reason: VL.reason.thief! });
  }

  const around = [town, ...neighbours(state, town)];
  const bleakest = [...around].sort((a, b) => despairOf(state, b) - despairOf(state, a) || a.localeCompare(b))[0]!;
  if (deriveRng(state.seed, 'visitor-beggar', state.day).next() < BEGGAR.base + BEGGAR.despair * despairOf(state, bleakest) + BEGGAR.notoriety * n) {
    specs.push({ ...base, kind: 'beggar', homeTownId: bleakest, stayDays: 1, reason: fill(VL.reason.beggar!, { home: townName(state, bleakest) }) });
  }

  // A neighbour's shortage first: petitioners walk over; failing that, someone from here asks.
  const short = [...around.slice(1), town].flatMap((t) => townNeeds(state, t).slice(0, 1).map((need) => ({ t, item: need.itemId })))[0];
  if (short && n >= PETITION.minNotoriety && deriveRng(state.seed, 'visitor-petition', state.day).next() < PETITION.base + PETITION.notoriety * Math.min(1, n)) {
    const coin = Math.max(2, priceAt(state, short.t, short.item) * PETITION.gift);
    specs.push({ ...base, kind: 'petitioner', homeTownId: short.t, stayDays: 2, item: short.item, coin, reason: fill(VL.reason.petitioner!, { home: townName(state, short.t) }) });
  }

  for (const spec of specs) {
    const id = spawnVisitor(state, spec);
    if (!id) break; // the town is full of callers
    const v = visitorOf(state, id)!;
    if (v.kind === 'thief' && v.item) (h.raiders ??= {})[v.item] ??= id;
    const local = (v.kind === 'beggar' || v.kind === 'petitioner') && v.homeTownId === town;
    noteVisitorNews(state, town, id, line(VL.news, local ? `${v.kind}_local` : v.kind, id, visitorVars(state, v, { patron: v.kind === 'patron_man' ? v.item : undefined })));
  }
}

registerVisitorSource({ id: SOURCE, spawn: spawnCallers });

// ---------- verbs ----------

const ours = (state: SimState, id: string): Visitor | undefined => {
  const v = visitorOf(state, id);
  return v && v.source === SOURCE ? v : undefined;
};

/** Answered: they go at the next dawn. */
function answer(state: SimState, v: Visitor, how: NonNullable<Visitor['answered']>): void {
  v.answered = how;
  v.leaveBy = Math.min(v.leaveBy, state.day);
}

function dropRaid(state: SimState, v: Visitor): void {
  const raiders = state.hoard?.raiders;
  if (raiders && v.item && raiders[v.item] === v.id) delete raiders[v.item];
}

const pay = (v: Visitor): number => v.coin ?? (v.kind === 'thief' ? 3 : 1);

registerTargetProvider({
  id: 'notoriety-callers',
  kinds: ['person'],
  list(state, target) {
    const v = ours(state, target.id);
    if (!v) return [];
    const id = v.id;
    const out: ProvidedAction[] = [{ id: `call_ask@${id}`, label: 'Ask what they want', short: 'What they want', family: 'ask' }];
    if (v.answered) return out;
    const c = pay(v);
    switch (v.kind) {
      case 'tax_collector':
        out.push({ id: `call_pay@${id}`, label: `Pay the tax (${c} coin)`, short: 'Pay the tax', family: 'deal' });
        out.push({ id: `call_refuse@${id}`, label: 'Refuse the tax', short: 'Refuse', family: 'deal' });
        break;
      case 'patron_man':
        out.push({ id: `call_pay@${id}`, label: `Pay the ${v.item ?? 'patron'} (${c} coin)`, short: 'Pay what is owed', family: 'deal' });
        out.push({ id: `call_refuse@${id}`, label: `Refuse the ${v.item ?? 'patron'}'s man`, short: 'Refuse', family: 'deal' });
        break;
      case 'thief':
        out.push({ id: `call_confront@${id}`, label: 'Confront them in the street', short: 'Confront them', family: 'help' });
        out.push({ id: `call_pay@${id}`, label: `Pay them to move on (${c} coin)`, short: 'Pay them off', family: 'deal' });
        break;
      case 'spy':
        out.push({ id: `call_tale@${id}`, label: 'Tell them a dull tale', short: 'Tell a dull tale', family: 'deal' });
        out.push({ id: `call_refuse@${id}`, label: 'Send them off', short: 'Send them off', family: 'help' });
        break;
      case 'beggar':
        if (coinHeld(state) >= 1) out.push({ id: `call_coin@${id}`, label: 'Give them a coin', short: 'Give a coin', family: 'give' });
        if (foodHeld(state)) out.push({ id: `call_food@${id}`, label: 'Share food with them', short: 'Share food', family: 'give' });
        out.push({ id: `call_refuse@${id}`, label: 'Turn them away', short: 'Turn away', family: 'give' });
        break;
      case 'petitioner':
        out.push({ id: `call_help@${id}`, label: `Take up their cause: ${goodName(v.item)} for ${townName(state, v.homeTownId)} (${c} coin)`, short: 'Take it up', family: 'help' });
        out.push({ id: `call_refuse@${id}`, label: 'Turn them away', short: 'Turn away', family: 'help' });
        break;
      default:
        break;
    }
    return out;
  },
  act(state, actionId, target): ActOutcome | false {
    const v = ours(state, target.id);
    const at = actionId.indexOf('@');
    if (!v || at < 0 || !actionId.startsWith('call_')) return false;
    const verb = actionId.slice(0, at);
    const key = `${state.day}:${v.id}:${verb}`;
    const vars = visitorVars(state, v, { patron: v.kind === 'patron_man' ? v.item : undefined });
    const say = (k: string, ok = true): ActOutcome => ({ ok, line: line(VL.answers, k, key, vars) });
    const kind = v.kind === 'tax_collector' ? 'tax' : v.kind === 'patron_man' ? 'patron' : v.kind;
    if (verb === 'call_ask') return say(v.answered ? 'answered' : `ask_${v.kind}`);
    if (v.answered) return say('answered');
    switch (verb) {
      case 'call_pay': {
        const c = pay(v);
        if (!payCoin(state, c)) return { ok: false, line: `They want ${c} coin. You haven't enough.` };
        noteCoinSpend(state, c);
        dropRaid(state, v);
        answer(state, v, 'paid');
        return say(`pay_${kind}`);
      }
      case 'call_refuse':
        // Turning away a demand makes a name for you; turning away the poor only makes a bad day.
        if (v.kind === 'tax_collector' || v.kind === 'patron_man') addNotoriety(state, 'gain_refuse_tax');
        answer(state, v, 'refused');
        return say(v.kind === 'spy' ? 'send_spy' : `refuse_${kind}`);
      case 'call_confront':
        addNotoriety(state, 'gain_public_theft_defense');
        dropRaid(state, v);
        answer(state, v, 'refused');
        return say('confront_thief');
      case 'call_tale':
        addNotoriety(state, 'loss_lie_low');
        answer(state, v, 'paid');
        return say('tale_spy');
      case 'call_coin':
        if (!payCoin(state, 1)) return { ok: false, line: "You haven't a coin to give." };
        addNotoriety(state, 'loss_quiet_charity');
        warm(state, v.id, 8);
        answer(state, v, 'helped');
        return say('coin_beggar');
      case 'call_food': {
        const food = foodHeld(state);
        if (!food || !removeItem(state, food, 1)) return { ok: false, line: 'You have nothing to share.' };
        addNotoriety(state, 'loss_quiet_charity');
        warm(state, v.id, 10);
        answer(state, v, 'helped');
        return say('food_beggar');
      }
      case 'call_help': {
        const c = pay(v);
        if (!payCoin(state, c)) return { ok: false, line: `That's ${c} coin. You haven't enough.` };
        noteCoinSpend(state, c);
        const home = v.homeTownId ?? v.townId;
        if (home && v.item) supplyTown(state, home, v.item, PETITION.gift);
        const t = home ? state.towns?.[home] : undefined;
        if (t) t.despair = Math.max(0, t.despair - 0.02);
        warm(state, v.id, 10);
        answer(state, v, 'helped');
        return say('help_petitioner');
      }
      default:
        return false;
    }
  },
});
