/**
 * The second (and third) use of things in the world, beside Gather:
 *   node   each resource kind's verbs in data/world/resource-nodes.json (plant a sapling, dig for clay,
 *          share the fishing spot, return a stray sheep, shore up the seam …)  → `node.<verb>@node:<id>`
 *   fauna  each animal's verbs in data/world/fauna.json (shoo, drive off, scare, watch, drive home …),
 *          once per animal per verb per day                                       → `fauna.<verb>@fauna:<id>`
 *   prop   each wild prop type's verbs in data/world/props.json (trees, rocks, camps, ruins, shrines …),
 *          once per prop type per verb per day                                     → `prop.<verb>@prop:<id>`
 *          plus, on a prop of a named spot (data/world/spots.json), its story once per spot per day
 *                                                                                  → `prop.story@prop:<id>`
 * Effects are bundles (contrib/use-effects). Pure: no Phaser/DOM.
 */
import faunaJson from '../../data/world/fauna.json';
import propsJson from '../../data/world/props.json';
import { CHRONICLE_TAG } from '../chronicle';
import { hasItem, itemName, removeItem } from '../goods/inventory';
import { gistOf } from '../history-voice';
import { isNamedSpot, spotStory, spotVerb, type SpotTag } from '../map/ladder/spot-lore';
import { deriveRng } from '../rng';
import { NODES, nodeCharges, type NodeKind } from '../goods/nodes';
import { pushJuice } from '../packets';
import { registerTargetProvider, type ActOutcome, type ProvidedAction } from '../play-session/action-providers';
import { targetActionId, type Target } from '../play-session/targets';
import type { SimState } from '../types/runtime';
import { faunaKindOf, nodeData, townOfTarget, type FaunaTargetData } from './target-data';
import { applyBundle, bundleRefusal, markUsed, usedToday, type Bundle } from './use-effects';

export type ThingVerbRow = { id: string; label: string; short: string; needs?: Record<string, number>; oncePerDay?: boolean; effect: Bundle };

const NODE_VERBS = new Map((NODES.kinds as (NodeKind & { verbs?: ThingVerbRow[] })[]).map((k) => [k.id, k.verbs ?? []]));
type FaunaRow = { id: string; name: string; verbs?: ThingVerbRow[] };
export const FAUNA: readonly FaunaRow[] = (faunaJson as { fauna: FaunaRow[] }).fauna;
const FAUNA_VERBS = new Map(FAUNA.map((f) => [f.id, f.verbs ?? []]));

/**
 * linger: the prop's linger tag (sim/linger.ts); resting is standing still there, not a verb.
 * scenery: drawn for the look of the place and used for nothing (uses-check lets it be).
 */
type PropRow = { type: string; name: string; linger?: string; scenery?: boolean; verbs: ThingVerbRow[] };
export const PROPS: readonly PropRow[] = (propsJson as { props: PropRow[] }).props;
const PROP_BY_TYPE = new Map(PROPS.map((p) => [p.type, p]));
/** A wild prop's row (null for a type with no uses, like a critter, which acts as its animal). */
export const propRow = (type: string): PropRow | null => PROP_BY_TYPE.get(type) ?? null;

export const nodeVerbs = (kindId: string): readonly ThingVerbRow[] => NODE_VERBS.get(kindId) ?? [];
export const faunaVerbs = (kindId: string): readonly ThingVerbRow[] => FAUNA_VERBS.get(kindId) ?? [];

/**
 * Spark the wild can give in one day across every prop and all lingering (rest is a balm, not a fuel line).
 * Was 12. With the dawn now costing about 3 a day net (hooks/spark-recovery.json), 12 (and 4, when tried) let a
 * walker who only sat under trees stay full forever; at 2 the wild slows the fall (an idle walker burns out
 * in ~60-90 days instead of ~25) but cannot replace real deeds. See game/scripts/balance-probe.mts.
 */
export const PROP_SPARK_PER_DAY = 2;
/** What is left of today's prop spark; lingering (sim/linger.ts) draws on the same cap. */
export const propSparkLeft = (state: SimState): number => {
  const k = state.flags.propSpark as { day: number; got: number } | undefined;
  return PROP_SPARK_PER_DAY - (k && k.day === state.day ? k.got : 0);
};
export const notePropSpark = (state: SimState, n: number): void => {
  const k = state.flags.propSpark as { day: number; got: number } | undefined;
  state.flags.propSpark = { day: state.day, got: (k && k.day === state.day ? k.got : 0) + n };
};
const onlySpark = (b: Bundle): boolean => !!b.spark && !b.gain && !b.town && !b.thanks && !b.despair && !b.regrow && !b.tend;

const verbOf = (actionId: string): string => actionId.slice(0, actionId.indexOf('@'));
const needsText = (needs: Record<string, number>): string => Object.entries(needs).map(([id, n]) => `${n} ${itemName(id).toLowerCase()}`).join(' and ');
const canPay = (state: SimState, needs?: Record<string, number>): boolean => Object.entries(needs ?? {}).every(([id, n]) => hasItem(state, id, n));

