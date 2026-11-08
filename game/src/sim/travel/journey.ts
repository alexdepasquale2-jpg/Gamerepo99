/**
 * A whole journey down one road, on foot or with a hired traveller (road-content-design §3–§5).
 * Each road day is a real world day (the caller's dawn pipeline), the body only gains the road's +2 spark,
 * encounters roll by encounter-density.json and apply their authored effects, and a crooked traveller can
 * overcharge, stray or rob you. Returns the lines the player hears on arrival. Pure sim: no Phaser/DOM.
 */
import { addStock } from '../economy/food-stock';
import { noteCoinSpend } from '../hoard/events';
import { attractorRoadBonus } from '../hoard/notoriety';
import { ensureHoard } from '../hoard/state';
import { addItem, inventoryOf } from '../goods/inventory';
import { pushJuice } from '../packets';
import { deriveRng, type Rng } from '../rng';
import { innStop, takeRoadHelp } from '../economy/waystations';
import {
  clamp01,
  fill,
  hiredDays,
  loadTravelTrades,
  posedAs,
  roadMemory,
  roadOffers,
  roadVoice,
  tradePrice,
  tradeReliability,
  tradeTrust,
  type RoadOffer,
  type TravelTrade,
} from './road-trades';
import { loadEncounterDensity, loadEncounterTables, loadSizeTravelMuls } from './travel-tables';
import type { EncounterEntry, EncounterTable, TravelRoute, TravelSimState } from './travel-types';
import { resolveDaysEff, sizeMulFor } from './travel';

export type JourneyCheat = 'overcharged' | 'strayed' | 'robbed';

export type JourneyResult = {
  ok: boolean;
  reason?: 'no_route' | 'not_here' | 'not_on_offer' | 'cant_pay';
  routeId: string;
  fromId?: string;
  toId?: string;
  days: number;
  startDay: number;
  endDay: number;
  tradeId?: string;
  offer?: RoadOffer;
  paidSpark: number;
  paidCoin: number;
  cheat?: JourneyCheat;
  encounters: { day: number; id: string; quiet: boolean; blurb?: string }[];
  lines: string[];
};

export type JourneyOpts = {
  tradeId?: string;
  /** Run one whole world day (dusk-free dawn pipeline). Absent: only the calendar moves. */
  runDay?: (state: TravelSimState) => void;
  nameOf?: (townId: string) => string;
  /** Walk beside this logistics cart to its town instead (sim/travel/escort; routeId is then ignored). */
  escortCartId?: string;
  /** Stop a night at this waystation on the road, partway (sim/economy/waystations). */
  stopAt?: string;
};

/** One road out of the player's town, with today's travellers. */
export type RoadView = { routeId: string; toId: string; walkDays: number; offers: RoadOffer[] };

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

function sparkMaxOf(state: TravelSimState): number {
  const d = (state.data as { player?: { defaults?: { sparkMax?: number } } } | undefined)?.player?.defaults?.sparkMax;
  return typeof state.player.sparkMax === 'number' ? state.player.sparkMax : typeof d === 'number' ? d : 100;
}

function sizeMul(state: TravelSimState): number {
  return sizeMulFor(state.player, state.sizeTravelMuls ?? loadSizeTravelMuls());
}

function routeHere(state: TravelSimState, routeId: string): { route: TravelRoute; to: string } | null {
  const route = (state.routes ?? []).find((r) => r.id === routeId);
  const here = state.player.townId;
  if (!route || (here !== route.fromId && here !== route.toId)) return null;
  return { route, to: here === route.fromId ? route.toId : route.fromId };
}

/** Every road out of here, with destination, days on foot and 1–3 seeded travellers for hire today. */
export function roadViews(state: TravelSimState): RoadView[] {
  const here = state.player.townId;
  if (!here) return [];
  return (state.routes ?? [])
    .filter((r) => r.fromId === here || r.toId === here)
    .map((route) => {
      const walkDays = resolveDaysEff(route, state);
      return {
        routeId: route.id,
        toId: route.fromId === here ? route.toId : route.fromId,
        walkDays,
        offers: roadOffers(state, route, { walkDays, sizeMul: sizeMul(state) }),
      };
    });
}

