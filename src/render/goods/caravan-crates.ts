/** Where the crates of a halted caravan are along their short hop between wagon and stall (pure, no Phaser). */
import type { CaravanMobile } from '../../sim/caravans-types';
import { PHASE_DAYS } from '../../sim/caravan-visit';

export const MAX_CRATES = 6;
export type CrateStep = { t: number; towardTown: boolean };

/** One entry per crate in flight (0 < t < 1). Unloading carries crates to the town; trading carries bought ones aboard. */
export function caravanCrates(m: CaravanMobile): CrateStep[] {
  const v = m.visit;
  if (!v || (m.phase !== 'unloading' && m.phase !== 'trading')) return [];
  const unloading = m.phase === 'unloading';
  const count = Math.min(MAX_CRATES, unloading ? v.total : (v.bought?.qty ?? 0));
  if (count < 1) return [];
  const span = unloading ? PHASE_DAYS.unloading : PHASE_DAYS.trading;
  const frac = Math.min(1, Math.max(0, 1 - (m.phaseLeft ?? 0) / span));
  const out: CrateStep[] = [];
  for (let i = 0; i < count; i++) {
    const t = frac * count - i;
    if (t > 0 && t < 1) out.push({ t, towardTown: unloading });
  }
  return out;
}

/** Wagon faces the road ahead; while turning around it swings to face back the way it came. */
export function turnFraction(m: CaravanMobile): number {
  if (m.phase !== 'departing' || m.heading !== 'outbound') return 0;
  return Math.min(1, Math.max(0, 1 - (m.phaseLeft ?? 0) / PHASE_DAYS.departing));
}
