/**
 * Lingering: resting is something you do with your body, not a ring verb. Stand still by a prop with a
 * `linger` tag (data/world/props.json: shade, seat, fire, shelter, holy) and the scene sits you down
 * (world/linger.ts); every second sat there counts here, and spark trickles in at the tag's rate under the
 * same daily cap the old rest verbs shared (contrib/thing-verbs PROP_SPARK_PER_DAY), so the wild slows the
 * fall but never replaces deeds. Where you sat longest is told at dawn by a neighbour.
 *
 * State: `flags.linger` = { day, carry, secs: { <type>: seconds } }, created lazily, reset by day.
 * Pure and deterministic: lines are seeded from seed/day/key (grammar fallbacks), never Math.random.
 */
import propsJson from '../data/world/props.json';
import { registerDawnLines } from './dawn-lines';
import { asClause, fallbackLine } from './fallback-lines';
import { notePropSpark, propRow, propSparkLeft } from './contrib/thing-verbs';
import { firstName, residentOf } from './contrib/use-effects';
import { pushJuice } from './packets';
import { noteUse } from './data-use-world';
import type { SimState } from './types/runtime';

export type LingerTag = 'shade' | 'seat' | 'fire' | 'shelter' | 'holy';
export type LingerTagRow = { secsPerSpark: number; pose: 'sit' | 'stand'; where: string };
export const LINGER_TAGS = (propsJson as unknown as { lingerTags: Record<LingerTag, LingerTagRow> }).lingerTags;

type LingerFlag = { day: number; carry: number; secs: Record<string, number> };
export type LingerResult = { gain: number; tag: LingerTag | null; type: string | null; capped: boolean };

/** The prop type of a key: `prop:tree@3,4`, `tree@3,4` or a bare `tree`. */
export function lingerTypeOf(propKey: string): string {
  const k = propKey.startsWith('prop:') ? propKey.slice(5) : propKey;
  return k.split('@')[0] ?? '';
}

/** The linger tag of a prop type (null when you cannot rest there). */
export function lingerTagOf(type: string): LingerTag | null {
  const t = propRow(type)?.linger as LingerTag | undefined;
  return t && LINGER_TAGS[t] ? t : null;
}

/** Prop types carrying a tag (the dev hook and tests pick one). */
export const lingerTypesOf = (tag: LingerTag): string[] =>
  (propsJson as { props: { type: string; linger?: string }[] }).props.filter((p) => p.linger === tag).map((p) => p.type);

const today = (state: SimState): LingerFlag => {
  const f = state.flags.linger as LingerFlag | undefined;
  if (f && f.day === state.day) return f;
  // A new day starts clean; the dawn has already read yesterday's seconds by the time you next sit.
  const next: LingerFlag = { day: state.day, carry: 0, secs: {} };
  state.flags.linger = next;
  return next;
};

/** True when sitting longer would give nothing more today (cap spent, or spark full). */
export function lingerSpent(state: SimState): boolean {
  return propSparkLeft(state) <= 0 || state.player.spark >= (state.player.sparkMax ?? 100);
}

/**
 * Count `seconds` sat by the prop. Spark comes in whole points as the seconds add up (the remainder
 * carries over), clipped by what is left of today's prop cap and by sparkMax. Unknown or untagged → 0.
 */
export function lingerAt(state: SimState, propKey: string, seconds: number): LingerResult {
  const type = lingerTypeOf(propKey);
  const tag = lingerTagOf(type);
  if (!tag || !(seconds > 0)) return { gain: 0, tag, type: tag ? type : null, capped: false };
  const f = today(state);
  f.secs[type] = (f.secs[type] ?? 0) + seconds;
  if (lingerSpent(state)) {
    f.carry = 0;
    return { gain: 0, tag, type, capped: true };
  }
  f.carry += seconds / LINGER_TAGS[tag].secsPerSpark;
  const whole = Math.floor(f.carry);
  if (whole <= 0) return { gain: 0, tag, type, capped: false };
  f.carry -= whole;
  const cap = state.player.sparkMax ?? 100;
  const gain = Math.max(0, Math.min(whole, propSparkLeft(state), cap - state.player.spark));
  if (gain > 0) {
    state.player.spark += gain;
    notePropSpark(state, gain);
    noteUse('props.linger', tag);
    pushJuice(state, 'prop.lingered', { type, tag, gain, id: propKey });
  }
  return { gain, tag, type, capped: lingerSpent(state) };
}

/**
 * A small flavour line for sitting (or, with `spent`, for having sat all the wild gives today), from the
 * `linger.<tag>` / `linger.spent` grammars. `salt` varies it within a day (the prop key, a count).
 */
export function lingerLine(state: SimState, tag: LingerTag, salt: string, spent = false): string {
  return fallbackLine(spent ? 'linger.spent' : `linger.${tag}`, `${state.seed}|${state.day}|linger|${salt}`, {}, [tag]);
}

/** At dawn: a neighbour mentions where you sat longest yesterday (a minute or more), through a person. */
export function lingerDawnLines(state: SimState): string[] {
  const f = state.flags.linger as LingerFlag | undefined;
  const src = f && f.day === state.day - 1 ? f.secs : undefined;
  if (!src) return [];
  const [type, secs] = Object.entries(src).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];
  const tag = type ? lingerTagOf(type) : null;
  if (!type || !tag || (secs ?? 0) < 60) return [];
  const who = residentOf(state, state.player.townId, `linger:${type}`);
  if (!who) return [];
  const said = fallbackLine('linger.dawn', `${state.seed}|${state.day}|linger-dawn`, { where: LINGER_TAGS[tag].where }, [tag]);
  return said ? [`${firstName(state, who)} says ${asClause(said)}`] : [];
}

registerDawnLines('linger', lingerDawnLines);
