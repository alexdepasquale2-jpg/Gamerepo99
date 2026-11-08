/**
 * What coverage-people.mts has a headless player do in one session: a few weeks of ordinary play
 * (every deed on the folk around you, work at the day's tasks, unloading wagons by hand, body acts at
 * the board and hearth, things used with each item in hand, doors and rooms, lingering at props, letters,
 * walking to the next town, resting), then the end of a life (burnout and the succession offer). Acts
 * that are refused are part of play too. Deterministic: same seed, same run.
 */
import { addItem, ITEMS } from '../src/sim/goods/inventory';
import { sendPlayerLetter } from '../src/sim/letters-scale';
import { roomGreeting } from '../src/sim/map/interiors';
import { beginVisit } from '../src/sim/caravan-visit';
import { lingerLine, lingerSpent, lingerTagOf } from '../src/sim/linger';
import type { PlaySession } from '../src/sim/play-session/play-session-types';
import type { Target } from '../src/sim/play-session/targets';

export type Driver = {
  session: PlaySession;
  /** Hear the dawn the way the shell does (collectDawnLines after the day turns). */
  dawn(): void;
  act(id: string, t?: Target): unknown;
};

const DAYS = 36;
/** The day the life is made to burn out (spark to 0), so the succession offer and legacy hooks run. */
const BURN_DAY = 24;
const ROOMS = ['house', 'shop', 'inn', 'office'];
const LINGER = ['tree', 'rock', 'campfire', 'tent', 'shrine'];
const FAUNA = ['rabbit', 'deer', 'bird', 'pig', 'fox', 'fish', 'heron', 'rat'];
const NODES = ['tree', 'rock', 'berry_bush', 'herb_patch', 'fishing_spot', 'sheep_flock', 'ore_vein'];

/** Every ring verb on a person, deeds in a sensible order (introduce while someone else is fresh, a promise before keeping it). */
function personActs(d: Driver, personId: string, data?: Record<string, unknown>): void {
  const t: Target = { kind: 'person', id: personId, ...(data ? { data } : {}) };
  const order = ['introduce', 'talk_gentle', 'promise_make', 'gift_give', 'trade_fair', 'stand_up', 'favor_ask', 'return_item', 'talk_hard', 'talk_empty_cheer', 'talk_hard_shame', 'promise_keep', 'promise_break'];
  const rank = (id: string): number => { const i = order.indexOf(id.split('@')[0]!); return i < 0 ? order.length : i; };
  for (const id of d.session.listVerbs(t).map((v) => v.id).sort((a, b) => rank(a) - rank(b))) d.act(id, t);
}

function thingActs(d: Driver, t: Target): void {
  for (const v of d.session.listVerbs(t)) d.act(v.id, t);
}

/** The things of a town the scene would hand over, with the data it would pass. */
function thingsOf(d: Driver, townId: string, day: number): Target[] {
  const st = d.session.getState()!;
  const out: Target[] = [
    { kind: 'board', id: townId, data: { townId } },
    { kind: 'hearth', id: townId, data: { townId } },
    ...FAUNA.map((k, i): Target => ({ kind: 'fauna', id: `${k}#${day}_${i}`, data: { kindId: k, townId } })),
    ...NODES.map((k, i): Target => ({ kind: 'node', id: `cov_${k}_${day}`, data: { id: `cov_${k}_${day}`, kindId: k, q: 10 + i, r: 10, townId } })),
    ...LINGER.map((k): Target => ({ kind: 'prop', id: `${k}@${day},3`, data: { type: k, townId } })),
  ];
  for (const c of st.caravans ?? []) out.push({ kind: 'wagon', id: c.id, data: { townId } });
  for (const g of st.legacy?.graves ?? []) out.push({ kind: 'grave', id: g.personId, data: { townId: g.townId } });
  for (const c of st.build?.claims ?? []) out.push({ kind: 'plot', id: c.id, data: { ownerId: c.ownerId, townId: c.townId } });
  return out;
}

type Opts = { seed: number; archetypeId: string; inherit?: boolean; hoard?: boolean };

/**
 * Before a life ends: those you carried have come to lean on you, so whoever is chosen to carry on is
 * chosen through dependence (the bond events the legacy ledger counts) and the next life inherits it; or
 * a life that hoarded and lit nobody ends in the ash-hoard (legacy_hoard_imprint) when laid to rest.
 */
function leanOnYou(d: Driver, opts: Opts): void {
  const st = d.session.getState()!;
  if (st.legacy && opts.inherit) for (const b of Object.values(st.legacy.bonds)) b.events.dependence_stack = (b.events.dependence_stack ?? 0) + 200;
  if (opts.hoard && st.hoard) Object.assign(st.hoard, { peakCoin: 999, reigniteCount: 0 });
}

