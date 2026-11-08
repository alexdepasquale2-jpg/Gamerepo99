/**
 * Every thing has at least two uses (README rule 6), each with a supply and a demand.
 *
 * The rule, checked over the data tables (pure; no state):
 *   item   ≥ 2 verbs in items.json (each a demand: it spends or needs the item), and ≥ 1 supply: a job's
 *          work or recipe, a resource node, a roadside trader, the starting satchel, a land act's yield,
 *          a patron's offer, or another verb's output (gain / buy).
 *   node   ≥ 2 uses (Gather + its own verbs in resource-nodes.json + held-item verbs aimed at its kind),
 *          and ≥ 1 supply (what Gather yields).
 *   fauna  ≥ 2 uses (its own verbs in fauna.json + held-item verbs aimed at it), and ≥ 1 that supplies
 *          something (spark, items, town goods, regrowth or a resident's thanks).
 *   every verb (items, nodes, fauna, land acts, deeds) has a full label and a chip ≤ SHORT_MAX characters,
 *          and points at things that exist (items, node and fauna kinds, jobs, land and stash acts).
 * Run: `npx vite-node game/scripts/uses-check.mts` (exits 1 on any error).
 */
import deedsJson from '../../data/systems/interactions/deeds.json';
import jobsJson from '../../data/items/jobs.json';
import patronsJson from '../../data/economy/patrons.json';
import { ITEMS } from '../goods/inventory';
import { NODES } from '../goods/nodes';
import { LAND_RULES } from '../land-acts';
import { SHORT_MAX } from '../play-session/verb-families';
import { allItemVerbs, type ItemVerbRow } from './item-verbs';
import { FAUNA, faunaVerbs, nodeVerbs, type ThingVerbRow } from './thing-verbs';
import type { Bundle } from './use-effects';

export type UsesRow = { kind: 'item' | 'node' | 'fauna'; id: string; uses: string[]; supplies: string[] };
export type UsesReport = { ok: boolean; errors: string[]; rows: UsesRow[] };

type Job = { id: string; yield: { itemId: string }[]; recipes: { out: Record<string, number> }[] };
const JOBS = (jobsJson as unknown as { jobs: Job[] }).jobs;
const TARGETS = new Set(['self', 'person', 'hearth', 'tile', 'node', 'shrine', 'grave', 'plot', 'wagon', 'board', 'chest', 'fauna']);
const DOES = new Set(['gift', 'memory', 'land', 'plan', 'deliver', 'stash', 'gather', 'alms', 'buy']);
const STASH_ACTS = new Set(['stash_hide', 'stash_store', 'stash_guard_hire', 'stash_withdraw']);
const BUNDLE_KEYS: (keyof Bundle)[] = ['spark', 'gain', 'town', 'despair', 'thanks', 'regrow', 'tend', 'charge'];
const an = (w: string): string => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);
const supplies = (b: Bundle): boolean => !!(b.spark || b.gain || b.town || b.regrow || b.thanks || b.tend || (b.despair ?? 0) < 0);

