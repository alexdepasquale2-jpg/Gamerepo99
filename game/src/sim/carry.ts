/**
 * Carrying heavy goods by hand. Logs, stones, grain sacks, ore and bales sit in visible piles (a facility's
 * yard, a town's stock by the hearth, the back of a halted wagon); the player lifts ONE load at a time,
 * walks it somewhere and sets it down: a plot under construction (contributeToPlan), a town (deliverToTown),
 * a wagon's hold. Dropping it anywhere leaves the goods on the ground as ordinary ground items.
 *
 * Every pile draws on a real source, so goods are conserved: a town pile is the village ledger (and its LOD
 * stock), a facility yard is the day's output already credited to its road's towns (taken back out of the
 * best-stocked one), a wagon pile is its cargo. A delivery that helps someone (their plan, a town short of
 * it) earns thanks through people: a bubble now, a dawn line tomorrow, trust, sometimes a tip from a purse
 * that really holds it (data/items/carry.json; the coin is the old errand's carryRewardCoin).
 * Pure + deterministic: no Phaser/DOM, no Math.random.
 */
import { encodeUnspokenForState } from './social/unspoken';
import { fallbackLine } from './fallback-lines';
import carryJson from '../data/items/carry.json';
import { BUILDING_BY_ID, contributeToPlan, PLAYER_OWNER } from './economy/build-plans';
import { addStock, isFoodRes, stockOf } from './economy/food-stock';
import { facilityById, facilityOutput, facilityPlaces } from './economy/facilities';
import { deliverToTown } from './goods/deed-goods';
import { ITEMS, ITEM_BY_ID, addItem } from './goods/inventory';
import { dropItem } from './goods/item-use';
import { pushJuice } from './packets';
import { noteUse } from './data-use-world';
import { residentOf } from './contrib/use-effects';
import type { ActOutcome } from './play-session/action-providers';
import { parseTargetKey, type Target } from './play-session/targets';
import type { SimState } from './types/runtime';

export type LoadRow = { itemId: string; name: string; qty: number; speed: number; shape: string; resource?: string; offcutOf?: string };
type CarryFile = { loads: LoadRow[]; facilityPiles: Record<string, string[]>; townPiles: string[]; thanks: { trust: number; tipFromPlan: boolean; keepDays: number } };
const FILE = carryJson as CarryFile;
export const CARRY = FILE;
const ROW_BY_ITEM = new Map(FILE.loads.map((r) => [r.itemId, r]));

/** What the player has in their arms. `from` is the pile key it came off; `fromTown` the town whose stock it left. */
export type Carried = { itemId: string; qty: number; from: string; fromTown?: string };
/** Per-save carry book-keeping: today's take from each facility yard, and thanks still to be told at dawn. */
export type CarryState = {
  taken: Record<string, { day: number; n: number }>;
  thanks: { day: number; personId: string; line: string }[];
};

export type PileSource = 'facility' | 'town' | 'wagon';
export type PileView = {
  key: string; source: PileSource; ref: string; itemId: string; name: string;
  /** Units there now; `load` is what one trip lifts. */
  have: number; load: number;
  /** Town whose goods these are (facility: the best-stocked road town; wagon: where it is halted). */
  townId?: string;
};

export const loadRow = (itemId: string): LoadRow | undefined => ROW_BY_ITEM.get(itemId);
const resOf = (row: LoadRow): string | undefined => row.resource ?? ITEM_BY_ID.get(row.itemId)?.economyResourceId;
const rowForRes = (res: string): LoadRow | undefined => FILE.loads.find((r) => resOf(r) === res);
const cs = (state: SimState): CarryState => (state.carry ??= { taken: {}, thanks: [] });

export const carrying = (state: SimState | undefined): Carried | undefined => state?.player.carrying;
/** Walk multiplier while loaded (1 with empty arms). */
export const carrySpeed = (state: SimState | undefined): number => {
  const c = carrying(state);
  return c ? (loadRow(c.itemId)?.speed ?? 0.8) : 1;
};
export const loadName = (c: { itemId: string }): string => loadRow(c.itemId)?.name ?? (ITEM_BY_ID.get(c.itemId)?.name ?? c.itemId).toLowerCase();

// ---------- piles ----------

export const facilityPileKey = (facId: string, itemId: string): string => `fac:${facId}:${itemId}`;
export const townPileKey = (townId: string, itemId: string): string => `town:${townId}:${itemId}`;
export const wagonPileKey = (caravanId: string): string => `wagon:${caravanId}`;

