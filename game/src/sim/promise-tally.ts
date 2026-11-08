/**
 * Promises kept and broken: each dawn, every live compact's promises are judged against what its ledger
 * says it delivered (real delivery, not belief). The last WINDOW dawns are kept per compact, so the Power
 * page can post the count and townsfolk can quote it. Also holds what each town last said of its leader,
 * so legitimacy voices only speak up when the mood shifts. Pure + deterministic.
 */
import { ensureDoctrines } from './doctrine-tick';
import type { SimState } from './types/runtime';

/** 'k' kept, 'b' broken, '.' neither (half-kept), oldest first. */
export type PromiseMarks = string;
export type LegitimacyVoices = {
  /** doctrine id -> last WINDOW dawns of promise marks. */
  promises: Record<string, PromiseMarks>;
  /** town id -> the band townsfolk last spoke of, and when. */
  heard: Record<string, { band: string; day: number }>;
  /** town id -> the last day a daytime remark was made about the leader. */
  remarked?: Record<string, number>;
};

export const WINDOW = 14;
/** Real delivery at or above KEPT counts as a promise kept; below BROKEN as one broken. */
export const KEPT = 0.45;
export const BROKEN = 0.3;

export function ensureLegitimacyVoices(state: SimState): LegitimacyVoices {
  return (state.legitimacyVoices ??= { promises: {}, heard: {} });
}

export const markFor = (realDelivery: number): 'k' | 'b' | '.' => (realDelivery >= KEPT ? 'k' : realDelivery < BROKEN ? 'b' : '.');

/** One dawn of judging: a mark per live compact. */
export function tickPromiseTally(state: SimState): void {
  const lv = ensureLegitimacyVoices(state);
  for (const d of Object.values(ensureDoctrines(state)).sort((a, b) => a.id.localeCompare(b.id))) {
    if (d.collapsed) continue;
    lv.promises[d.id] = ((lv.promises[d.id] ?? '') + markFor(d.realDelivery)).slice(-WINDOW);
  }
}

export function promiseCounts(state: SimState, doctrineId: string): { kept: number; broken: number; days: number; lately?: 'k' | 'b' } {
  const marks = state.legitimacyVoices?.promises[doctrineId] ?? '';
  const kept = [...marks].filter((m) => m === 'k').length;
  const broken = [...marks].filter((m) => m === 'b').length;
  const last3 = marks.slice(-3);
  const lately = last3.length === 3 && /^k+$/.test(last3) ? 'k' : last3.length === 3 && /^b+$/.test(last3) ? 'b' : undefined;
  return { kept, broken, days: marks.length, ...(lately ? { lately } : {}) };
}

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * The Power page note: how often the compact's promises were kept or broken lately, by its own ledger,
 * set against what people believe. Empty until a dawn has been judged.
 */
export function promiseNote(state: SimState, doctrineId: string, ledger = 'the tally-book', perceived?: number): string[] {
  const c = promiseCounts(state, doctrineId);
  if (!c.days) return ['• Promises kept and broken: none counted yet. Ask again after a dawn or two.'];
  const out = [`• Promises kept and broken, by ${ledger}: kept on ${plural(c.kept, 'day')} of the last ${c.days}, broken on ${c.broken}.`];
  if (c.lately === 'k') out.push('• Kept three dawns running, and people have noticed.');
  else if (c.lately === 'b') out.push('• Broken three dawns running. The grumbling is louder for it.');
  const share = c.kept / c.days;
  if (perceived !== undefined && perceived - share > 0.3) out.push('• Folk remember them kept far more often than that.');
  else if (perceived !== undefined && share - perceived > 0.3) out.push('• Folk give it less credit than the count does.');
  return out;
}
