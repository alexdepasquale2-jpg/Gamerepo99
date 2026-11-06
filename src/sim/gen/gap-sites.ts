/** Seeded gap-axis settlement sites from settlementSizes. Pure; no dyn/. */

import type { Rng } from '../rng';
import type { SettlementSize } from './load-history';
import type { GapSite } from './world-types';

function sizeForGap(gap01: number, sizes: SettlementSize[]): SettlementSize {
  const ordered = [...sizes].sort((a, b) => a.gapAxisMax - b.gapAxisMax);
  if (ordered.length === 0) {
    return { id: 'settlement', gapAxisMax: 1 };
  }
  for (const s of ordered) {
    if (gap01 <= s.gapAxisMax) return s;
  }
  return ordered[ordered.length - 1]!;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * ≥3 sites spanning the gap axis. Positions and count vary by seed —
 * never the fixed {0, 0.5, 1} scaffold. Poles stay at the extremes for gapSpread.
 */
export function generateGapSites(rng: Rng, sizes: SettlementSize[]): GapSite[] {
  const count = Math.max(3, rng.int(3, 6)); // 3..5
  const gaps: number[] = [];

  // Poles with jitter inside Probe-friendly extremes (min≤0.05, max≥0.95).
  gaps.push(clamp01(rng.next() * 0.05));
  gaps.push(clamp01(0.95 + rng.next() * 0.05));

  while (gaps.length < count) {
    // Mid sites away from the old exact-0.5 scaffold.
    const mid = clamp01(0.12 + rng.next() * 0.76);
    gaps.push(mid);
  }

  return gaps.map((gap01, index) => {
    const size = sizeForGap(gap01, sizes);
    const rounded = Math.round(gap01 * 1000) / 1000;
    return {
      id: `${size.id}_${index}_${Math.round(rounded * 1000)}`,
      gap01: rounded,
    };
  });
}
