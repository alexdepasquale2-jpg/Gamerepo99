/**
 * The second (and third) use of things in the world, beside Gather:
 *   node   each resource kind's verbs in data/world/resource-nodes.json (plant a sapling, dig for clay,
 *          share the fishing spot, return a stray sheep, shore up the seam …)  → `node.<verb>@node:<id>`
 *   fauna  each animal's verbs in data/world/fauna.json (shoo, drive off, scare, watch, drive home …),
 *          once per animal per verb per day                                       → `fauna.<verb>@fauna:<id>`
 *   tile   the land act the ground in reach allows (lay stones, clear brush, mend the path), through
 *          sim/land-acts.ts; target.data carries q, r and the live LandView       → `land.<act>@tile:<id>`
 * Effects are bundles (contrib/use-effects). Pure: no Phaser/DOM.
 */
import faunaJson from '../../data/world/fauna.json';
import { hasItem, itemName, removeItem } from '../goods/inventory';
import { NODES, nodeCharges, type NodeKind } from '../goods/nodes';
import { LAND_RULES, landActOn, workLand } from '../land-acts';
import { pushJuice } from '../packets';
import { registerTargetProvider, type ActOutcome, type ProvidedAction } from '../play-session/action-providers';
import { targetActionId, type Target } from '../play-session/targets';
import type { SimState } from '../types/runtime';
import { itemVerbs } from './item-verbs';
import { faunaKindOf, heldItemOf, nodeData, tileData, townOfTarget, type FaunaTargetData } from './target-data';
import { applyBundle, bundleRefusal, markUsed, usedToday, type Bundle } from './use-effects';

export type ThingVerbRow = { id: string; label: string; short: string; needs?: Record<string, number>; oncePerDay?: boolean; effect: Bundle };

const NODE_VERBS = new Map((NODES.kinds as (NodeKind & { verbs?: ThingVerbRow[] })[]).map((k) => [k.id, k.verbs ?? []]));
type FaunaRow = { id: string; name: string; verbs?: ThingVerbRow[] };
export const FAUNA: readonly FaunaRow[] = (faunaJson as { fauna: FaunaRow[] }).fauna;
const FAUNA_VERBS = new Map(FAUNA.map((f) => [f.id, f.verbs ?? []]));

export const nodeVerbs = (kindId: string): readonly ThingVerbRow[] => NODE_VERBS.get(kindId) ?? [];
export const faunaVerbs = (kindId: string): readonly ThingVerbRow[] => FAUNA_VERBS.get(kindId) ?? [];

const verbOf = (actionId: string): string => actionId.slice(0, actionId.indexOf('@'));
const needsText = (needs: Record<string, number>): string => Object.entries(needs).map(([id, n]) => `${n} ${itemName(id).toLowerCase()}`).join(' and ');
const canPay = (state: SimState, needs?: Record<string, number>): boolean => Object.entries(needs ?? {}).every(([id, n]) => hasItem(state, id, n));

/** List a thing's own verbs: each needs its items, is not spent for today, and has charges when it costs them. */
function listRows(state: SimState, t: Target, prefix: string, rows: readonly ThingVerbRow[], onceKey: (v: ThingVerbRow) => string): ProvidedAction[] {
  const n = nodeData(t);
  const out: ProvidedAction[] = [];
  for (const v of rows) {
    if ((v.oncePerDay || prefix === 'fauna') && usedToday(state, onceKey(v))) continue;
    if (v.effect.charge && (!n || nodeCharges(state, n) < v.effect.charge)) continue;
    // A use that would do nothing right now (mend a whole seam) stays off the ring.
    if (v.needs && bundleRefusal(state, v.effect, { node: n, key: '' })) continue;
    out.push({ id: targetActionId(`${prefix}.${v.id}`, t), label: v.needs && !canPay(state, v.needs) ? `${v.label} (needs ${needsText(v.needs)})` : v.label, short: v.short, family: 'work' });
  }
  return out;
}

