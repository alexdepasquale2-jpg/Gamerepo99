/**
 * Read-only view of the village economy for the player: a town's shortages, carts on the way,
 * building plans, companies and neighbours (noticeboard), and what the world map draws.
 * Pure over SimState; nothing here changes the sim.
 */

import { itemName } from '../goods/inventory';
import { BUILDING_BY_ID, activePlans } from './build-plans';
import { cartPosition } from './logistics';
import { TECHS, atWar, creedOf, techsOf, treatyOf } from './polity';
import { townNeeds } from './village-economy';

const label = (id: string): string => (id === 'food' ? 'food' : itemName(id).toLowerCase());
const first = (state: { people: Record<string, { name?: string }> }, id: string): string => (state.people[id]?.name ?? id).split(' ')[0]!;

export type PlanView = { id: string; owner: string; building: string; stage: 'gathering' | 'building'; progress: number; missing: { itemId: string; qty: number }[] };
export type TownView = {
  short: { itemId: string; short: number }[];
  incoming: { itemId: string; qty: number; daysLeft: number; from: string }[];
  plans: PlanView[];
  companies: { name: string; workers: number }[];
  neighbours: { townId: string; treaty: string; war: boolean }[];
  creed?: string;
  techs: string[];
};

export function townEconomyView(state: import('../types/runtime').SimState, townId: string): TownView {
  const plans: PlanView[] = activePlans(state, townId).map((p) => {
    const def = BUILDING_BY_ID.get(p.kind)!;
    const cost = Object.entries(def.cost);
    const have = cost.reduce((n, [i, q]) => n + Math.min(q, p.have[i] ?? 0), 0) / cost.reduce((n, [, q]) => n + q, 0);
    return {
      id: p.id, owner: first(state as never, p.ownerId), building: def.name, stage: p.stage as 'gathering' | 'building',
      progress: p.stage === 'gathering' ? 0.5 * have : 0.5 + 0.5 * Math.min(1, p.laborDone / def.labor),
      missing: p.stage === 'gathering' ? cost.map(([itemId, q]) => ({ itemId, qty: q - (p.have[itemId] ?? 0) })).filter((m) => m.qty > 0) : [],
    };
  });
  const incoming = (state.logistics?.carts ?? []).filter((c) => c.toTownId === townId).map((c) => ({ itemId: c.itemId, qty: c.qty, daysLeft: c.daysLeft, from: c.fromTownId }));
  const others = new Set<string>();
  for (const r of state.economyRoutes ?? []) { if (r.fromTownId === townId) others.add(r.toTownId); if (r.toTownId === townId) others.add(r.fromTownId); }
  return {
    short: townNeeds(state, townId).slice(0, 5),
    incoming,
    plans,
    companies: (state.companies?.list ?? []).filter((c) => c.townId === townId).map((c) => ({ name: c.name, workers: 1 + c.workers.length })),
    neighbours: [...others].sort().map((o) => ({ townId: o, treaty: treatyOf(state, townId, o), war: atWar(state, townId, o) })),
    creed: creedOf(state, townId)?.name,
    techs: techsOf(state, townId).map((t) => TECHS.find((x) => x.id === t)?.name ?? t),
  };
}

/** Noticeboard text for the economy half of a town. Empty sections are left out. */
export function economyLines(v: TownView, townName: (id: string) => string): string[] {
  const out: string[] = [];
  if (v.short.length) out.push('The town is short of', ...v.short.map((n) => `• ${label(n.itemId)} (${Math.ceil(n.short)} a day)`), '');
  if (v.incoming.length) out.push('On the road to us', ...v.incoming.slice(0, 3).map((c) => `• ${c.qty} ${label(c.itemId)} from ${townName(c.from)}, ${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'} out`), '');
  if (v.plans.length) {
    out.push('Under construction');
    for (const p of v.plans.slice(0, 3)) out.push(`• ${p.owner}'s ${p.building}: ${Math.round(p.progress * 100)}%${p.missing.length ? `, needs ${p.missing.slice(0, 3).map((m) => `${m.qty} ${label(m.itemId)}`).join(', ')}` : ', building'}`);
    out.push('  Give a builder what they need and it goes to their site.', '');
  }
  if (v.companies.length) out.push('Workshops', ...v.companies.slice(0, 3).map((c) => `• ${c.name} (${c.workers} working)`), '');
  if (v.neighbours.length) out.push('Neighbours', ...v.neighbours.map((n) => `• ${townName(n.townId)}: ${n.war ? 'at war' : n.treaty === 'alliance' ? 'allied' : n.treaty === 'trade' ? 'trade pact' : 'no treaty'}`), '');
  if (v.creed) out.push(`Faith: ${v.creed}`);
  if (v.techs.length) out.push(`Known crafts: ${v.techs.join(', ')}`);
  return out;
}

export type MapEconomy = { carts: { routeId: string; from: string; to: string; f: number }[]; links: { a: string; b: string; kind: 'trade' | 'alliance' | 'war' }[]; reach: Record<string, number> };
/** What the world map draws: carts on roads, treaty and war lines, and town territory. */
export function mapEconomy(state: import('../types/runtime').SimState, reachOf: (townId: string) => number): MapEconomy {
  const carts = (state.logistics?.carts ?? []).flatMap((c) => { const p = cartPosition(c); return p ? [{ routeId: p.routeId, from: p.from, to: p.to, f: p.f }] : []; });
  const links: MapEconomy['links'] = [];
  for (const r of Object.values(state.polity?.relations ?? {})) {
    if (atWar(state, r.a, r.b)) links.push({ a: r.a, b: r.b, kind: 'war' });
    else if (r.treaty !== 'none') links.push({ a: r.a, b: r.b, kind: r.treaty });
  }
  return { carts, links, reach: Object.fromEntries(Object.keys(state.towns ?? {}).map((id) => [id, reachOf(id)])) };
}
