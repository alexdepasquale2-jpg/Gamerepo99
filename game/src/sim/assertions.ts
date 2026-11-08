/**
 * Integrity rules (data/systems/assertions/rules.json): things the world must never do (a grieving person
 * chirping, the dead speaking, a creed gaining followers the day it was exposed, history told out of
 * order). `violations(fixture)` names every rule a moment breaks. The rule cases in assertions/cases-*.json
 * are its fixtures (game/tests/assertions.test.ts); history order is checked against the authored
 * beats' preconditions (data/world/history). Pure.
 */
import rulesJson from '../data/systems/assertions/rules.json';

type Forbid = {
  wound?: string;
  moodTagsAny?: string[];
  afterEvent?: string;
  statRise?: string;
  personFlagsAny?: string[];
  action?: string;
  lineTagsAny?: string[];
  memoryIncludesAny?: string[];
  vectorOutOfBounds?: boolean;
  personTagsAny?: string[];
  withinDays?: number;
  trustAbove?: number;
  historyOutOfOrder?: boolean;
};
export type AssertionRule = { id: string; forbid: Forbid };
export const RULES: readonly AssertionRule[] = (rulesJson as { rules: AssertionRule[] }).rules;

type EventRef = string | { id: string; day?: number };
export type AssertionFixture = {
  person?: { woundId?: string; alive?: boolean; flags?: string[]; tags?: string[] };
  lineTags?: string[];
  action?: string;
  events?: EventRef[];
  stats?: Record<string, { before: number; after: number }>;
  memory?: string[];
  vector?: Record<string, number>;
  day?: number;
  trust?: number;
  historyApplied?: string[];
  historyTags?: string[];
};

/** Beat id -> the history tags it needs already present (its preconditions). */
export type BeatPreconditions = (beatId: string) => string[] | undefined;

const any = (want: readonly string[] | undefined, have: readonly string[] | undefined): boolean => !!want?.some((t) => have?.includes(t));
const eventId = (e: EventRef): string => (typeof e === 'string' ? e : e.id);
const hasEvent = (f: AssertionFixture, id: string): boolean => (f.events ?? []).some((e) => eventId(e) === id);

/** Played in order, each beat's preconditions must already be among the tags the earlier beats left. */
function historyOutOfOrder(f: AssertionFixture, pre: BeatPreconditions): boolean {
  const have = new Set<string>();
  const leaves = new Map<string, string>((f.historyApplied ?? []).map((id, i) => [id, f.historyTags?.[i] ?? '']));
  for (const id of f.historyApplied ?? []) {
    if ((pre(id) ?? []).some((t) => !have.has(t))) return true;
    const tag = leaves.get(id);
    if (tag) have.add(tag);
  }
  return false;
}

function breaks(r: Forbid, f: AssertionFixture, pre: BeatPreconditions): boolean {
  if (r.historyOutOfOrder) return historyOutOfOrder(f, pre);
  if (r.vectorOutOfBounds) return Object.values(f.vector ?? {}).some((v) => v < 0 || v > 1);
  if (r.wound && f.person?.woundId !== r.wound) return false;
  if (r.moodTagsAny && !any(r.moodTagsAny, f.lineTags)) return false;
  if (r.personFlagsAny && !any(r.personFlagsAny, f.person?.flags)) return false;
  if (r.personTagsAny && !any(r.personTagsAny, f.person?.tags)) return false;
  if (r.action && !(f.action ?? '').split('_or_').some((a) => r.action!.split('_or_').includes(a))) return false;
  if (r.memoryIncludesAny && !any(r.memoryIncludesAny, f.memory)) return false;
  if (r.lineTagsAny && !any(r.lineTagsAny, f.lineTags)) return false;
  if (r.afterEvent) {
    const ev = (f.events ?? []).find((e) => eventId(e) === r.afterEvent);
    if (!ev || !hasEvent(f, r.afterEvent)) return false;
    if (r.withinDays !== undefined) {
      const at = typeof ev === 'string' ? f.day : ev.day;
      if (at === undefined || f.day === undefined || f.day - at > r.withinDays) return false;
    }
  }
  if (r.statRise) {
    const s = f.stats?.[r.statRise];
    if (!s || !(s.after > s.before)) return false;
  }
  if (r.trustAbove !== undefined && !((f.trust ?? 0) > r.trustAbove)) return false;
  return true;
}

/** Every rule this moment breaks (empty when it keeps faith with the world). */
export function violations(f: AssertionFixture, pre: BeatPreconditions = () => [], rules: readonly AssertionRule[] = RULES): string[] {
  return rules.filter((r) => breaks(r.forbid, f, pre)).map((r) => r.id);
}