/** Act one of a thing's own verbs. False when the id is not theirs. */
function actRow(state: SimState, actionId: string, t: Target, prefix: string, rows: readonly ThingVerbRow[], onceKey: (v: ThingVerbRow) => string, juice: string): ActOutcome | false {
  const verb = verbOf(actionId);
  if (!verb.startsWith(`${prefix}.`)) return false;
  const v = rows.find((r) => r.id === verb.slice(prefix.length + 1));
  if (!v) return false;
  const once = v.oncePerDay || prefix === 'fauna';
  if (once && usedToday(state, onceKey(v))) return { ok: false, line: 'You have done that today.' };
  if (v.needs && !canPay(state, v.needs)) return { ok: false, line: `You need ${needsText(v.needs)} for that.` };
  const townId = townOfTarget(state, t);
  const ctx = { townId, node: nodeData(t), nearNodes: (t.data as FaunaTargetData | undefined)?.nearNodes, key: `${verb}@${t.kind}:${t.id}` };
  const refusal = bundleRefusal(state, v.effect, ctx);
  if (refusal) return { ok: false, line: refusal };
  for (const [id, n] of Object.entries(v.needs ?? {})) removeItem(state, id, n);
  const res = applyBundle(state, v.effect, ctx);
  if (once) markUsed(state, onceKey(v));
  pushJuice(state, juice, { verb: v.id, target: t.kind, id: t.id, townId, personId: res.residentId, line: res.line });
  return { ok: true, line: res.line || v.label };
}

registerTargetProvider({
  id: 'node-uses',
  kinds: ['node'],
  list(state, t) {
    const n = nodeData(t);
    return n ? listRows(state, t, 'node', nodeVerbs(n.kindId), (v) => `node.${v.id}@${n.id}`) : [];
  },
  act(state, actionId, t) {
    const n = nodeData(t);
    return n ? actRow(state, actionId, t, 'node', nodeVerbs(n.kindId), (v) => `node.${v.id}@${n.id}`, 'node.tended') : false;
  },
});

registerTargetProvider({
  id: 'fauna-uses',
  kinds: ['fauna'],
  list(state, t) {
    const k = faunaKindOf(t);
    return k ? listRows(state, t, 'fauna', faunaVerbs(k), (v) => `fauna.${v.id}@${t.id}`) : [];
  },
  act(state, actionId, t) {
    const k = faunaKindOf(t);
    return k ? actRow(state, actionId, t, 'fauna', faunaVerbs(k), (v) => `fauna.${v.id}@${t.id}`, 'fauna.handled') : false;
  },
});

/** The held item already offers this land act (stone → lay stones): don't list it twice. */
function heldCovers(t: Target, actId: string): boolean {
  const held = heldItemOf(t);
  return !!held && itemVerbs(held).some((v) => v.target === 'tile' && v.effect.do === 'land' && v.effect.act === actId);
}

registerTargetProvider({
  id: 'tile-land',
  kinds: ['tile'],
  list(_state, t) {
    const d = tileData(t);
    const act = d?.view ? landActOn(d.view, d.q, d.r) : null;
    if (!act || heldCovers(t, act.id)) return [];
    return [{ id: targetActionId(`land.${act.id}`, t), label: act.label, short: act.short ?? act.label, family: 'work' }];
  },
  act(state, actionId, t) {
    const verb = verbOf(actionId);
    if (!verb.startsWith('land.')) return false;
    const actId = verb.slice('land.'.length);
    const d = tileData(t);
    if (!LAND_RULES.acts.some((a) => a.id === actId)) return false;
    if (!d?.view) return { ok: false, line: 'Stand by the ground you mean to work.' };
    const r = workLand(state, d.view, actId, d.q, d.r, d.towns ?? []);
    return { ok: r.ok, line: r.line };
  },
});
