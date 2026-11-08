/**
 * Ripples (data/systems/ripples.json help / harm / cling; data/systems/interactions/rules.json ripples):
 * what one act does to the people around the one it touched. After an act resolves, when the person now
 * burns at least minFlameToRipple:
 *   help   a helping act on someone growing for real (genuine_growth, no dependence) warms up to
 *          kinNeighborsMax of their kin by flameMin..flameMax;
 *   harm   a harming act on someone hollowed or resentful chills their kin by flameMin..flameMax
 *          (no flame floor: a hurt spreads from anyone);
 *   cling  someone leaning on you (dependence) can bleed your spark on any act (chance, sparkDrain).
 * Each ripple is told by the kin it reached (juice ripple.help / ripple.harm / ripple.cling, voiced in
 * voice/reaction-lines from surface-fallbacks ripple_* keys). The crossTown block lives in sim/packets.
 * Deterministic: one deriveRng stream per seed/day/act/person.
 */
import rulesJson from '../data/systems/interactions/rules.json';
import { noteUse } from './data-use-people';
import type { DataTables } from './load-data';
import { pushJuice } from './packets';
import { deriveRng } from './rng';
import type { SimState } from './types/runtime';

type Band = { flameMin: number; flameMax: number; requireMarksAny?: string[]; forbidMarksAny?: string[] };
type RipplesCfg = { minFlameToRipple?: number; help?: Band; harm?: Band; cling?: { requireMarksAny?: string[]; chance: number; sparkDrain: number } };

const KIN_MAX = (rulesJson as { ripples?: { help?: { kinNeighborsMax?: number } } }).ripples?.help?.kinNeighborsMax ?? 2;

const hasAny = (marks: Record<string, number>, ids: readonly string[] | undefined): boolean => !!ids?.some((m) => (marks[m] ?? 0) > 0);

/** Living kin of a person: kin edges either way, then household partners and grown children; sorted, deduped. */
export function kinOf(state: SimState, personId: string): string[] {
  const out = new Set<string>();
  for (const e of state.kinEdges ?? []) {
    if (e.kind === 'introduced') continue;
    if (e.from === personId) out.add(e.to);
    else if (e.to === personId) out.add(e.from);
  }
  for (const h of state.kin?.households ?? []) {
    if (!h.adults.includes(personId)) continue;
    for (const a of h.adults) out.add(a);
    for (const k of h.kids) {
      const c = state.kin!.children.find((x) => x.id === k);
      if (c?.personId) out.add(c.personId);
    }
  }
  out.delete(personId);
  return [...out].filter((id) => !!state.people[id]).sort();
}

/** Spread one resolved act. `ripple` is the catalog's enum for it (help / harm / cling / none). */
export function applyRipples(state: SimState, personId: string, interactionId: string, ripple: string | undefined): void {
  const cfg = (state.data as DataTables | undefined)?.ripples as RipplesCfg | undefined;
  const p = state.people[personId];
  if (!cfg || !p) return;
  const marks = Object.fromEntries((p.marks ?? []).map((m) => [m.markId, m.stacks]));
  const rng = deriveRng(state.seed, 'ripple', state.day, interactionId, personId);
  const band = ripple === 'help' ? cfg.help : ripple === 'harm' ? cfg.harm : undefined;
  const warmEnough = ripple === 'harm' || p.flame >= (cfg.minFlameToRipple ?? 0);
  if (band && warmEnough && hasAny(marks, band.requireMarksAny) && !hasAny(marks, band.forbidMarksAny)) {
    const sign = ripple === 'help' ? 1 : -1;
    for (const kinId of kinOf(state, personId).slice(0, KIN_MAX)) {
      const kin = state.people[kinId]!;
      const by = rng.int(band.flameMin, band.flameMax + 1);
      kin.flame = Math.max(0, Math.min(100, kin.flame + sign * by));
      pushJuice(state, `ripple.${ripple}`, { personId: kinId, fromPersonId: personId, townId: kin.townId, by: sign * by });
      noteUse('systems/ripples', ripple!);
    }
  }
  const cling = cfg.cling;
  if (cling && hasAny(marks, cling.requireMarksAny) && rng.next() < cling.chance) {
    state.player.spark = Math.max(0, state.player.spark - cling.sparkDrain);
    pushJuice(state, 'ripple.cling', { personId, townId: p.townId, spark: cling.sparkDrain });
    noteUse('systems/ripples', 'cling');
  }
}
