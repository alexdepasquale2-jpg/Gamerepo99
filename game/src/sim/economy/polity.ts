/**
 * Light polity layer, run by towns alone: diplomacy (trust and feud, treaties), war (raids, blocked
 * roads, truce), technology (knowledge from workshops unlocks trade multipliers on forked paths;
 * treaties spread it) and religion (a finished chapel founds a creed with a small effect). The player
 * has no verbs here yet. Reads borders/logistics/build/doctrine state directly (no imports of them)
 * so economy modules can import the hooks below without cycles. Pure + deterministic.
 *
 * Feud has several roots, because towns sit days apart and rarely share a border: border tension,
 * clashing creeds, rival doctrines, a neighbour who sat on spare goods while you went short, and
 * carts lost on the road between you. Hardship (despair) sharpens all of them.
 */

import polityJson from '../../data/items/polity.json';
import { deriveRng } from '../rng';
import { noteUse } from '../data-use-civic';
import type { SimState } from '../types/runtime';

/** `fork`: techs sharing one are rival paths; a town holds at most one of them. */
export type Tech = { id: string; name: string; fork?: string; cost: number; needs: { buildings?: Record<string, number>; techs?: string[] }; mul: Record<string, number> };
export type Creed = { id: string; name: string; birthMul?: number; jobMul?: Record<string, number>; safeRoads?: boolean; feudDecay?: number };
type Tuning = {
  trustPerUnit: number; trustDrift: number; feudPerTension: number; creedFriction: number; feudDecay: number;
  unservedFeud: number; lostCartFeud: number; doctrineFriction: number; despairFeudMul: number;
  tradeTrust: number; tradeFeud: number; allyTrust: number; allyFeud: number; breakFeud: number;
  warFeud: number; warCooldown: number; warMin: number; warSpread: number; raidChance: number; raidShare: number; lootShare: number; claimRaidChance: number; truceFeud: number; truceTrust: number;
  warCartSurvivalPow: number;
  knowledgeBase: number; knowledgePerWorkshop: number; knowledgePerGifted: number; costRisePerTech: number; learnTrade: number; learnAlliance: number; learnAfterDays: number;
  spareDays: number; spareFlat: number; foodPool: string[];
};
const T = polityJson as unknown as { tuning: Tuning; techs: Tech[]; creeds: Creed[] };
export const TECHS = T.techs;
export const CREEDS = T.creeds;
/** Every knob of the layer; polity.json `tuning` is the one source. */
export const POLITY: Tuning = T.tuning;

export type Treaty = 'none' | 'trade' | 'alliance';
export type Relation = { a: string; b: string; trust: number; feud: number; treaty: Treaty; since: number; lastWar: number };
export type War = { id: string; aggressor: string; defender: string; started: number; duration: number; raids: number; status: 'active' | 'ended'; winner?: string; lostTech?: string };
export type Faith = { creed: string; founded: number; shrine: string };
/**
 * `carts` (lazy): carts seen on the road last dawn, id -> "pairKey#requestId", so a vanished cart whose
 * request was not filled reads as lost. `grudged` (lazy): lapsed request ids already held against neighbours.
 */
export type Polity = { relations: Record<string, Relation>; wars: War[]; knowledge: Record<string, number>; tech: Record<string, string[]>; faiths: Record<string, Faith>; next: number;
  carts?: Record<string, string>; grudged?: string[] };

const pol = (state: SimState): Polity => (state.polity ??= { relations: {}, wars: [], knowledge: {}, tech: {}, faiths: {}, next: 1 });
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const TECH_BY_ID = new Map(TECHS.map((t) => [t.id, t]));

// ---- Hooks other economy modules read ----
export const atWar = (state: SimState, a: string, b: string): boolean =>
  (state.polity?.wars ?? []).some((w) => w.status === 'active' && pairKey(w.aggressor, w.defender) === pairKey(a, b));
