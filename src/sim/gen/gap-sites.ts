/** Seeded gap-axis settlement sites with shape gapBias. Pure; no dyn/. */

import type { Rng } from '../rng';
import type { GapBias } from './load-world-tables';
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
 * ≥3 sites spanning the gap axis. gapBias picks a target mean; mids fill toward it
 * while poles stay at Probe-friendly extremes (min≤0.05, max≥0.95).
 */
export function generateGapSites(
  rng: Rng,
  sizes: SettlementSize[],
  gapBias?: GapBias,
): GapSite[] {
  const tiltHigh = rng.next() < 0.5;
  let meanTarget: number;
  switch (gapBias) {
    case 'low':
      meanTarget = 0.24 + rng.next() * 0.05;
      break;
    case 'high':
      meanTarget = 0.74 + rng.next() * 0.05;
      break;
    case 'bimodal':
      // Asymmetric shoulders across seeds → gap-mean variance band.
      meanTarget = tiltHigh ? 0.72 + rng.next() * 0.06 : 0.24 + rng.next() * 0.05;
      break;
    case 'mid':
    default:
      meanTarget = 0.47 + rng.next() * 0.06;
      break;
  }

  const count =
    gapBias === 'mid' || gapBias === undefined
      ? Math.max(3, rng.int(3, 5))
      : 6; // fixed: enough mids to pull mean off the pole average

  const lo = clamp01(rng.next() * 0.05);
  const hi = clamp01(0.95 + rng.next() * 0.05);
  const gaps: number[] = [lo, hi];

  if (gapBias === 'bimodal') {
    // Spec shoulders, skewed by tilt so one side dominates the mean.
    const j = rng.next() * 0.05 - 0.025;
    if (tiltHigh) {
      gaps.push(clamp01(0.38 + j)); // weak low shoulder
      gaps.push(clamp01(0.82 + j)); // strong high shoulder
    } else {
      gaps.push(clamp01(0.18 + j));
      gaps.push(clamp01(0.62 + j));
    }
  }

  while (gaps.length < count) {
    const need = count - gaps.length;
    const sum = gaps.reduce((a, b) => a + b, 0);
    const ideal = (meanTarget * count - sum) / need;
    const jitter = rng.next() * 0.06 - 0.03;
    let mid = clamp01(ideal + jitter);
    if (mid < 0.06) mid = 0.06 + rng.next() * 0.06;
    if (mid > 0.94) mid = 0.88 + rng.next() * 0.06;
    gaps.push(clamp01(mid));
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
