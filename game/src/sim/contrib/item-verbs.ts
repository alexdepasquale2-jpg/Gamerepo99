/**
 * The held item joins the ring. When the scene passes `heldItem` in target.data, every verb the item's
 * row in data/items/items.json offers on that kind of target is listed as `use.<item>.<verb>@<target>`;
 * on any thing (not a person) the item's self-uses ("Eat bread", "Wrap up warm") are listed too.
 * Effects reuse the sim's own paths: the gift_give deed and gift affinity, the hearth keepsake, land acts,
 * build plans, the town ledger, stash acts and node gathering; the rest is a bundle (contrib/use-effects).
 * Act ids carry the item, so acting needs no data. Pure: no Phaser/DOM.
 */
import deedsJson from '../../data/systems/interactions/deeds.json';
import { BUILDING_BY_ID, activePlans, contributeToPlan } from '../economy/build-plans';
import { householdOf } from '../economy/households';
import { deliverToTown, priceAt } from '../goods/deed-goods';
import { giveInstance } from '../goods/instances';
import { ITEMS, ITEM_BY_ID, addItem, giftAffinity, hasItem, itemName, removeItem } from '../goods/inventory';
import { useItem } from '../goods/item-use';
import { jobOf } from '../goods/jobs';
import { gatherNode } from '../goods/nodes';
import { applyStashAct, siteInTown } from '../hoard';
import type { CompatRuntime } from '../interaction';
import { landActOn, workLand } from '../land-acts';
import { pushJuice } from '../packets';
import { registerTargetProvider, type ActOutcome, type ProvidedAction, type ProviderEvent } from '../play-session/action-providers';
import { actInteraction } from '../play-session/play-session-interaction';
import { targetActionId, type Target } from '../play-session/targets';
import { encodeUnspokenForState } from '../social/unspoken';
import type { SimState } from '../types/runtime';
import { faunaKindOf, heldItemOf, isGrave, isShrine, nodeData, tileData, townOfTarget } from './target-data';
import { applyBundle, bundleRefusal, firstName, markUsed, residentOf, usedToday, type Bundle } from './use-effects';

export type VerbTarget = 'self' | 'person' | 'hearth' | 'tile' | 'node' | 'shrine' | 'grave' | 'plot' | 'wagon' | 'board' | 'chest' | 'fauna';
export type ItemEffect = Bundle & {
  /** An existing sim path to run first (the bundle's fields apply after it succeeds). */
  do?: 'gift' | 'memory' | 'land' | 'plan' | 'deliver' | 'stash' | 'gather' | 'alms' | 'buy';
  /** gift: extra item tags for affinity (wood given as firewood counts as warmth). */
  tags?: string[];
  /** land: the land act id; stash: the stash act id. */
  act?: string;
  /** buy: what the coin buys. */
  item?: string;
};
export type ItemVerbRow = {
  id: string; label: string; short: string; target: VerbTarget;
  /** Items spent (default 1; 0 = kept, like a net or tools). */
  qty?: number;
  oncePerDay?: boolean;
  /** Person gate: their job, a new household (formed in the last 30 days), or a build that needs the item. */
  who?: { jobs?: string[]; household?: 'new'; plan?: boolean };
  nodeKinds?: string[];
  faunaKinds?: string[];
  effect: ItemEffect;
};

const NEW_HOUSEHOLD_DAYS = 30;
type Row = { id: string; verbs?: ItemVerbRow[] };
const VERBS = new Map(((ITEMS as unknown as { items: Row[] }).items).map((i) => [i.id, i.verbs ?? []]));
/** Every item's verbs (items.json), for the uses check and the satchel. */
export const itemVerbs = (itemId: string): readonly ItemVerbRow[] => VERBS.get(itemId) ?? [];
export const allItemVerbs = (): ReadonlyMap<string, readonly ItemVerbRow[]> => VERBS;