/** A facility yard: what it made today, less what has been carried off, never more than its towns still hold. */
function facilityPile(state: SimState, facId: string, itemId: string): PileView | null {
  const place = facilityById(state, facId);
  const row = loadRow(itemId);
  const res = row && resOf(row);
  if (!place || !row || !res || !(FILE.facilityPiles[place.kind] ?? []).includes(itemId)) return null;
  const out = facilityOutput(state, place);
  const own = out.find((o) => o.resourceId === res)?.qty;
  // Generated lumber camps saw only timber; their firewood is the offcuts (carry.json offcutOf).
  const offcut = own === undefined && row.offcutOf ? Math.ceil((out.find((o) => o.resourceId === row.offcutOf)?.qty ?? 0) / 2) : 0;
  const made = Math.round(own ?? offcut);
  const key = facilityPileKey(facId, itemId);
  const t = cs(state).taken[key];
  const takenToday = t && t.day === state.day ? t.n : 0;
  // The day's goods went to the road's towns at dawn; the yard's pile is what is still theirs to fetch.
  const towns = place.townIds.filter((id) => state.towns?.[id]).sort((a, b) => (stockOf(state, b, res) ?? 0) - (stockOf(state, a, res) ?? 0) || a.localeCompare(b));
  const townId = towns[0];
  const inTown = townId ? Math.floor(stockOf(state, townId, res) ?? 0) : 0;
  const have = Math.max(0, Math.min(made - takenToday, inTown));
  return { key, source: 'facility', ref: facId, itemId, name: row.name, have, load: Math.min(row.qty, have), ...(townId ? { townId } : {}) };
}

/** A town's stock of one heavy good, by the hearth: the village ledger's units. */
function townPile(state: SimState, townId: string, itemId: string): PileView | null {
  const row = loadRow(itemId);
  if (!row || !state.towns?.[townId] || !FILE.townPiles.includes(itemId)) return null;
  const have = Math.max(0, Math.floor(state.villageEconomy?.towns[townId]?.goods[itemId] ?? 0));
  return { key: townPileKey(townId, itemId), source: 'town', ref: townId, itemId, name: row.name, have, load: Math.min(row.qty, have), townId };
}

/** The back of a wagon halted at a town: its own cargo, when that is something carried by hand. */
function wagonPile(state: SimState, caravanId: string): PileView | null {
  const m = state.caravans?.find((c) => c.id === caravanId);
  const row = m && rowForRes(m.cargoResourceId);
  if (!m || !row || !m.phase) return null;
  const have = Math.max(0, Math.floor(m.qty));
  return { key: wagonPileKey(caravanId), source: 'wagon', ref: caravanId, itemId: row.itemId, name: row.name, have, load: Math.min(row.qty, have), ...(m.visit?.townId ? { townId: m.visit.townId } : {}) };
}

export function pileView(state: SimState, key: string): PileView | null {
  const [kind, ...rest] = key.split(':');
  if (kind === 'wagon') return wagonPile(state, rest.join(':'));
  if (rest.length < 2) return null;
  const itemId = rest.pop()!, ref = rest.join(':');
  return kind === 'fac' ? facilityPile(state, ref, itemId) : kind === 'town' ? townPile(state, ref, itemId) : null;
}

/** Every pile in the district (empty ones too, so a town's spot can still take a load). */
export function listPiles(state: SimState): PileView[] {
  const out: PileView[] = [];
  for (const f of facilityPlaces(state)) for (const item of FILE.facilityPiles[f.kind] ?? []) { const p = facilityPile(state, f.id, item); if (p) out.push(p); }
  for (const townId of Object.keys(state.towns ?? {}).sort()) for (const item of FILE.townPiles) { const p = townPile(state, townId, item); if (p) out.push(p); }
  for (const m of state.caravans ?? []) { const p = wagonPile(state, m.id); if (p) out.push(p); }
  return out;
}

// ---------- lift ----------