/** Authored table, else one picked by route id so each road keeps its own character. */
export function tableFor(route: TravelRoute, tables: EncounterTable[]): EncounterTable | undefined {
  const authored = route.encounterTableId && tables.find((t) => t.id === route.encounterTableId);
  if (authored) return authored;
  let h = 0;
  for (const c of route.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return tables.length ? tables[h % tables.length] : undefined;
}

export const isQuiet = (e: EncounterEntry): boolean => !!e.quiet || !!e.tags?.includes('quiet');
const isBad = (e: EncounterEntry): boolean =>
  !!e.tags?.some((t) => t === 'hostile' || t === 'break' || t === 'notoriety') ||
  !!e.effects?.some((f) => (f.target === 'player.spark' && f.value < 0) || (f.target === 'town.despair' && f.value > 0) || (f.target === 'route.condition' && f.value < 0));

function weighted(entries: Array<{ e: EncounterEntry; w: number }>, rng: Rng): EncounterEntry | null {
  const total = entries.reduce((a, x) => a + x.w, 0);
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (const x of entries) {
    roll -= x.w;
    if (roll < 0) return x.e;
  }
  return entries[entries.length - 1]!.e;
}

function highwaymanEntry(): EncounterEntry {
  const h = roadVoice().highwayman;
  return { id: h.id, weight: h.weight, blurb: h.blurb, heard: h.heard, tags: h.tags, prism: 'encounter.spawn.highwayman' };
}

export type RollCtx = { route: TravelRoute; cond: number; cooldown: boolean; escortMul: number; reroll: boolean };

/** §5 roll: pSpawn chance of a meaningful beat, else a quiet stretch; cooldown keeps hostiles from chaining. */
export function rollEncounter(state: TravelSimState, table: EncounterTable | undefined, rng: Rng, ctx: RollCtx): EncounterEntry | null {
  if (!table?.entries.length) return null;
  const d = loadEncounterDensity();
  const biomes = (ctx.route.biomeIds ?? []).map((b) => d.biomeWeightMul[b]).filter((m): m is number => typeof m === 'number');
  const biomeMul = biomes.length ? biomes.reduce((a, b) => a + b, 0) / biomes.length : 1;
  const condMul = d.conditionWeightMul.base - d.conditionWeightMul.conditionCoef * ctx.cond;
  const pSpawn = Math.min(d.pSpawnClamp.max, Math.max(d.pSpawnClamp.min, d.targetEncountersPerTravelDay * biomeMul * condMul));
  const quiet = table.entries.filter(isQuiet).map((e) => ({ e, w: Math.max(0, e.weight) }));
  const pickQuiet = (): EncounterEntry | null => weighted(quiet, rng);
  if (rng.next() > pSpawn) return pickQuiet();
  const blocked = (e: EncounterEntry): boolean => ctx.cooldown && !!e.tags?.some((t) => d.cooldownBlocksTags.includes(t));
  const loud = [...table.entries.filter((e) => !isQuiet(e)), highwaymanEntry()]
    .filter((e) => !blocked(e))
    .map((e) => {
      let w = Math.max(0, e.weight) + (e.attractorId ? attractorRoadBonus(state, e.attractorId) : 0);
      if (isBad(e)) w *= condMul;
      if (e.id === roadVoice().highwayman.id) w *= ctx.escortMul;
      return { e, w };
    });
  let hit = weighted(loud, rng);
  // A guide knows the road: one reroll away from trouble.
  if (hit && ctx.reroll && isBad(hit)) hit = weighted(loud, rng);
  return hit ?? pickQuiet();
}

export function applyEffects(state: TravelSimState, entry: EncounterEntry, route: TravelRoute, fromId: string, toId: string, sparkMax: number): void {
  for (const f of entry.effects ?? []) {
    if (f.op !== 'add' || typeof f.value !== 'number') continue;
    if (f.target === 'player.spark') state.player.spark = Math.max(0, Math.min(sparkMax, state.player.spark + f.value));
    else if (f.target.startsWith('town.stock.')) {
      const town = state.towns?.[f.townId ?? ''] ?? state.towns?.[toId];
      // town.stock.food_grain names the town's one food stock (the village ledger), like any other resource.
      if (town) addStock(state, town.id, f.target.slice('town.stock.'.length), f.value);
    } else if (f.target === 'town.despair') {
      const town = state.towns?.[f.townId ?? ''] ?? state.towns?.[fromId];
      if (town) town.despair = clamp01(town.despair + f.value);
    } else if (f.target === 'route.condition') {
      const r = state.economyRoutes?.find((x) => x.id === route.id);
      if (r) r.condition = clamp01(r.condition + f.value);
    }
  }
}

/** Coin is satchel coin (inventory.coin; player.coin mirrors it). */
export const coinOf = (state: TravelSimState): number => Math.max(0, inventoryOf(state).coin ?? 0);
const loseCoin = (state: TravelSimState, n: number): void => {
  if (n > 0) addItem(state, 'coin', -Math.min(n, coinOf(state)));
};

/** Spend spark and coin; coin you don't have is paid in warmth, two spark a coin. */
function pay(state: TravelSimState, spark: number, coin: number): { spark: number; coin: number } {
  const paidCoin = Math.min(coinOf(state), coin);
  const paidSpark = spark + (coin - paidCoin) * 2;
  if (paidCoin > 0) {
    loseCoin(state, paidCoin);
    noteCoinSpend(state, paidCoin);
  }
  state.player.spark = Math.max(0, state.player.spark - paidSpark);
  return { spark: paidSpark, coin: paidCoin };
}

function addExposure(state: TravelSimState, add: number): void {
  const h = ensureHoard(state);
  h.notoriety = clamp01(h.notoriety + add);
  state.flags.notoriety = h.notoriety;
}

/** Walk (no tradeId) or ride with one of today's travellers down routeId to the far town. */
export function runJourney(state: TravelSimState, routeId: string, opts: JourneyOpts = {}): JourneyResult {
  const startDay = state.day;
  const fail = (reason: JourneyResult['reason']): JourneyResult => ({
    ok: false, reason, routeId, days: 0, startDay, endDay: startDay, paidSpark: 0, paidCoin: 0, encounters: [], lines: [],
  });
  const at = routeHere(state, routeId);
  if (!at) return fail((state.routes ?? []).some((r) => r.id === routeId) ? 'not_here' : 'no_route');
  const { route, to } = at;
  const from = state.player.townId!;
  const name = (id: string): string => opts.nameOf?.(id) ?? id;
  const walkDays = resolveDaysEff(route, state);
  const sparkMax = sparkMaxOf(state);
  const voice = roadVoice();
  const out = voice.outcome;

  let trade: TravelTrade | undefined;
  let offer: RoadOffer | undefined;
  if (opts.tradeId) {
    offer = roadOffers(state, route, { walkDays, sizeMul: sizeMul(state) }).find((o) => o.tradeId === opts.tradeId);
    trade = loadTravelTrades().find((t) => t.id === opts.tradeId);
    if (!offer || !trade) return fail('not_on_offer');
    const shortCoin = Math.max(0, offer.coin - coinOf(state));
    if (state.player.spark - offer.spark - shortCoin * 2 < 1) return fail('cant_pay');
  }
  const paid = offer ? pay(state, offer.spark, offer.coin) : { spark: 0, coin: 0 };
  const vars = { to: name(to), name: offer?.name ?? '', role: offer?.roleLabel ?? '' };
  const lines: string[] = [];
  const tail: string[] = [];
  const rng = deriveRng(state.seed, 'journey', startDay, routeId, opts.tradeId ?? 'walk');
  const reliability = trade ? tradeReliability(state, trade, route) : 1;
  const failMul = loadEncounterDensity().failChanceMul;
  let days = trade ? hiredDays(walkDays, trade.speedMul) : walkDays;
  let riding = !!trade;
  let cheat: JourneyCheat | undefined;

  // A courier carries the letters already bound for where you're going.
  if (trade?.packetDaysMul !== undefined) {
    let carried = 0;
    for (const p of state.packets ?? []) {
      if (p.fromTownId === from && p.toTownId === to && p.days > 0) {
        p.days = Math.max(0, Math.floor(p.days * trade.packetDaysMul));
        carried++;
      }
    }
    if (carried) tail.push(fill(out.courier, vars));
  }

  const table = tableFor(route, state.encounterTables ?? loadEncounterTables());
  const cond = (): number => clamp01(state.economyRoutes?.find((x) => x.id === route.id)?.condition ?? 1);
  const encounters: JourneyResult['encounters'] = [];
  let cooldown = 0;
  // Help hired at a waystation on this road walks with you; a night at a waystation partway is safe.
  const help = takeRoadHelp(state, route.id);
  tail.push(...help.lines);
  const stopIdx = opts.stopAt ? Math.floor((days - 1) / 2) : -1;

  for (let i = 0; i < days; i++) {
    const before = state.player.spark;
    if (opts.runDay) opts.runDay(state);
    else state.day += 1;
    // Loom pacing: the road gives +2 a day, never a hearth's rest (world costs that landed today still count).
    state.player.spark = Math.min(sparkMax, Math.min(state.player.spark, before) + 2);
    pushJuice(state, 'route.travel_step', { routeId, step: i + 1, daysEff: days, day: state.day, tradeId: trade?.id });
    const stop = i === stopIdx && opts.stopAt ? innStop(state, route.id, opts.stopAt) : null;
    if (stop) {
      state.player.spark = Math.min(sparkMax, Math.min(state.player.spark, before) + stop.spark);
      tail.unshift(stop.line);
      continue;
    }

    let forced: EncounterEntry | null = null;
    if (riding && trade) {
      const failed = rng.next() < (1 - reliability) * failMul;
      // A posed highwayman always turns before the end of the road; others fail on a bad day.
      if (trade.hostile && (failed || (trade.ambushAfterHire && i === days - 1))) {
        const lostSpark = 2 + Math.floor(rng.next() * 3);
        const lostCoin = Math.ceil(coinOf(state) / 2);
        state.player.spark = Math.max(0, state.player.spark - lostSpark);
        loseCoin(state, lostCoin);
        tail.push(fill(out.robbed, { ...vars, lost: lostCoin ? `${lostCoin} coin and ${lostSpark} spark` : `${lostSpark} spark` }));
        cheat = 'robbed';
        riding = false;
        days += 1; // you walk the rest
        forced = highwaymanEntry();
      } else if (failed) {
        if (trade.lieDays) days += 1; // the 'shortcut' doubles back
        if (trade.exposureAdd) addExposure(state, trade.exposureAdd);
        if (trade.conditionHit) {
          const r = state.economyRoutes?.find((x) => x.id === route.id);
          if (r) r.condition = clamp01(r.condition - trade.conditionHit);
        }
      }
    }

    const entry = forced ?? rollEncounter(state, table, rng, {
      route,
      cond: cond(),
      cooldown: cooldown > 0,
      escortMul: Math.min(help.escortMul, riding && trade?.highwaymanWeightMul !== undefined ? trade.highwaymanWeightMul : 1),
      reroll: help.reroll || (riding && !!trade?.encounterRerollBad),
    });
    if (cooldown > 0) cooldown -= 1;
    if (!entry) continue;
    const quiet = isQuiet(entry);
    if (!quiet) cooldown = loadEncounterDensity().cooldownTravelDays;
    if (!forced) {
      applyEffects(state, entry, route, from, to, sparkMax);
      if (entry.id === voice.highwayman.id) {
        const lost = 2 + Math.floor(rng.next() * 3);
        state.player.spark = Math.max(0, state.player.spark - lost);
        loseCoin(state, Math.ceil(coinOf(state) / 3));
      }
    }
    encounters.push({ day: state.day, id: entry.id, quiet, blurb: entry.blurb });
    pushJuice(state, 'encounter.spawn', {
      routeId,
      encounterId: entry.id,
      blurb: entry.blurb,
      prism: entry.prism,
      quiet,
      townId: to,
      line: entry.heard,
    });
  }

  if (riding && trade && offer) {
    // The gouger's price was the honest carter's; the rest comes due at the gate.
    const front = posedAs(trade);
    const gouges = !!front && trade.baseSpark + trade.baseCoin > front.baseSpark + front.baseCoin;
    const real = tradePrice(trade, tradeTrust(state, trade, route), sizeMul(state));
    const extra = Math.max(0, real.coin - offer.coin) + Math.max(0, real.spark - offer.spark);
    if (gouges && extra > 0) {
      const more = pay(state, Math.max(0, real.spark - offer.spark), Math.max(0, real.coin - offer.coin));
      paid.spark += more.spark;
      paid.coin += more.coin;
      const fromTown = state.towns?.[from];
      if (fromTown) fromTown.despair = clamp01(fromTown.despair + 0.01);
      tail.push(fill(out.overcharged, { ...vars, extra: more.coin ? `${more.coin} coin` : `${more.spark} spark` }));
      cheat = 'overcharged';
    }
    if (days > offer.days) {
      tail.push(fill(out.strayed, { ...vars, extra: plural(days - offer.days, 'day') }));
      cheat ??= 'strayed';
    }
    if (trade.exposureAdd) {
      addExposure(state, trade.exposureAdd);
      tail.push(fill(out.exposed, vars));
    }
    if (!cheat && trade.lean === 'good') tail.push(fill(out.honest, vars));
  }

  const mem = roadMemory(state);
  mem.journeys = (mem.journeys ?? 0) + 1;
  if (cheat && trade && !(mem.cheatedBy ?? []).includes(trade.id)) mem.cheatedBy = [...(mem.cheatedBy ?? []), trade.id];

  state.player.townId = to;
  lines.push(fill(trade ? out.hired : out.walked, { ...vars, days: plural(days, 'day') }));
  const loud = encounters.filter((e) => !e.quiet && e.blurb);
  if (loud.length) for (const e of loud) lines.push(`Day ${e.day}: ${e.blurb}`);
  else {
    const q = encounters.find((e) => e.blurb);
    if (q) lines.push(`The road was quiet. ${q.blurb}`);
  }
  lines.push(...tail);
  return {
    ok: true,
    routeId,
    fromId: from,
    toId: to,
    days,
    startDay,
    endDay: state.day,
    tradeId: trade?.id,
    offer,
    paidSpark: paid.spark,
    paidCoin: paid.coin,
    cheat,
    encounters,
    lines,
  };
}