export const PREFIX = 'use.';
export const itemVerbAct = (itemId: string, verbId: string): string => `${PREFIX}${itemId}.${verbId}`;
function parseVerb(actionId: string): { itemId: string; row: ItemVerbRow } | null {
  const verb = actionId.slice(0, actionId.indexOf('@'));
  if (!verb.startsWith(PREFIX)) return null;
  const [itemId, verbId] = verb.slice(PREFIX.length).split('.');
  const row = itemVerbs(itemId ?? '').find((v) => v.id === verbId);
  return row && itemId ? { itemId, row } : null;
}

const GIFT_HOST = (deedsJson as { deeds: { id: string; hostMethod: string }[] }).deeds.find((d) => d.id === 'gift_give')?.hostMethod ?? 'inspire';

function whoOk(state: SimState, row: ItemVerbRow, personId: string, itemId: string): boolean {
  const w = row.who;
  if (!w) return true;
  if (w.jobs && !w.jobs.includes(jobOf(state, personId).id)) return false;
  if (w.household === 'new') {
    const h = householdOf(state, personId);
    if (!h || state.day - h.formed > NEW_HOUSEHOLD_DAYS) return false;
  }
  if (w.plan && !planNeeding(state, itemId, personId)) return false;
  return true;
}

/** A build in the gathering stage that still lacks this item (by owner, or on a claim). */
function planNeeding(state: SimState, itemId: string, ownerId?: string, claimId?: string) {
  return activePlans(state).find((p) => p.stage === 'gathering' && (!ownerId || p.ownerId === ownerId) && (!claimId || p.claimId === claimId) && (BUILDING_BY_ID.get(p.kind)?.cost[itemId] ?? 0) > (p.have[itemId] ?? 0));
}
/** Does this verb apply to this target? */
export function verbFits(state: SimState, row: ItemVerbRow, t: Target, itemId: string): boolean {
  switch (row.target) {
    case 'self': return t.kind !== 'person';
    case 'person': return t.kind === 'person' && !!state.people[t.id] && whoOk(state, row, t.id, itemId);
    case 'node': { const n = nodeData(t); return !!n && (!row.nodeKinds || row.nodeKinds.includes(n.kindId)); }
    case 'shrine': return isShrine(t);
    case 'grave': return isGrave(t);
    case 'plot': return t.kind === 'plot' && !isGrave(t) && !!planNeeding(state, itemId, undefined, t.id);
    case 'fauna': { const k = faunaKindOf(t); return !!k && (!row.faunaKinds || row.faunaKinds.includes(k)); }
    case 'tile': {
      const d = tileData(t);
      return !!d?.view && (row.effect.do !== 'land' || landActOn(d.view, d.q, d.r)?.id === row.effect.act);
    }
    case 'chest': return t.kind === 'chest' && siteInTown(state, state.player.townId)?.id === t.id;
    default: return t.kind === row.target;
  }
}

/** The held item's verbs on this target (self-uses on things, never on a person). */
export function heldItemVerbs(state: SimState, t: Target, itemId = heldItemOf(t)): ProvidedAction[] {
  if (!itemId || !hasItem(state, itemId)) return [];
  const out: ProvidedAction[] = [];
  for (const row of itemVerbs(itemId)) {
    if (!hasItem(state, itemId, Math.max(1, row.qty ?? 1))) continue;
    const once = onceKeyOf(itemId, row, t);
    if (once && usedToday(state, once)) continue;
    if (!verbFits(state, row, t, itemId)) continue;
    out.push({ id: targetActionId(itemVerbAct(itemId, row.id), t), label: row.label, short: row.short, family: t.kind === 'person' ? 'give' : 'use' });
  }
  return out;
}

/** Once-per-day verbs, and anything done to an animal (once per animal per day). */
const onceKeyOf = (itemId: string, row: ItemVerbRow, t: Target): string | null =>
  row.oncePerDay ? `${itemId}.${row.id}` : t.kind === 'fauna' ? `${itemId}.${row.id}@fauna:${t.id}` : null;