function takeFrom(state: SimState, p: PileView, n: number): void {
  if (p.source === 'town') {
    const g = state.villageEconomy!.towns[p.ref]!.goods;
    g[p.itemId] = Math.max(0, (g[p.itemId] ?? 0) - n);
    // deliverToTown put non-food goods in both books; take them out of both.
    const res = ITEM_BY_ID.get(p.itemId)?.economyResourceId;
    const town = state.towns?.[p.ref];
    if (res && town && !isFoodRes(res)) town.stock[res] = Math.max(0, (town.stock[res] ?? 0) - n);
  } else if (p.source === 'facility') {
    const row = loadRow(p.itemId)!;
    if (p.townId) addStock(state, p.townId, resOf(row)!, -n);
    const t = cs(state).taken;
    const cur = t[p.key]?.day === state.day ? t[p.key]!.n : 0;
    t[p.key] = { day: state.day, n: cur + n };
  } else {
    const m = state.caravans!.find((c) => c.id === p.ref)!;
    m.qty -= n;
    // Lifting crates off a wagon at a stop is unloading it: the stop's count moves on as it would.
    if (m.visit) m.visit.moved = Math.min(m.visit.total, m.visit.moved + n);
  }
}

/** Lift one load off a pile. One load at a time: full arms refuse. */
export function pickUp(state: SimState, key: string): ActOutcome {
  const held = carrying(state);
  if (held) return { ok: false, line: `Your arms are full with the ${loadName(held)}. Set them down first.` };
  const p = pileView(state, key);
  if (!p) return { ok: false, line: 'There is nothing here to lift.' };
  if (p.load <= 0) return { ok: false, line: `The ${p.name} are all gone.` };
  takeFrom(state, p, p.load);
  // Proof each load and each pile source is really lifted (game/scripts/coverage-world.mts).
  noteUse('carry', p.itemId);
  if (p.source === 'facility') noteUse('carry.facilityPiles', `${facilityById(state, p.ref)?.kind}.${p.itemId}`);
  else if (p.source === 'town') noteUse('carry.townPiles', p.itemId);
  state.player.carrying = { itemId: p.itemId, qty: p.load, from: key, ...(p.townId ? { fromTown: p.townId } : {}) };
  pushJuice(state, 'carry.lift', { itemId: p.itemId, qty: p.load, from: key });
  return { ok: true, line: `You heave up ${p.load} ${p.name}. Heavy going.` };
}

// ---------- set down ----------

const firstName = (state: SimState, id: string): string => (state.people[id]?.name ?? id).split(/[ _]/)[0]!.replace(/^\w/, (c) => c.toUpperCase());
type PlotLike = { ownerId?: string; townId?: string };
const rec = (t: Target): Record<string, unknown> => (t.data && typeof t.data === 'object' ? (t.data as Record<string, unknown>) : {});

/** Someone was helped: a bubble now, more trust, a dawn line tomorrow, and a tip when their purse holds one. */
function thank(state: SimState, personId: string, now: string, dawn: string, tipFrom?: () => number): number {
  const p = state.people[personId];
  if (!p) return 0;
  p.trust = Math.min(1, (p.trust ?? 0) + FILE.thanks.trust);
  pushJuice(state, 'moment.beat', { personId, line: now, townId: p.townId, momentId: 'carry.thanks' });
  cs(state).thanks.push({ day: state.day, personId, line: dawn });
  // Goods carried to someone who needed them: an errand they will not forget (unspoken_favor_warmth).
  encodeUnspokenForState(state, 'carry_goods', personId, { tags: ['favor', 'errand'] });
  const tip = tipFrom?.() ?? 0;
  if (tip > 0) addItem(state, 'coin', tip);
  return tip;
}

/** Pay the tip out of a person's purse (company coin), never minted. */
function tipFromPurse(state: SimState, personId: string): number {
  const purse = state.companies?.purse;
  const n = Math.min(ITEMS.deeds.carryRewardCoin, Math.floor(purse?.[personId] ?? 0));
  if (!purse || n <= 0) return 0;
  purse[personId] = (purse[personId] ?? 0) - n;
  return n;
}

function toPlot(state: SimState, c: Carried, t: Target): ActOutcome {
  const d = rec(t) as PlotLike;
  const claim = state.build?.claims.find((x) => x.id === t.id);
  const ownerId = claim?.ownerId ?? d.ownerId;
  if (!ownerId) return { ok: false, line: 'Nobody is building here.' };
  let used = 0;
  let line: string | null = null;
  while (used < c.qty) {
    const l = contributeToPlan(state, ownerId, c.itemId);
    if (!l) break;
    line = l;
    used++;
  }
  if (!used) return { ok: false, line: `This build has all the ${loadName(c)} it needs.` };
  c.qty -= used;
  if (c.qty <= 0) delete state.player.carrying;
  const left = c.qty > 0 ? ` You keep the other ${c.qty}.` : '';
  if (ownerId === PLAYER_OWNER) return { ok: true, line: `You stack ${used} ${loadName(c)} on your plot. ${line ?? ''}${left}`.trim() };
  const name = firstName(state, ownerId);
  const tip = thank(state, ownerId, `${used} ${loadName(c)}, and I never asked! Thank you.`, `${name} is still telling folk who carried the ${loadName(c)} to the build.`,
    FILE.thanks.tipFromPlan ? () => tipFromPurse(state, ownerId) : undefined);
  return { ok: true, line: `You set ${used} ${loadName(c)} down by ${name}'s frame.${tip ? ` ${name} presses ${tip} coin on you.` : ''}${left}` };
}

