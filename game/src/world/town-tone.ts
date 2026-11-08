/**
 * Each town's tone for the light FX: despair eased toward the sim's value (session.townDespair()), a
 * warm push for towns that burn bright, and a short warm pulse when someone there reignites.
 */
import type { PlaySession } from '../sim/play-session/play-session-types';
import type { TownTone } from './light-fx';
import type { Pt } from './depth';

/** Seconds for a town's palette to move all the way from bright to grey (and back). */
const EASE_S = 1.6;
const PULSE_S = 2.2;
const REIGNITE = new Set(['person.reignite', 'site.kindle', 'moment.beat']);

export type TownToneDriver = {
  update(dt: number): void;
  tones(): TownTone[];
  /** Eased despair per town (dev). */
  despair(): Record<string, number>;
  /** Snap to the sim's values (after a load). */
  snap(): void;
  /** A town warms briefly (reignite). */
  pulse(townId: string): void;
  destroy(): void;
};

export function createTownTone(session: PlaySession, centres: Map<string, Pt>, playerTown: () => string | undefined): TownToneDriver {
  const shown = new Map<string, number>();
  const pulses = new Map<string, number>();
  let target: Record<string, number> = {};
  let since = 1;
  const read = () => { target = session.townDespair() ?? {}; };
  const snap = () => { read(); for (const id of centres.keys()) shown.set(id, target[id] ?? 0); };
  snap();
  const off = session.onJuice((id, payload) => {
    if (!REIGNITE.has(id)) return;
    const pid = (payload as { personId?: string } | undefined)?.personId;
    const town = (pid && session.getState()?.people[pid]?.townId) || playerTown();
    if (town) pulses.set(town, 1);
  });
  return {
    update(dt) {
      since += dt;
      if (since > 0.5) { since = 0; read(); }
      const step = dt / EASE_S;
      for (const id of centres.keys()) {
        const cur = shown.get(id) ?? 0, want = target[id] ?? 0;
        shown.set(id, cur < want ? Math.min(want, cur + step) : Math.max(want, cur - step));
      }
      for (const [id, p] of pulses) { const n = p - dt / PULSE_S; if (n <= 0) pulses.delete(id); else pulses.set(id, n); }
    },
    tones() {
      const out: TownTone[] = [];
      for (const [id, c] of centres) {
        const d = shown.get(id) ?? 0;
        const warm = Math.max(0, Math.min(1, (0.25 - d) / 0.25)) * 0.3 + (pulses.get(id) ?? 0) * 0.7;
        out.push({ x: c.x, y: c.y, despair: d, warm: Math.min(1, warm) });
      }
      return out;
    },
    despair: () => Object.fromEntries(shown),
    snap,
    pulse: (townId) => void pulses.set(townId, 1),
    destroy: off,
  };
}