const fail = (line: string): ActOutcome => ({ ok: false, line });

/** Give the held item to a person through the gift_give deed: affinity (plus the verb's tags) picks the reaction. */
function giveHeld(state: SimState, personId: string, itemId: string, row: ItemVerbRow, eventLog: ProviderEvent[], rt?: CompatRuntime): ActOutcome {
  const item = ITEM_BY_ID.get(itemId)!;
  const extra = (row.effect.tags ?? []).filter((tag) => !item.tags.includes(tag));
  const p = state.people[personId]!;
  const hay = [...(p.tags ?? []), p.woundId ?? ''].join(' ').toLowerCase();
  let affinity = giftAffinity(state, personId, itemId);
  for (const r of ITEMS.giftAffinity.rules) if (extra.includes(r.itemTag) && (r.personMatch === '' || hay.includes(r.personMatch))) affinity += r.weight;
  if (row.who?.jobs) affinity += 1;
  const name = firstName(state, personId);
  const feel = affinity >= 2 ? 'holds it close' : affinity > 0 ? 'smiles' : 'accepts it politely';
  let line = `${name} ${feel} (${item.name}).`;
  if (rt?.catalog.has('gift_give') && rt.people.has(personId)) {
    const out = actInteraction(state, rt, { personId, methodId: GIFT_HOST, interactionId: 'gift_give', line }, eventLog);
    if (out === 'refused') return { ok: false };
  }
  removeItem(state, itemId, Math.max(1, row.qty ?? 1));
  giveInstance(state, itemId, personId);
  const toPlan = contributeToPlan(state, personId, itemId);
  const relief = !toPlan && !!p.townId && deliverToTown(state, p.townId, itemId, 1, personId);
  line += `${relief ? ' The town needed that.' : ''}${toPlan ? ` ${toPlan}` : ''}`;
  return { ok: true, line };
}