function toTown(state: SimState, c: Carried, townId: string): ActOutcome {
  if (!state.towns?.[townId]) return { ok: false, line: 'Nobody keeps a store here.' };
  const who = residentOf(state, townId, `carry:${townId}:${c.itemId}`);
  const short = deliverToTown(state, townId, c.itemId, c.qty, who ?? 'player');
  const qty = c.qty;
  delete state.player.carrying;
  // Unloading a wagon into the store by hand: the driver tips a coin and the town talks of it.
  if (c.from.startsWith('wagon:')) {
    const salt = `${c.from}|${townId}`;
    const said = fallbackLine('body.carry_crates', `${state.seed}|crates|${salt}|${state.day}`);
    addItem(state, 'coin', 1);
    if (who) {
      const heard = fallbackLine('body.carry_crates.heard', `${state.seed}|crates-heard|${salt}|${state.day}`);
      if (heard) pushJuice(state, 'moment.beat', { personId: who, line: heard, townId, momentId: 'body.carry_crates' });
    }
    if (said) return { ok: true, line: said };
  }
  // Carrying a town's own goods back to it is no favour; bringing them from elsewhere when it is short is.
  if (short && who && c.fromTown !== townId) {
    const name = firstName(state, who);
    thank(state, who, `${qty} ${loadName(c)}! We were running short. Bless you.`, `${name} says the ${loadName(c)} you carried in came just when they were needed.`);
    return { ok: true, line: `You set the ${loadName(c)} down with the town's stock. ${name} comes running to help stack them.` };
  }
  return { ok: true, line: `You set ${qty} ${loadName(c)} down with the town's stock.` };
}

function toWagon(state: SimState, c: Carried, caravanId: string): ActOutcome {
  const m = state.caravans?.find((x) => x.id === caravanId);
  const row = loadRow(c.itemId);
  const res = row && resOf(row);
  if (!m || !m.phase) return { ok: false, line: 'The wagon will not stop for you on the road.' };
  if (!res) return { ok: false, line: 'The driver has no use for that.' };
  if (c.from === wagonPileKey(caravanId) || res === m.cargoResourceId) m.qty += c.qty;
  else (m.hold ??= {})[res] = (m.hold[res] ?? 0) + c.qty;
  // Back onto its own wagon: undo the stop's count too.
  if (c.from === wagonPileKey(caravanId) && m.visit) m.visit.moved = Math.max(0, m.visit.moved - c.qty);
  delete state.player.carrying;
  return { ok: true, line: `You heave the ${loadName(c)} up onto the wagon.` };
}

/** Back onto the pile it came from: exactly undo the lift. */
function toOwnPile(state: SimState, c: Carried, p: PileView): ActOutcome {
  if (p.source === 'town') {
    const g = ((state.villageEconomy ??= { towns: {} }).towns[p.ref] ??= { goods: {}, need: {}, short: {} }).goods;
    g[c.itemId] = (g[c.itemId] ?? 0) + c.qty;
    const res = ITEM_BY_ID.get(c.itemId)?.economyResourceId;
    const town = state.towns?.[p.ref];
    if (res && town && !isFoodRes(res)) town.stock[res] = (town.stock[res] ?? 0) + c.qty;
  } else if (p.source === 'facility') {
    if (c.fromTown) addStock(state, c.fromTown, resOf(loadRow(c.itemId)!)!, c.qty);
    const t = cs(state).taken[p.key];
    if (t && t.day === state.day) t.n = Math.max(0, t.n - c.qty);
  } else return toWagon(state, c, p.ref);
  delete state.player.carrying;
  return { ok: true, line: `You set the ${loadName(c)} back on the pile.` };
}

