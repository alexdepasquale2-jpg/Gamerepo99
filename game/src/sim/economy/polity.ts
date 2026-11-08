/**
 * Light polity layer, run by towns alone: diplomacy (trust and feud, treaties), war (raids, blocked
 * roads, truce), technology (knowledge from workshops unlocks trade multipliers; treaties spread it)
 * and religion (a finished chapel founds a creed with a small effect). The player has no verbs here
 * yet. Reads borders/logistics/build state directly (no imports of them) so economy modules can
 * import the hooks below without cycles. Pure + deterministic.
 */

import polityJson from '../../data/items/polity.json';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';

export type Tech = { id: string; name: string; cost: number; needs: { buildings?: Record<string, number>; techs?: string[] }; mul: Record<string, number> };
export type Creed = { id: string; name: string; birthMul?: number; jobMul?: Record<string, number>; safeRoads?: boolean; feudDecay?: number };
const T = polityJson as unknown as { techs: Tech[]; creeds: Creed[] };
export const TECHS = T.techs;
export const CREEDS = T.creeds;

export const POLITY = {
  trustPerUnit: 0.5, trustDrift: 0.2, feudPerTension: 1 / 20, creedFriction: 0.3, feudDecay: 1,
  tradeTrust: 20, tradeFeud: 20, allyTrust: 60, allyFeud: 10, breakFeud: 40,
  warFeud: 80, warCooldown: 10, warMin: 15, warSpread: 16, raidChance: 0.5, raidShare: 0.15, lootShare: 0.4, claimRaidChance: 0.2, truceFeud: 50, truceTrust: -20,
  warCartSurvivalPow: 3,
  knowledgeBase: 0.3, knowledgePerWorkshop: 0.7, knowledgePerGifted: 2, learnTrade: 0.05, learnAlliance: 0.1, learnAfterDays: 10,
};

export type Treaty = 'none' | 'trade' | 'alliance';
export type Relation = { a: string; b: string; trust: number; feud: number; treaty: Treaty; since: number; lastWar: number };
export type War = { id: string; aggressor: string; defender: string; started: number; duration: number; raids: number; status: 'active' | 'ended'; winner?: string };
export type Faith = { creed: string; founded: number; shrine: string };
export type Polity = { relations: Record<string, Relation>; wars: War[]; knowledge: Record<string, number>; tech: Record<string, string[]>; faiths: Record<string, Faith>; next: number };

const pol = (state: SimState): Polity => (state.polity ??= { relations: {}, wars: [], knowledge: {}, tech: {}, faiths: {}, next: 1 });
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

// ---- Hooks other economy modules read ----
export const atWar = (state: SimState, a: string, b: string): boolean =>
  (state.polity?.wars ?? []).some((w) => w.status === 'active' && pairKey(w.aggressor, w.defender) === pairKey(a, b));
export const treatyOf = (state: SimState, a: string, b: string): Treaty => state.polity?.relations[pairKey(a, b)]?.treaty ?? 'none';
export const techsOf = (state: SimState, townId: string): string[] => state.polity?.tech[townId] ?? [];
export const creedOf = (state: SimState, townId: string): Creed | undefined => CREEDS.find((c) => c.id === state.polity?.faiths[townId]?.creed);
/** Production multiplier from the town's technology and creed for a trade. */
export function polityMul(state: SimState, townId: string, jobId: string): number {
  const known = techsOf(state, townId);
  let m = TECHS.filter((t) => known.includes(t.id)).reduce((n, t) => n * (t.mul[jobId] ?? 1), 1);
  m *= creedOf(state, townId)?.jobMul?.[jobId] ?? 1;
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

  // 2. Technology: knowledge from workshops and gifted villagers; research the cheapest available tech.
  for (const id of towns) {
    const built = claims.filter((c) => c.townId === id && c.status === 'built');
    const gifted = Object.values(state.people ?? {}).filter((x) => x.townId === id && x.tags?.some((t) => t.startsWith('gifted_'))).length;
    p.knowledge[id] = (p.knowledge[id] ?? 0) + POLITY.knowledgeBase + POLITY.knowledgePerWorkshop * built.filter((c) => c.kind !== 'house').length + POLITY.knowledgePerGifted * gifted;
    const known = (p.tech[id] ??= []);
    const have = (kind: string): number => built.filter((c) => c.kind === kind).length;
    const next = TECHS.filter((t) => !known.includes(t.id) && (t.needs.techs ?? []).every((x) => known.includes(x)) && Object.entries(t.needs.buildings ?? {}).every(([k, n]) => have(k) >= n)).sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))[0];
    if (next && p.knowledge[id]! >= next.cost) { p.knowledge[id]! -= next.cost; known.push(next.id); }
  }

  // 3. Diplomacy: neighbours (by road or border) trade, quarrel, sign and break treaties, and trade ideas.
  const pairs = new Set<string>([...Object.keys(state.borders?.pairs ?? {}), ...(state.economyRoutes ?? []).map((r) => pairKey(r.fromTownId, r.toTownId))]);
  for (const key of [...pairs].sort()) {
    const [a, b] = key.split('|') as [string, string];
    if (!state.towns?.[a] || !state.towns?.[b]) continue;
    const r = (p.relations[key] ??= { a, b, trust: 0, feud: 0, treaty: 'none', since: state.day, lastWar: -999 });
    const drift = Math.min(Math.abs(r.trust), POLITY.trustDrift) * Math.sign(r.trust);
    r.trust = Math.max(-100, Math.min(100, r.trust + POLITY.trustPerUnit * (flow[key] ?? 0) - drift));
    const creedA = p.faiths[a]?.creed, creedB = p.faiths[b]?.creed;
    const decay = Math.max(creedOf(state, a)?.feudDecay ?? POLITY.feudDecay, creedOf(state, b)?.feudDecay ?? POLITY.feudDecay);
    r.feud = Math.max(0, Math.min(100, r.feud + (state.borders?.pairs[key]?.tension ?? 0) * POLITY.feudPerTension + (creedA && creedB && creedA !== creedB ? POLITY.creedFriction : 0) - decay));
    const was = r.treaty;
    if (r.treaty !== 'none' && (r.feud >= POLITY.breakFeud || r.trust < 0)) r.treaty = 'none';
    else if (r.treaty === 'none' && r.trust >= POLITY.tradeTrust && r.feud < POLITY.tradeFeud) r.treaty = 'trade';
    else if (r.treaty === 'trade' && r.trust >= POLITY.allyTrust && r.feud < POLITY.allyFeud) r.treaty = 'alliance';
    if (r.treaty !== was) r.since = state.day;
    // Partners learn from each other's techs.
    if (r.treaty !== 'none' && state.day - r.since >= POLITY.learnAfterDays) {
      const chance = r.treaty === 'alliance' ? POLITY.learnAlliance : POLITY.learnTrade;
      for (const [from, to] of [[a, b], [b, a]] as const) {
        const lacking = (p.tech[from] ?? []).filter((t) => !(p.tech[to] ?? []).includes(t) && (TECHS.find((x) => x.id === t)?.needs.techs ?? []).every((q) => (p.tech[to] ?? []).includes(q)));
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
      const r = p.relations[pairKey(w.aggressor, w.defender)];
      if (r) { r.feud = POLITY.truceFeud; r.trust = Math.min(r.trust, POLITY.truceTrust); r.treaty = 'none'; r.since = state.day; r.lastWar = state.day; }
    }
  }
  p.wars = p.wars.filter((w) => w.status === 'active' || state.day - w.started < 120);
  if (state.logistics) state.logistics.flow = {};
}