export const treatyOf = (state: SimState, a: string, b: string): Treaty => state.polity?.relations[pairKey(a, b)]?.treaty ?? 'none';
export const techsOf = (state: SimState, townId: string): string[] => state.polity?.tech[townId] ?? [];
export const creedOf = (state: SimState, townId: string): Creed | undefined => CREEDS.find((c) => c.id === state.polity?.faiths[townId]?.creed);
/** Production multiplier from the town's technology and creed for a trade. */
export function polityMul(state: SimState, townId: string, jobId: string): number {
  const known = techsOf(state, townId);
  let m = TECHS.filter((t) => known.includes(t.id)).reduce((n, t) => { noteUse('items/polity', `tech:${t.id}`); return n * (t.mul[jobId] ?? 1); }, 1);
  const creed = creedOf(state, townId);
  if (creed) noteUse('items/polity', `creed:${creed.id}`);
  m *= creed?.jobMul?.[jobId] ?? 1;
  return m;
}
export const birthMul = (state: SimState, townId: string): number => creedOf(state, townId)?.birthMul ?? 1;
export const safeRoads = (state: SimState, a: string, b: string): boolean => !!(creedOf(state, a)?.safeRoads || creedOf(state, b)?.safeRoads);

/** Town weight in a quarrel: people, finished buildings, companies, techs. */
export function strength(state: SimState, townId: string): number {
  const pop = Object.values(state.people ?? {}).filter((p) => p.townId === townId).length;
  const built = (state.build?.claims ?? []).filter((c) => c.townId === townId && c.status === 'built').length;
  const cos = (state.companies?.list ?? []).filter((c) => c.townId === townId).length;
  return pop + 3 * built + 2 * cos + 2 * techsOf(state, townId).length;
}

/** A town may take (or be taught) a tech when it lacks it, holds its prerequisites and no rival on its fork. */
export function techOpen(known: string[], t: Tech): boolean {
  if (known.includes(t.id) || !(t.needs.techs ?? []).every((x) => known.includes(x))) return false;
  return !t.fork || !known.some((k) => TECH_BY_ID.get(k)?.fork === t.fork);
}
/** Knowledge a town must bank for a tech: every tech it already holds makes the next one dearer. */
export const techCost = (known: string[], t: Tech): number => t.cost * (1 + POLITY.costRisePerTech * known.length);

/**
 * Could this town have spared a cartload of an item? Mirrors logistics' surplus rule (keep some days
 * of your own need, plus a little): only a neighbour who truly sat on spare goods is blamed.
 */
function couldSpare(state: SimState, townId: string, itemId: string): boolean {
  const l = state.villageEconomy?.towns[townId];
  if (!l) return false;
  const have = itemId === 'food' ? POLITY.foodPool.reduce((n, i) => n + (l.goods[i] ?? 0), 0) : (l.goods[itemId] ?? 0);
  return have - (l.need[itemId] ?? 0) * POLITY.spareDays >= POLITY.spareFlat;
}

/** Feud added this dawn from roots that need no shared border; read once per pair in tickPolity. */
function grievances(state: SimState, p: Polity, links: Set<string>): Map<string, number> {
  const add = new Map<string, number>();
  const bump = (a: string, b: string, n: number) => { if (a !== b) add.set(pairKey(a, b), (add.get(pairKey(a, b)) ?? 0) + n); };
  const log = state.logistics;
  const reqs = new Map((log?.requests ?? []).map((r) => [r.id, r]));

  // A request that lapsed while a linked neighbour could have filled it: the neighbour sat on it.
  const grudged = new Set(p.grudged ?? []);
  for (const r of log?.requests ?? []) {
    if (r.status !== 'lapsed' || grudged.has(r.id)) continue;
    grudged.add(r.id);
    for (const key of links) {
      const [a, b] = key.split('|') as [string, string];
      const other = a === r.townId ? b : b === r.townId ? a : undefined;
      if (other && couldSpare(state, other, r.itemId)) bump(r.townId, other, POLITY.unservedFeud);
    }
  }
  p.grudged = [...grudged].filter((id) => reqs.has(id)).sort();

  // A cart that left the road without filling its request was lost. The towns at either end of each
  // road it took blame each other for not keeping that road safe (the grievance is split over its legs).
  const routes = new Map((state.economyRoutes ?? []).map((r) => [r.id, pairKey(r.fromTownId, r.toTownId)]));
  const now: Record<string, string> = {};
  for (const c of log?.carts ?? []) now[c.id] = `${c.requestId}#${[...new Set(c.legs.map((l) => routes.get(l.routeId) ?? pairKey(c.fromTownId, c.toTownId)))].join(',')}`;
  for (const [id, tag] of Object.entries(p.carts ?? {})) {
    if (now[id]) continue;
    const [reqId, keys] = tag.split('#') as [string, string];
    const req = reqs.get(reqId);
    if (!req || req.status === 'filled') continue;
    const roads = keys.split(',').filter(Boolean);
    for (const key of roads) { const [a, b] = key.split('|') as [string, string]; bump(a, b, POLITY.lostCartFeud / roads.length); }
  }
  p.carts = now;

  // Two living doctrines on linked towns preach against each other, harder the surer each is.
  const docs = new Map<string, number>();
  for (const d of Object.values(state.doctrines ?? {})) if (!d.collapsed && d.townId) docs.set(d.townId, Math.max(docs.get(d.townId) ?? 0, d.legitimacy ?? 0));
  for (const key of links) {
    const [a, b] = key.split('|') as [string, string];
    if (docs.has(a) && docs.has(b)) bump(a, b, POLITY.doctrineFriction * Math.min(docs.get(a)!, docs.get(b)!));
  }
  return add;
}