/** Where each item comes from (item id → sources). */
function supplyMap(): Map<string, string[]> {
  const m = new Map<string, string[]>();
  const add = (id: string, src: string): void => void m.set(id, [...(m.get(id) ?? []), src]);
  for (const j of JOBS) {
    for (const y of j.yield) add(y.itemId, `work alongside ${an(j.id)}`);
    for (const r of j.recipes) for (const id of Object.keys(r.out)) add(id, `${j.id} makes it`);
  }
  for (const k of NODES.kinds) for (const y of k.yields) add(y.itemId, `gather ${an(k.name.toLowerCase())}`);
  for (const id of ITEMS.market.goods) add(id, 'roadside traders');
  for (const id of Object.keys(ITEMS.startingInventory)) add(id, 'in your satchel at the start');
  for (const a of LAND_RULES.acts) for (const id of Object.keys(a.yield ?? {})) add(id, a.label.toLowerCase());
  for (const p of (patronsJson as { patrons: { name: string; deals: { offer: { coin?: number; goods?: Record<string, number> } }[] }[] }).patrons) {
    for (const d of p.deals) {
      if (d.offer.coin) add('coin', `${p.name} deal`);
      for (const id of Object.keys(d.offer.goods ?? {})) add(id, `${p.name} deal`);
    }
  }
  for (const [itemId, verbs] of allItemVerbs()) for (const v of verbs) {
    for (const id of Object.keys(v.effect.gain ?? {})) add(id, `${v.label.toLowerCase()} (${itemId})`);
    if (v.effect.do === 'buy') add(v.effect.item ?? 'bread', `${v.label.toLowerCase()} (coin)`);
  }
  for (const k of NODES.kinds) for (const v of nodeVerbs(k.id)) for (const id of Object.keys(v.effect.gain ?? {})) add(id, `${v.label.toLowerCase()} (${k.id})`);
  for (const f of FAUNA) for (const v of faunaVerbs(f.id)) for (const id of Object.keys(v.effect.gain ?? {})) add(id, `${v.label.toLowerCase()} (${f.id})`);
  return m;
}

function checkLabel(errors: string[], where: string, v: { id: string; label?: string; short?: string }): void {
  if (!v.label?.trim()) errors.push(`${where}: no full label`);
  if (!v.short?.trim()) errors.push(`${where}: no short label`);
  else if (v.short.length > SHORT_MAX) errors.push(`${where}: short "${v.short}" is over ${SHORT_MAX} characters`);
}

