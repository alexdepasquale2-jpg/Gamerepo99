/**
 * Deed gates and per-deed extras beyond the catalog: once-per-person-per-day, a trust floor,
 * "holds something of theirs", authored reaction lines, and the goods side of asking a favor
 * (they lend you something) and returning what's theirs. Pure over SimState.
 */

import { deriveRng } from '../rng';
import type { CompatRuntime } from '../interaction';
import type { SimState } from '../types/runtime';
import { itemName } from '../goods/inventory';
import { lendCandidate, lendFrom, returnLine, returnTheirGoods, theirGoods } from '../goods/return-goods';
import { firstNameOf } from '../names';

export type DeedRow = {
  id: string;
  /** Full label (the chip's tip, and what dev.chips reports). */
  label: string;
  /** Chip text when `label` is longer than a ring chip holds (≤16 chars). */
  short?: string;
  /** Ring family (deeds.json families); else the family whose choice set lists this interaction. */
  family?: string;
  hostMethod: string;
  requiresPendingPromise?: boolean;
  requiresOtherPerson?: boolean;
  savage?: boolean;
  /** Offered once per person per day (resets when the day number moves on). */
  oncePerDay?: boolean;
  /** Hidden until they trust you at least this much (0..1). */
  minTrust?: number;
  /** Offered only while you hold something of theirs (a loan or their cargo). */
  requiresTheirGoods?: boolean;
  /** favor_ask: they lend you one of their work goods carrying one of these item tags. */
  lend?: { itemTagsAny: string[] };
  /** Reaction templates ({name}); replace the host method's line. */
  lines?: string[];
  /** Said when the interaction's assertFailIfMarksAny trips. */
  failLine?: string;
};

const usedKey = (deedId: string, personId: string): string => `${deedId}@${personId}`;
const usedMap = (state: SimState): Record<string, number> => (state.flags.deedUsedDay ??= {}) as Record<string, number>;

export function deedUsedToday(state: SimState, deedId: string, personId: string): boolean {
  return (state.flags?.deedUsedDay as Record<string, number> | undefined)?.[usedKey(deedId, personId)] === state.day;
}

function trustOf(state: SimState, personId: string, rt?: CompatRuntime): number | undefined {
  const t = state.people[personId]?.trust;
  return typeof t === 'number' ? t : rt?.people.get(personId)?.trust;
}

/** The newer gates (the older promise/other-person gates live beside DEEDS). */
export function deedVerbAllowed(state: SimState, d: DeedRow, personId: string, rt?: CompatRuntime): boolean {
  if (d.oncePerDay && deedUsedToday(state, d.id, personId)) return false;
  if (d.minTrust !== undefined && (trustOf(state, personId, rt) ?? 0) < d.minTrust) return false;
  if (d.requiresTheirGoods && !theirGoods(state, personId)) return false;
  return true;
}

function nameOf(state: SimState, personId: string): string {
  const n = state.people[personId]?.name ?? personId.replace(/_/g, ' ');
  const w = firstNameOf(n) ?? n;
  return w ? w[0]!.toUpperCase() + w.slice(1) : n;
}

const fill = (t: string, name: string): string => t.replace(/\{name\}/g, name);

export type DeedPlan = { line?: string; failLine?: string; after: () => void };

/**
 * Before resolving a deed: pick its authored line (naming what changes hands) and the goods step
 * to run only once the interaction resolves. Lines are seeded by seed/day/person, never rng.
 */
export function planDeed(state: SimState, d: DeedRow, personId: string): DeedPlan {
  const name = nameOf(state, personId);
  const pick = d.lines?.length ? d.lines[deriveRng(state.seed, 'deed-line', d.id, personId, state.day).int(0, d.lines.length)]! : undefined;
  let line = pick ? fill(pick, name) : undefined;
  let goods: (() => void) | undefined;
  if (d.requiresTheirGoods) {
    const g = theirGoods(state, personId);
    if (g) {
      line = returnLine(state, personId, g, name);
      goods = () => void returnTheirGoods(state, personId);
    }
  }
  if (d.lend) {
    const itemId = lendCandidate(state, personId, d.lend.itemTagsAny);
    if (itemId) {
      line = `${line ?? `${name} helps.`} (Lends you ${itemName(itemId)}.)`;
      goods = () => lendFrom(state, personId, itemId);
    }
  }
  return {
    line,
    failLine: d.failLine ? fill(d.failLine, name) : undefined,
    after: () => goods?.(),
  };
}

/** After an attempt (resolved or refused): spend today's once-per-day use. */
export function noteDeedUsed(state: SimState, d: DeedRow, personId: string): void {
  if (d.oncePerDay) usedMap(state)[usedKey(d.id, personId)] = state.day;
}