/** Can this target take what you carry? (For the ring: offer "Set down" only where it would land.) */
export function acceptsLoad(state: SimState, t: Target): boolean {
  const c = carrying(state);
  if (!c) return false;
  if (t.kind === 'hearth') return !!state.towns?.[t.id];
  if (t.kind === 'wagon') {
    const row = loadRow(c.itemId);
    return !!state.caravans?.find((x) => x.id === t.id)?.phase && !!row && !!resOf(row);
  }
  if (t.kind === 'plot') {
    const claim = state.build?.claims.find((x) => x.id === t.id);
    const plan = claim && state.build?.plans.find((p) => p.id === claim.planId);
    if (!plan || plan.stage !== 'gathering') return false;
    return (plan.have[c.itemId] ?? 0) < (buildCost(plan.kind)[c.itemId] ?? 0);
  }
  const key = pileKeyOf(t);
  if (!key) return false;
  const p = pileView(state, key);
  return !!p && (key === c.from || p.source === 'town' || p.source === 'wagon');
}

const buildCost = (kind: string): Record<string, number> => BUILDING_BY_ID.get(kind)?.cost ?? {};

/** The pile key a scene target stands for (`prop:pile:<key>`, or a wagon by its id). */
export function pileKeyOf(t: Target): string | null {
  if (t.kind === 'wagon') return wagonPileKey(t.id);
  if (t.kind !== 'prop') return null;
  const d = rec(t).pile;
  if (typeof d === 'string') return d;
  return t.id.startsWith('pile:') ? t.id.slice(5) : null;
}

/** Set the load down on a target: a plot, a town (hearth or its pile), a wagon, or back where it came from. */
export function putDown(state: SimState, t: Target): ActOutcome {
  const c = carrying(state);
  if (!c) return { ok: false, line: 'Your arms are empty.' };
  if (t.kind === 'plot') return toPlot(state, c, t);
  if (t.kind === 'hearth') return toTown(state, c, t.id);
  if (t.kind === 'wagon') return toWagon(state, c, t.id);
  const key = pileKeyOf(t);
  const p = key ? pileView(state, key) : null;
  if (!p) return { ok: false, line: 'That is no place to set it down.' };
  if (key === c.from) return toOwnPile(state, c, p);
  if (p.source === 'town') return toTown(state, c, p.ref);
  if (p.source === 'wagon') return toWagon(state, c, p.ref);
  return { ok: false, line: 'This is their yard. Take it where it is wanted.' };
}

/** Let the load fall where you stand: the goods lie on the ground as ordinary items (seeded spread). */
export function dropCarried(state: SimState, at: { x: number; y: number }): ActOutcome {
  const c = carrying(state);
  if (!c) return { ok: false, line: 'Your arms are empty.' };
  addItem(state, c.itemId, c.qty);
  for (let i = 0; i < c.qty; i++) dropItem(state, c.itemId, { x: at.x + ((i % 3) - 1) * 9, y: at.y + 6 + Math.floor(i / 3) * 6 });
  delete state.player.carrying;
  return { ok: true, line: `You let the ${loadName(c)} down onto the ground.` };
}

// ---------- dawn ----------

/** Yesterday's thanks, still being told about this morning (through the person who was helped). */
export function carryDawnLines(state: SimState): string[] {
  const t = state.carry?.thanks ?? [];
  return t.filter((x) => x.day === state.day - 1 && state.people[x.personId]).slice(0, 2).map((x) => x.line);
}

/** Forget thanks once they have been told. */
export function pruneCarry(state: SimState): void {
  const c = state.carry;
  if (!c) return;
  c.thanks = c.thanks.filter((x) => x.day >= state.day - FILE.thanks.keepDays);
  for (const [k, v] of Object.entries(c.taken)) if (v.day !== state.day) delete c.taken[k];
}

/** The scene target for a key: a thing key (`plot:…`, `hearth:…`, `wagon:…`, `prop:pile:…`) or a bare pile key. */
export function carryTarget(key: string): Target {
  const pile = key.startsWith('prop:pile:') ? key.slice(10) : key.startsWith('fac:') || key.startsWith('town:') ? key : null;
  if (pile) return pileTarget(pile);
  return parseTargetKey(key) ?? { kind: 'prop', id: `pile:${key}` };
}

/** How the scene names a pile: a prop whose data says which pile (wagons are their own thing). */
export function pileTarget(pileKey: string): Target {
  if (pileKey.startsWith('wagon:')) return { kind: 'wagon', id: pileKey.slice(6) };
  return { kind: 'prop', id: `pile:${pileKey}`, data: { type: 'pile', pile: pileKey } };
}