/** List a thing's own verbs: each needs its items, is not spent for today, and has charges when it costs them. */
function listRows(state: SimState, t: Target, prefix: string, rows: readonly ThingVerbRow[], onceKey: (v: ThingVerbRow) => string): ProvidedAction[] {
  const n = nodeData(t);
  const out: ProvidedAction[] = [];
  for (const v of rows) {
    if ((v.oncePerDay || prefix === 'fauna' || prefix === 'prop') && usedToday(state, onceKey(v))) continue;
    if (v.effect.charge && (!n || nodeCharges(state, n) < v.effect.charge)) continue;
    if (prefix === 'prop' && onlySpark(v.effect) && propSparkLeft(state) <= 0) continue;
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
  const once = v.oncePerDay || prefix === 'fauna' || prefix === 'prop';
  if (once && usedToday(state, onceKey(v))) return { ok: false, line: 'You have done that today.' };
  if (v.needs && !canPay(state, v.needs)) return { ok: false, line: `You need ${needsText(v.needs)} for that.` };
  const townId = townOfTarget(state, t);
  const ctx = { townId, node: nodeData(t), nearNodes: (t.data as FaunaTargetData | undefined)?.nearNodes, key: `${verb}@${t.kind}:${t.id}` };
  const refusal = bundleRefusal(state, v.effect, ctx);
  if (refusal) return { ok: false, line: refusal };
  // Props share one day's worth of spark; past it a pure rest does nothing, a mixed use keeps its other parts.
  let effect = v.effect;
  if (prefix === 'prop' && effect.spark) {
    const left = Math.max(0, propSparkLeft(state));
    if (left <= 0 && onlySpark(effect)) return { ok: false, line: 'You have rested all you can out here today. The road is waiting.' };
    effect = { ...effect, spark: Math.min(effect.spark, left) || undefined };
  }
  for (const [id, n] of Object.entries(v.needs ?? {})) removeItem(state, id, n);
  const sparkBefore = state.player.spark;
  const res = applyBundle(state, effect, ctx);
  if (prefix === 'prop' && state.player.spark > sparkBefore) notePropSpark(state, state.player.spark - sparkBefore);
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

/** The prop type of a `prop:<type>@<q>,<r>` target: data.type, else the id's head. */
export function propTypeOf(t: Target): string | undefined {
  if (t.kind !== 'prop') return undefined;
  const d = t.data && typeof t.data === 'object' ? (t.data as { type?: unknown }).type : undefined;
  return typeof d === 'string' && d ? d : t.id.split('@')[0] || undefined;
}

/** The named spot a prop stands in (data.spot from the scene: its id and type; the sim re-derives the rest). */
export function propSpotOf(t: Target): SpotTag | undefined {
  if (t.kind !== 'prop' || !t.data || typeof t.data !== 'object') return undefined;
  const s = (t.data as { spot?: { id?: unknown; type?: unknown } }).spot;
  return s && typeof s.id === 'string' && typeof s.type === 'string' && isNamedSpot(s.type) ? { id: s.id, type: s.type } : undefined;
}

/** Once a day per spot (not per prop), however many of its stones you stand beside. */
export const spotStoryKey = (s: SpotTag): string => `prop.story@${s.id}`;

/**
 * A spot's story: tied to a beat of the world's generated past (seeded per spot, so a place keeps its
 * story), else a plain one. Chronicle beats are left out: they grow in play and would shift the pick.
 */
export function spotStoryLine(state: SimState, s: SpotTag): string | null {
  const beats = (state.history ?? []).filter((h) => !h.tags?.includes(CHRONICLE_TAG)).map((h) => gistOf(h)).filter((g) => g !== 'the old days').sort();
  const gist = beats.length ? beats[deriveRng(state.seed, 'spot-story', s.id).int(0, beats.length)] : undefined;
  return spotStory(state.seed, s.id, s.type, gist);
}

registerTargetProvider({
  id: 'prop-uses',
  kinds: ['prop'],
  list(state, t) {
    const row = propRow(propTypeOf(t) ?? '');
    const out = row ? listRows(state, t, 'prop', row.verbs, (v) => `prop.${v.id}@${row.type}`) : [];
    const spot = propSpotOf(t);
    if (spot && !usedToday(state, spotStoryKey(spot))) out.push({ id: targetActionId('prop.story', t), ...spotVerb(spot.type), family: 'work' });
    return out;
  },
  act(state, actionId, t) {
    const spot = propSpotOf(t);
    if (spot && verbOf(actionId) === 'prop.story') {
      if (usedToday(state, spotStoryKey(spot))) return { ok: false, line: 'You know this place\'s story already. It will keep till tomorrow.' };
      const line = spotStoryLine(state, spot);
      if (!line) return false;
      markUsed(state, spotStoryKey(spot));
      pushJuice(state, 'prop.used', { verb: 'story', target: t.kind, id: t.id, line });
      return { ok: true, line };
    }
    const row = propRow(propTypeOf(t) ?? '');
    return row ? actRow(state, actionId, t, 'prop', row.verbs, (v) => `prop.${v.id}@${row.type}`, 'prop.used') : false;
  },
});
