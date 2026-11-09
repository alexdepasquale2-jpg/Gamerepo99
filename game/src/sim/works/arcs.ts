/**
 * The five arcs and the Era ladder. Each arc is five tiers walked in order; a tier is met when its stat
 * reaches n, and pays renown and coin at once. The fifth tier grants the arc's lasting boon. Renown climbs
 * the Eras (data/works/arcs.json), and each Era opens buildings, recipes, vehicles and yards.
 * Pure + deterministic.
 */
import { addItem } from '../goods/inventory';
import type { SimState } from '../types/runtime';
import { ARCS, ERAS, type ArcRow, type TierRow } from './data';
import { depotCount, eraOf, news, worksIfAny, worksOf } from './state';
import { statsOf } from './vehicles';
import { warMachines } from './war';

/** The number a tier's stat stands at now: live counts for what you hold, running totals for the rest. */
export function statOf(state: SimState, stat: string): number {
  const w = worksIfAny(state);
  if (!w) return 0;
  switch (stat) {
    case 'lines': return w.lines.filter((l) => l.on && l.workers.length).length;
    case 'depots': return depotCount(state);
    case 'soldiers': return w.band?.soldiers.length ?? 0;
    case 'vassals': return w.vassals.length;
    case 'war_machines': return warMachines(state);
    case 'dishes': return w.dishes.length;
    case 'towns_fed': return w.fedTowns.length;
    case 'vehicles': return w.vehicles.length;
    case 'engined': return w.vehicles.filter((v) => statsOf(v).engined).length;
    case 'airships': return w.vehicles.filter((v) => statsOf(v).flies).length;
    default: return w.stats[stat] ?? 0;
  }
}

export type TierView = { tier: TierRow; index: number; done: boolean; current: boolean; have: number };
export type ArcView = { arc: ArcRow; tiers: TierView[]; done: number; complete: boolean };

export function arcsView(state: SimState): ArcView[] {
  const w = worksIfAny(state);
  return ARCS.map((arc) => {
    let done = 0;
    while (done < arc.tiers.length && w?.claimed[`${arc.id}:${done}`] !== undefined) done++;
    const tiers = arc.tiers.map((tier, index) => ({ tier, index, done: index < done, current: index === done, have: statOf(state, tier.stat) }));
    return { arc, tiers, done, complete: done === arc.tiers.length };
  });
}

/** Claim every tier now met (in order). Returns the lines to say, if any. */
export function checkArcs(state: SimState): string[] {
  const w = worksIfAny(state);
  if (!w) return [];
  const said: string[] = [];
  const eraBefore = eraOf(state);
  for (const v of arcsView(state)) {
    for (let i = v.done; i < v.arc.tiers.length; i++) {
      const t = v.arc.tiers[i]!;
      if (statOf(state, t.stat) < t.n) break;
      w.claimed[`${v.arc.id}:${i}`] = state.day;
      w.renown += t.renown;
      if (t.coin) addItem(state, 'coin', t.coin);
      const last = i === v.arc.tiers.length - 1;
      if (last) grantBoon(state, v.arc);
      said.push(last
        ? `${v.arc.name} is done: you are a ${v.arc.role.toLowerCase()} now. ${v.arc.boon}`
        : `${v.arc.name}, step ${i + 1}: ${t.label.toLowerCase()} (+${t.renown} renown${t.coin ? `, ${t.coin} coin` : ''}).`);
    }
  }
  const era = eraOf(state);
  if (era > eraBefore) said.push(`A new age: the ${ERAS.find((e) => e.era === era)!.name}. New buildings, recipes and vehicles are open to you.`);
  for (const line of said) news(state, line);
  return said;
}

function grantBoon(state: SimState, arc: ArcRow): void {
  const w = worksOf(state);
  if (w.boons.includes(arc.id)) return;
  w.boons.push(arc.id);
  const p = state.player;
  if (arc.id === 'hearth') p.sparkMax = (p.sparkMax ?? 100) + 25;
  if (arc.id === 'sky') {
    p.sparkMax = (p.sparkMax ?? 100) + 50;
    p.spark = p.sparkMax;
    for (const t of Object.values(state.towns ?? {})) t.despair = Math.max(0, t.despair - 0.1);
  }
}

/** Your standing in a word, from the arcs you have walked furthest. */
export function titleOf(state: SimState): string {
  const best = arcsView(state).filter((v) => v.done > 0).sort((a, b) => b.done - a.done)[0];
  if (!best) return 'Newcomer';
  return best.complete ? best.arc.role : ['Newcomer', 'Apprentice', 'Journeyman', 'Master', 'Grandmaster'][best.done]! + ` ${best.arc.role.toLowerCase()}`;
}