export function checkUses(): UsesReport {
  const errors: string[] = [];
  const rows: UsesRow[] = [];
  const items = new Set(ITEMS.items.map((i) => i.id));
  const nodeKinds = new Set(NODES.kinds.map((k) => k.id));
  const faunaKinds = new Set(FAUNA.map((f) => f.id));
  const jobs = new Set(JOBS.map((j) => j.id));
  const landActs = new Set(LAND_RULES.acts.map((a) => a.id));
  const sup = supplyMap();
  const itemRefs = (where: string, rec?: Record<string, number>): void => {
    for (const id of Object.keys(rec ?? {})) if (!items.has(id)) errors.push(`${where}: unknown item ${id}`);
  };
  const thingVerb = (where: string, v: ThingVerbRow): void => {
    checkLabel(errors, where, v);
    itemRefs(where, v.needs);
    itemRefs(where, v.effect.gain);
    itemRefs(where, v.effect.town);
    if (!BUNDLE_KEYS.some((k) => v.effect[k] !== undefined)) errors.push(`${where}: effect does nothing`);
    for (const k of v.effect.regrow ?? []) if (!nodeKinds.has(k)) errors.push(`${where}: unknown node kind ${k}`);
  };

  // Items.
  const all = allItemVerbs();
  for (const item of ITEMS.items) {
    const verbs: readonly ItemVerbRow[] = all.get(item.id) ?? [];
    for (const v of verbs) {
      const where = `item ${item.id}.${v.id}`;
      checkLabel(errors, where, v);
      if (!TARGETS.has(v.target)) errors.push(`${where}: unknown target ${v.target}`);
      const e = v.effect;
      if (e.do && !DOES.has(e.do)) errors.push(`${where}: unknown effect ${e.do}`);
      if (!e.do && !BUNDLE_KEYS.some((k) => e[k] !== undefined)) errors.push(`${where}: effect does nothing`);
      if (e.do === 'land' && !landActs.has(e.act ?? '')) errors.push(`${where}: unknown land act ${e.act}`);
      if (e.do === 'land' && v.target !== 'tile') errors.push(`${where}: a land act needs a tile target`);
      if (e.do === 'stash' && !STASH_ACTS.has(e.act ?? '')) errors.push(`${where}: unknown stash act ${e.act}`);
      if ((e.do === 'gift' || e.do === 'alms' || e.do === 'buy') && v.target !== 'person') errors.push(`${where}: ${e.do} needs a person target`);
      if (e.do === 'plan' && v.target !== 'plot') errors.push(`${where}: plan needs a plot target`);
      if (e.do === 'gather' && v.target !== 'node') errors.push(`${where}: gather needs a node target`);
      for (const k of v.nodeKinds ?? []) if (!nodeKinds.has(k)) errors.push(`${where}: unknown node kind ${k}`);
      for (const k of v.faunaKinds ?? []) if (!faunaKinds.has(k)) errors.push(`${where}: unknown fauna kind ${k}`);
      for (const j of v.who?.jobs ?? []) if (!jobs.has(j)) errors.push(`${where}: unknown job ${j}`);
      itemRefs(where, e.gain);
      itemRefs(where, e.town);
    }
    if (new Set(verbs.map((v) => v.id)).size !== verbs.length) errors.push(`item ${item.id}: duplicate verb ids`);
    if (verbs.length < 2) errors.push(`item ${item.id}: ${verbs.length} use(s), needs at least 2`);
    const s = sup.get(item.id) ?? [];
    if (!s.length) errors.push(`item ${item.id}: no supply (job, node, trader, start, land act, patron or verb output)`);
    rows.push({ kind: 'item', id: item.id, uses: verbs.map((v) => v.label), supplies: [...new Set(s)] });
  }

  // Held-item verbs aimed at a node kind / an animal count as their uses too.
  const aimed = (pred: (v: ItemVerbRow) => boolean): string[] => [...all].flatMap(([id, vs]) => vs.filter(pred).map((v) => `${v.label} (${id})`));

  for (const k of NODES.kinds) {
    const own = nodeVerbs(k.id);
    own.forEach((v) => thingVerb(`node ${k.id}.${v.id}`, v));
    const held = aimed((v) => (v.target === 'node' && (!v.nodeKinds || v.nodeKinds.includes(k.id))) || (v.target === 'shrine' && k.id === 'herb_patch'));
    const uses = [`Gather · ${k.name}`, ...own.map((v) => v.label), ...held];
    if (uses.length < 2) errors.push(`node ${k.id}: ${uses.length} use(s), needs at least 2`);
    if (!k.yields.length) errors.push(`node ${k.id}: gathering it yields nothing`);
    rows.push({ kind: 'node', id: k.id, uses, supplies: k.yields.map((y) => y.itemId) });
  }

  for (const f of FAUNA) {
    const own = faunaVerbs(f.id);
    own.forEach((v) => thingVerb(`fauna ${f.id}.${v.id}`, v));
    const heldRows = [...all].flatMap(([, vs]) => vs.filter((v) => v.target === 'fauna' && (!v.faunaKinds || v.faunaKinds.includes(f.id))));
    const uses = [...own.map((v) => v.label), ...aimed((v) => heldRows.includes(v))];
    if (uses.length < 2) errors.push(`fauna ${f.id}: ${uses.length} use(s), needs at least 2`);
    const giving = [...own, ...heldRows].filter((v) => supplies(v.effect));
    if (!giving.length) errors.push(`fauna ${f.id}: no use supplies anything`);
    rows.push({ kind: 'fauna', id: f.id, uses, supplies: giving.map((v) => v.label) });
  }

  for (const a of LAND_RULES.acts) checkLabel(errors, `land ${a.id}`, { id: a.id, label: a.label, short: a.short ?? a.label });
  const families = new Set((deedsJson as { families: { id: string; aliases?: string[] }[] }).families.flatMap((f) => [f.id, ...(f.aliases ?? [])]));
  for (const d of (deedsJson as { deeds: { id: string; label: string; short?: string; family?: string }[] }).deeds) {
    checkLabel(errors, `deed ${d.id}`, { id: d.id, label: d.label, short: d.short ?? d.label });
    if (d.family && !families.has(d.family)) errors.push(`deed ${d.id}: unknown family ${d.family}`);
  }
  return { ok: errors.length === 0, errors, rows };
}
