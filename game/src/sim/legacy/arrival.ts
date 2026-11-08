/** What came across in an imported world file: the legends and graves it carries, as diegetic lines. Pure. */

import type { DataTables } from '../load-data';
import type { SimState } from '../types/runtime';
import { legacyNpcId } from './imprint';
import { legacyTable } from './state';
import type { ProtagonistImprint, WorldDelta } from './types';

export type ArrivalName = {
  kind: 'legend' | 'grave';
  personId: string;
  name: string;
  townId?: string;
  townName: string;
  /** Display name of the archetype the life was assembled from (v2 files, or inferred by migration). */
  archetypeName?: string;
  generation?: number;
  /** Past-tense verb phrases ("carried other people's burdens"). Empty for graves. */
  deeds: string[];
  /** One line about this name, ready to show. */
  line: string;
};

export type Arrival = { names: ArrivalName[]; lines: string[] };

type Copy = ReturnType<typeof legacyTable>['arrival'];

const sub = (tpl: string, vars: Record<string, string | number>): string =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (Object.hasOwn(vars, k) ? String(vars[k]) : m));

export function joinAnd(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
}

function townNameOf(state: SimState, townId: string | undefined, c: Copy): string {
  if (!townId) return c.somewhere;
  const rows = ((state.data as DataTables | undefined)?.towns ?? []) as { id?: string; name?: string }[];
  const row = rows.find((t) => t.id === townId);
  return row?.name ?? townId.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** What a former carrier is remembered for: their strongest methods, someone they rekindled, someone they stayed close to. */
export function legendDeeds(state: SimState, im: ProtagonistImprint, c: Copy = legacyTable().arrival): string[] {
  const out: string[] = [];
  const methodDeeds = c.methodDeeds as Record<string, string>;
  const methods = ((state.data as DataTables | undefined)?.methods ?? []) as { id?: string; name?: string }[];
  const tend = im.methodTendencies ?? {};
  const top = Object.keys(tend)
    .filter((m) => (tend[m] ?? 0) >= legacyTable().tendencyHooks.minTendency)
    .sort((a, b) => (tend[b] ?? 0) - (tend[a] ?? 0) || a.localeCompare(b))
    .slice(0, 2);
  for (const m of top) {
    const phrase = methodDeeds[m] ?? methods.find((x) => x.id === m)?.name?.toLowerCase();
    if (phrase) out.push(phrase);
  }
  const personName = (id: string | undefined) => (id ? state.people[id]?.name : undefined);
  const rekindled = [...(im.notableChoices ?? [])].reverse().find((ch) => ch.kind === 'reignite' && personName(ch.summary.split('@')[1]));
  const rekindledName = personName(rekindled?.summary.split('@')[1]);
  if (rekindledName) out.push(sub(c.rekindled, { person: rekindledName }));
  const bond = [...(im.bonds ?? [])].sort((a, b) => b.weight - a.weight || a.personId.localeCompare(b.personId)).find((b) => personName(b.personId));
  const bondName = personName(bond?.personId);
  if (bondName && bondName !== rekindledName) out.push(sub(c.closeTo, { person: bondName }));
  return out;
}

function ordinal(n: number, c: Copy): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return c.ordinals[n - 1] ?? sub(c.ordinalMany, { n, suffix });
}

/** Summarise the legend imprint and the graves a world file brought, grouped into "spoken of in <town>" lines. */
export function describeArrival(state: SimState, imprint: ProtagonistImprint | null, deltas: WorldDelta[]): Arrival {
  const c = legacyTable().arrival;
  const data = state.data as DataTables | undefined;
  const names: ArrivalName[] = [];
  const seen = new Set<string>();
  if (imprint) {
    const personId = legacyNpcId(imprint);
    seen.add(personId);
    const archetypeName = imprint.archetypeId ? data?.archetypes.find((a) => a.id === imprint.archetypeId)?.name : undefined;
    const deeds = legendDeeds(state, imprint, c);
    const who = (archetypeName && archetypeName !== imprint.displayName ? sub(c.who, { archetype: archetypeName }) : '') + (imprint.generation ? sub(c.lineage, { ordinal: ordinal(imprint.generation, c) }) : '');
    const townName = townNameOf(state, imprint.homeTownId, c);
    names.push({
      kind: 'legend',
      personId,
      name: imprint.displayName,
      townId: imprint.homeTownId,
      townName,
      ...(archetypeName ? { archetypeName } : {}),
      ...(imprint.generation ? { generation: imprint.generation } : {}),
      deeds,
      line: sub(c.legend, { name: imprint.displayName, who, deeds: deeds.length ? sub(c.deeds, { deeds: joinAnd(deeds) }) : c.noDeeds }),
    });
  }
  // Newest grave first: the most recent lives are the ones still talked about.
  for (const d of [...deltas].reverse()) {
    if (d.t !== 'grave' || seen.has(d.personId)) continue;
    seen.add(d.personId);
    const name = d.name ?? d.personId;
    const townName = townNameOf(state, d.townId, c);
    names.push({ kind: 'grave', personId: d.personId, name, townId: d.townId, townName, deeds: [], line: sub(c.grave, { name, town: townName, day: d.day }) });
  }
  if (!names.length) return { names, lines: [c.none] };
  const towns: string[] = [];
  for (const n of names) if (!towns.includes(n.townName)) towns.push(n.townName);
  const lines = towns.map((town) => {
    const here = names.filter((n) => n.townName === town).map((n) => n.name);
    const count = c.counts[here.length - 1] ?? sub(c.countMany, { n: here.length });
    return sub(c.heard, { count, verb: here.length === 1 ? c.verbOne : c.verbMany, town, names: joinAnd(here) });
  });
  return { names, lines: [...lines, ...names.map((n) => n.line)] };
}