function dayOfPlay(d: Driver, day: number, opts: Opts): void {
  const s = d.session;
  const st = s.getState()!;
  const here = st.player.townId!;
  // The folk of the town you are in, a different handful each day so every wound and mark comes round.
  const folk = Object.values(st.people).filter((p) => p.townId === here).map((p) => p.id).sort();
  const pick = folk.filter((_, i) => (i + day) % 3 === 0).slice(0, 9);
  for (const id of pick) personActs(d, id);
  // One person you keep carrying (trade_fair, return_item: the carry_burden deeds) day after day: they come
  // to lean on you, and may be the one chosen to carry on after you (inherited dependence).
  const fav = folk[0];
  if (fav) for (let k = 0; k < 3; k++) for (const v of ['trade_fair', 'return_item', 'talk_gentle']) d.act(`${v}@${fav}`, { kind: 'person', id: fav });
  // Visitors in town (pilgrims, pedlars, the tax man...): ask, pay, refuse, help, whatever they offer,
  // with coin and food in the satchel on even days and none on odd ones (they answer both).
  if (day % 2 === 0) { addItem(st, 'coin', 30); addItem(st, 'bread', 2); }
  for (const id of Object.keys(st.visitors?.list ?? {}).sort()) personActs(d, id);
  // Work alongside: hold E at a few of the day's tasks.
  for (const t of s.tasksNear().slice(0, 8)) s.workAt(t.id, 3);
  // Unload a halted wagon by hand into the town store.
  // The scene's clock halts wagons at towns through the day; headless, the day jumps, so stop one here.
  const wagon = (st.caravans ?? []).find((c) => !c.phase);
  if (wagon && day % 2 === 1) beginVisit(st, wagon, here);
  for (const c of st.caravans ?? []) {
    if (!c.phase) continue;
    if (s.pickUp(`wagon:${c.id}`).ok) s.putDown(`hearth:${c.visit?.townId ?? here}`);
  }
  // Sit a while at a prop of each kind, before anything else spends the day's rest (the scene says
  // lingerLine as you sit, world/linger.ts).
  for (const k of LINGER) {
    const key = `prop:${k}@${day},${here.length}`;
    const tag = lingerTagOf(k);
    // The scene speaks a line as you sit down, then again while the rest gives spark.
    if (tag) lingerLine(st, tag, `${key}|sit`, lingerSpent(st));
    s.linger(key, 70);
  }
  // The town's things: the board and hearth, beasts, patches, props; each with a different item in hand.
  const items = ITEMS.items.map((i) => i.id);
  const things = thingsOf(d, here, day);
  things.forEach((t, i) => {
    thingActs(d, t);
    const held = items[(day * 7 + i) % items.length]!;
    addItem(st, held, 2);
    thingActs(d, { ...t, data: { ...(t.data as object), heldItem: held } });
  });
  // An item in hand for someone (Give / Use on a person).
  if (pick[0]) {
    const held = items[day % items.length]!;
    addItem(st, held, 2);
    personActs(d, pick[0], { heldItem: held });
  }
  // Doors and rooms: step into each kind of building; whoever is in greets you (actors/room-folk does the same).
  for (const kind of ROOMS) {
    const door: Target = { kind: 'door', id: `${here}:${kind}-${day % 3}`, data: { kind } };
    for (const v of s.listVerbs(door)) d.act(v.id, door);
    const inside = folk.filter((_, i) => (i + day + kind.length) % 5 === 0).slice(0, 2);
    void (roomGreeting(kind, s.townDespair()[here] ?? 0, day, day % 4 === 0 ? [] : inside));
  }
  // A letter to someone in another town every few days (they write back).
  if (day % 3 === 1) {
    const far = Object.values(st.people).filter((p) => p.townId && p.townId !== here).map((p) => p.id).sort();
    const to = far[(day * 5) % Math.max(1, far.length)];
    if (to) sendPlayerLetter(st, to, 'Thinking of you. Write when you can.');
  }
  // Every few days walk a road to the next town (the encounters on it come with you).
  if (day % 4 === 3) {
    const r = s.roads()[day % Math.max(1, s.roads().length)];
    if (r) s.journey(r.routeId);
  }
  // A road out of town is washed out: a road crew forms and you can break stone with them.
  if (day === 5) {
    const r = (st.economyRoutes ?? []).find((x) => x.fromTownId === here || x.toTownId === here);
    if (r) Object.assign(r, { broken: true, condition: 0.1 });
  }
  // A hard week: the town sinks into despair for a few days (rooms speak low, the gloom gets in at dawn).
  if (day >= 9 && day <= 11 && st.towns?.[here]) st.towns[here]!.despair = 0.8;
  if (day === BURN_DAY) {
    leanOnYou(d, opts);
    st.player.spark = 0;
  }
  s.wait(1);
  d.dawn();
}

export function drive(d: Driver, base: { seed: number; archetypeId: string }): void {
  // Some runs end in a dependent heir, some in the hoarder's ending (by seed, so every run is the same).
  const opts: Opts = { ...base, inherit: base.seed % 2 === 1, hoard: base.seed % 4 === 3 };
  let rested = false;
  for (let day = 0; day < DAYS; day++) {
    const off = d.session.successionOffer();
    if (off) {
      // The life may have burned out on its own before the burn day: lean the bonds / the purse now.
      leanOnYou(d, opts);
      // One life in each run is carried on, the next laid to rest (both endings are play).
      const rest = rested || !off.canContinue || (!opts.inherit && (opts.seed + opts.archetypeId.length) % 3 === 0) || !!opts.hoard;
      d.session.chooseSuccession(rest ? 'quit' : 'continue');
      if (rest) rested = true;
      d.dawn();
      if (rest) break;
      continue;
    }
    if (d.session.snapshot().burnedOut) break;
    dayOfPlay(d, day, opts);
  }
}