export function tickPolity(state: SimState): void {
  const towns = Object.keys(state.towns ?? {}).sort();
  if (towns.length < 2) return;
  const p = pol(state);
  const flow = state.logistics?.flow ?? {};
  const claims = state.build?.claims ?? [];

  // 1. Faith: a finished chapel founds the town's creed.
  for (const c of claims) {
    if (c.kind !== 'chapel' || c.status !== 'built' || p.faiths[c.townId]) continue;
    p.faiths[c.townId] = { creed: CREEDS[deriveRng(state.seed, 'creed', c.townId).int(0, CREEDS.length)]!.id, founded: state.day, shrine: c.id };
  }

  // 2. Technology: knowledge from workshops and gifted villagers; research the cheapest open tech.
  // Forks make paths: whichever of a pair a town reaches first shuts the other.
  for (const id of towns) {
    const built = claims.filter((c) => c.townId === id && c.status === 'built');
    const gifted = Object.values(state.people ?? {}).filter((x) => x.townId === id && x.tags?.some((t) => t.startsWith('gifted_'))).length;
    p.knowledge[id] = (p.knowledge[id] ?? 0) + POLITY.knowledgeBase + POLITY.knowledgePerWorkshop * built.filter((c) => c.kind !== 'house').length + POLITY.knowledgePerGifted * gifted;
    // Saves from before forks may hold both sides of one; the first taken stands.
    const known = (p.tech[id] = (p.tech[id] ?? []).filter((t, i, all) => { const f = TECH_BY_ID.get(t)?.fork; return !f || !all.slice(0, i).some((u) => TECH_BY_ID.get(u)?.fork === f); }));
    const have = (kind: string): number => built.filter((c) => c.kind === kind).length;
    // Toward what the town builds most (a mill town takes the water wheel, a farm town field rotation), then the cheapest.
    const weight = (t: Tech): number => Object.keys(t.needs.buildings ?? {}).reduce((n, k) => n + have(k), 0);
    const next = TECHS.filter((t) => techOpen(known, t) && Object.entries(t.needs.buildings ?? {}).every(([k, n]) => have(k) >= n)).sort((a, b) => weight(b) - weight(a) || a.cost - b.cost || a.id.localeCompare(b.id))[0];
    if (next && p.knowledge[id]! >= techCost(known, next)) { p.knowledge[id]! -= techCost(known, next); known.push(next.id); }
  }

  // 3. Diplomacy: neighbours (by road or border) trade, quarrel, sign and break treaties, and trade ideas.
  const pairs = new Set<string>([...Object.keys(state.borders?.pairs ?? {}), ...(state.economyRoutes ?? []).map((r) => pairKey(r.fromTownId, r.toTownId))]);
  const links = new Set([...pairs].filter((k) => k.split('|').every((t) => state.towns?.[t])));
  const grief = grievances(state, p, links);
  for (const key of [...links].sort()) {
    const [a, b] = key.split('|') as [string, string];
    const r = (p.relations[key] ??= { a, b, trust: 0, feud: 0, treaty: 'none', since: state.day, lastWar: -999 });
    const drift = Math.min(Math.abs(r.trust), POLITY.trustDrift) * Math.sign(r.trust);
    r.trust = Math.max(-100, Math.min(100, r.trust + POLITY.trustPerUnit * (flow[key] ?? 0) - drift));
    const creedA = p.faiths[a]?.creed, creedB = p.faiths[b]?.creed;
    const decay = Math.max(creedOf(state, a)?.feudDecay ?? POLITY.feudDecay, creedOf(state, b)?.feudDecay ?? POLITY.feudDecay);
    // Hard times sharpen every grievance: hungry, hopeless towns look for someone to blame.
    const sharp = 1 + POLITY.despairFeudMul * Math.max(state.towns?.[a]?.despair ?? 0, state.towns?.[b]?.despair ?? 0);
    const grown = (state.borders?.pairs[key]?.tension ?? 0) * POLITY.feudPerTension + (creedA && creedB && creedA !== creedB ? POLITY.creedFriction : 0) + (grief.get(key) ?? 0);
    r.feud = Math.max(0, Math.min(100, r.feud + grown * sharp - decay));
    const was = r.treaty;
    if (r.treaty !== 'none' && (r.feud >= POLITY.breakFeud || r.trust < 0)) r.treaty = 'none';
    else if (r.treaty === 'none' && r.trust >= POLITY.tradeTrust && r.feud < POLITY.tradeFeud) r.treaty = 'trade';
    else if (r.treaty === 'trade' && r.trust >= POLITY.allyTrust && r.feud < POLITY.allyFeud) r.treaty = 'alliance';
    if (r.treaty !== was) r.since = state.day;
    // Partners learn from each other's techs, though never across a path the learner has already chosen.
    if (r.treaty !== 'none' && state.day - r.since >= POLITY.learnAfterDays) {
      const chance = r.treaty === 'alliance' ? POLITY.learnAlliance : POLITY.learnTrade;
      for (const [from, to] of [[a, b], [b, a]] as const) {
        const theirs = p.tech[to] ?? [];
        const lacking = (p.tech[from] ?? []).filter((t) => { const x = TECH_BY_ID.get(t); return !!x && techOpen(theirs, x); });
        if (lacking.length && deriveRng(state.seed, 'learn', state.day, `${from}>${to}`).next() < chance) (p.tech[to] ??= []).push(lacking[0]!);
      }
    }
    // A feud with no treaty and no recent war can break into one; the stronger town attacks.
    if (r.treaty === 'none' && r.feud >= POLITY.warFeud && state.day - r.lastWar >= POLITY.warCooldown && !atWar(state, a, b)) {
      const [aggressor, defender] = strength(state, a) >= strength(state, b) ? [a, b] : [b, a];
      const id = `war${p.next++}`;
      p.wars.push({ id, aggressor, defender, started: state.day, duration: POLITY.warMin + deriveRng(state.seed, 'war-len', id).int(0, POLITY.warSpread), raids: 0, status: 'active' });
      r.lastWar = state.day;
    }
  }

  // 4. War: raids take and destroy goods and unbuilt claims; at the end the stronger side wins and a truce holds.
  for (const w of p.wars) {
    if (w.status !== 'active') continue;
    const rng = deriveRng(state.seed, 'raid', state.day, w.id);
    const def = state.villageEconomy?.towns[w.defender]?.goods, att = state.villageEconomy?.towns[w.aggressor]?.goods;
    if (def && rng.next() < POLITY.raidChance) {
      for (const item of Object.keys(def).sort()) {
        const take = Math.floor((def[item] ?? 0) * POLITY.raidShare);
        if (take <= 0) continue;
        def[item]! -= take;
        if (att) att[item] = (att[item] ?? 0) + Math.floor(take * POLITY.lootShare);
      }
      w.raids += 1;
    }
    const b = state.build;
    const target = b?.plans.filter((x) => x.townId === w.defender && (x.stage === 'gathering' || x.stage === 'building')).sort((x, y) => x.id.localeCompare(y.id))[0];
    if (b && target && rng.next() < POLITY.claimRaidChance) { target.stage = 'abandoned'; b.claims = b.claims.filter((c) => c.id !== target.claimId); }
    if (state.day - w.started >= w.duration) {
      w.status = 'ended';
      w.winner = strength(state, w.aggressor) >= strength(state, w.defender) ? w.aggressor : w.defender;
      // The loser's newest craft dies with the workshops and the people who knew it best. Newest is
      // last pushed, and nothing can depend on it yet, so dropping it leaves every prerequisite whole.
      const loser = w.winner === w.aggressor ? w.defender : w.aggressor;
      const known = p.tech[loser];
      if (known?.length) { w.lostTech = known[known.length - 1]!; p.tech[loser] = known.slice(0, -1); }
      p.knowledge[loser] = 0; // and what the workshops had half-worked-out scatters with them

      const r = p.relations[pairKey(w.aggressor, w.defender)];
      if (r) { r.feud = POLITY.truceFeud; r.trust = Math.min(r.trust, POLITY.truceTrust); r.treaty = 'none'; r.since = state.day; r.lastWar = state.day; }
    }
  }
  p.wars = p.wars.filter((w) => w.status === 'active' || state.day - w.started < 120);
  if (state.logistics) state.logistics.flow = {};
}