/** Run the verb's own path; null = no path (bundle only, the item is spent after). */
function runPath(state: SimState, itemId: string, row: ItemVerbRow, t: Target, eventLog: ProviderEvent[], rt?: CompatRuntime): ActOutcome | null {
  const e = row.effect;
  const townId = townOfTarget(state, t);
  const name = itemName(itemId);
  switch (e.do) {
    case 'gift': return giveHeld(state, t.id, itemId, row, eventLog, rt);
    case 'memory': {
      const before = state.inventory?.[itemId] ?? 0;
      const line = useItem(state, itemId, townId);
      return { ok: (state.inventory?.[itemId] ?? 0) < before, line };
    }
    case 'land': {
      const d = tileData(t)!;
      const r = workLand(state, d.view!, e.act ?? '', d.q, d.r, d.towns ?? []);
      return { ok: r.ok, line: r.line };
    }
    case 'plan': {
      const plan = planNeeding(state, itemId, undefined, t.id);
      const line = plan ? contributeToPlan(state, plan.ownerId, itemId) : null;
      if (!plan || !line) return fail('Their build has enough of that.');
      removeItem(state, itemId);
      giveInstance(state, itemId, plan.ownerId);
      return { ok: true, line: `You add the ${name.toLowerCase()} to ${plan.ownerId === 'player' ? 'your own' : `${firstName(state, plan.ownerId)}'s`} pile. ${line}` };
    }
    case 'deliver': {
      if (!townId) return fail('There is no town here to take it.');
      const who = residentOf(state, townId, `deliver.${itemId}`);
      removeItem(state, itemId);
      const relief = who ? deliverToTown(state, townId, itemId, 1, who) : false;
      if (who) encodeUnspokenForState(state, 'gift_give', who, { tags: ['supply_relief'] });
      return { ok: true, line: `You leave the ${name.toLowerCase()} where the board asks.${relief ? ' The town needed that.' : ''}` };
    }
    case 'stash': {
      const ok = applyStashAct(state, e.act ?? '');
      return ok ? { ok, line: `You tuck the ${name.toLowerCase()} away.` } : fail('There is no room for it.');
    }
    case 'gather': {
      const n = nodeData(t);
      const line = n ? gatherNode(state, n) : null;
      return line ? { ok: true, line } : fail('Nothing left to take here today.');
    }
    case 'alms': {
      if (!removeItem(state, 'coin')) return fail('You have no coin.');
      encodeUnspokenForState(state, 'gift_give', t.id, { tags: ['comfort', 'supply_relief'] });
      return { ok: true, line: `${firstName(state, t.id)} closes a hand round the coin.` };
    }
    case 'buy': {
      const what = e.item ?? 'bread';
      const cost = priceAt(state, townId ?? '', what);
      if (!removeItem(state, 'coin', cost)) return fail(`A meal costs ${cost} coin.`);
      addItem(state, what, 1);
      return { ok: true, line: `${firstName(state, t.id)} sells you ${itemName(what).toLowerCase()} for ${cost} coin.` };
    }
    default: return null;
  }
}

/** Act one held-item verb on a target. False when the id is not an item verb. */
export function actItemVerb(state: SimState, actionId: string, t: Target, eventLog: ProviderEvent[], rt?: CompatRuntime): ActOutcome | false {
  const parsed = parseVerb(actionId);
  if (!parsed) return false;
  const { itemId, row } = parsed;
  const qty = row.qty ?? 1;
  if (!hasItem(state, itemId, Math.max(1, qty))) return fail(`You have no ${itemName(itemId).toLowerCase()} to use.`);
  if (!verbFits(state, row, t, itemId)) return fail(`The ${itemName(itemId).toLowerCase()} is no use here.`);
  const onceKey = onceKeyOf(itemId, row, t);
  if (onceKey && usedToday(state, onceKey)) return fail('You have done that today.');
  const { do: _d, tags: _t, act: _a, item: _i, ...bundle } = row.effect;
  // A bundle-only use with no authored line says what you did ("You eat the bread. +6 spark").
  if (!row.effect.do && !bundle.done) bundle.done = `You ${row.label[0]!.toLowerCase()}${row.label.slice(1)}.`;
  const townId = townOfTarget(state, t);
  const ctx = { townId, node: nodeData(t), itemId, key: `${itemId}.${row.id}@${t.kind}:${t.id}` };
  const refusal = bundleRefusal(state, bundle, ctx);
  if (refusal) return fail(refusal);
  const before = state.bus?.lastIds?.length ?? 0;
  const path = runPath(state, itemId, row, t, eventLog, rt);
  if (path && !path.ok) return path;
  if (!path && qty > 0) removeItem(state, itemId, qty);
  const hasBundle = Object.keys(bundle).length > 0;
  const res = hasBundle ? applyBundle(state, bundle, ctx) : undefined;
  if (onceKey) markUsed(state, onceKey);
  const line = [path?.line, res?.line].filter(Boolean).join(' ') || `You use the ${itemName(itemId).toLowerCase()}.`;
  const interacted = (state.bus?.lastIds ?? []).slice(before).includes('person.reaction');
  if (!interacted) {
    const personId = t.kind === 'person' ? t.id : res?.residentId;
    pushJuice(state, 'item.used', { itemId, verb: row.id, target: t.kind, townId, personId, line });
  }
  for (const type of (state.bus?.lastIds ?? []).slice(before)) if (type === 'item.used') eventLog.push({ type, methodId: actionId });
  // When the gift resolved as a deed, the person's own reaction bubble already says it.
  return { ok: true, ...(interacted ? {} : { line }) };
}

registerTargetProvider({
  id: 'item-verbs',
  kinds: ['person', 'node', 'facility', 'board', 'wagon', 'signpost', 'door', 'hearth', 'chest', 'ground-item', 'plot', 'tile', 'fauna'],
  list: (state, t) => heldItemVerbs(state, t),
  act: (state, actionId, t, ctx) => actItemVerb(state, actionId, t, ctx.eventLog, ctx.rt),
});
