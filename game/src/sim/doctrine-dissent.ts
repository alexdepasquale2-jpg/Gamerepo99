/**
 * Internal dissent for a generated district's doctrine. A district raises one doctrine at its seat, and with no
 * rival the competition and challenger rules in doctrine-tick never touch it, so its meters sat still unless the
 * player acted. Dissent is the missing rival: the district's despair and wound press on the creed every dawn
 * (exposure creeps up, belief slides toward what is really delivered), and once that pressure has built up while
 * the creed stands alone a rival creed rises in a route-linked town. The rival is an ordinary doctrine from then
 * on: it competes, and it can take the seat through the existing challenger/swap rules. The home world (authored
 * doctrines) is untouched. Pure and deterministic: no Math.random, rolls via deriveRng, tuning in doctrines.json
 * rules.dissent.
 */
import type { DataTables } from './load-data';
import { DISTRICTS, districtAt, districtId, districtOfTown } from './map/districts';
import { deriveRng } from './rng';
import { pushJuice } from './packets';
import type { SimState } from './types/runtime';
import type { DoctrineMeters, DoctrineState } from './doctrine-tick';

type Dissent = {
  despairWeight: number; wounds: Record<string, number>; controlDamp: number;
  exposurePerDawn: number; truthPull: number; riseAfter: number;
  rivalStartMul: number; rivalControlMul: number; rivalGrowth: number; rivalVoice: number; rivalCeiling: number;
};
type Rules = { dissent?: Dissent; generated?: Record<string, { start: DoctrineMeters }> };

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const rulesOf = (state: SimState): Rules | undefined =>
  ((state.data as DataTables | undefined)?.doctrines as { rules?: Rules } | undefined)?.rules;

/** A town's own settled folk (not visitors, travellers or the retired), in id order. */
export function residentsOf(state: SimState, townId: string): string[] {
  return Object.keys(state.people ?? {}).sort().filter((id) => {
    const p = state.people[id]!;
    return p.townId === townId && !id.startsWith('vis_') && !p.tags?.some((t) => t === 'on_road' || t === 'retired');
  });
}

/** One of a town's adults (any resident if none), tagged `leader` so voices, the Power page and brokers find them. */
export function pickLeader(state: SimState, townId: string, ...key: (string | number)[]): string | undefined {
  const folk = residentsOf(state, townId);
  const adults = folk.filter((id) => (state.people[id]!.age ?? 30) >= 18);
  const pool = adults.length ? adults : folk;
  const leader = pool.length ? pool[deriveRng(state.seed, ...key).int(0, pool.length)] : undefined;
  const lp = leader ? state.people[leader] : undefined;
  if (lp && !lp.tags?.includes('leader')) lp.tags = [...(lp.tags ?? []), 'leader'];
  return leader;
}

/** The district a world's towns belong to (null for the home world). */
function districtOf(state: SimState): { col: number; row: number } | null {
  for (const t of Object.keys(state.towns ?? {}).sort()) { const d = districtOfTown(t); if (d) return d; }
  return null;
}

/**
 * One dawn of dissent, run before competition so the rival's gains are contested the same dawn.
 * `seat` is the world's seat (doctrine-tick worldSeat); `linked` says whether two towns share a route.
 */
export function tickDissent(state: SimState, all: Record<string, DoctrineState>, seat: string | undefined, linked: (a: string, b: string) => boolean): void {
  const cfg = rulesOf(state)?.dissent;
  const d = districtOf(state);
  if (!cfg || !d || !seat) return;
  const ids = Object.keys(all).sort();
  const live = ids.map((k) => all[k]!).filter((x) => !x.collapsed);
  const inc = live.find((x) => x.townId === seat && x.gen);
  const dist = districtAt(state.seed, d.col, d.row);
  const towns = Object.values(state.towns ?? {});
  const despair = towns.length ? towns.reduce((s, t) => s + (t.despair ?? 0), 0) / towns.length : dist.despair;
  const raw = clamp01(despair * cfg.despairWeight + (cfg.wounds[dist.character.wound] ?? 0));
  if (!inc) return fillEmptySeat(state, all, live, seat, d, cfg, raw);
  // A creed with a firm grip hears less of it: control damps the pressure.
  const p = raw * (1 - clamp01(inc.control) * cfg.controlDamp);
  if (!(p > 0)) return;

  inc.exposure = clamp01(inc.exposure + p * cfg.exposurePerDawn);
  inc.perceivedDelivery = clamp01(inc.perceivedDelivery + (inc.realDelivery - inc.perceivedDelivery) * p * cfg.truthPull);

  // A rival that rose against this seat is fed by the same discontent until it holds the seat itself.
  const risen = live.filter((x) => x.risenAgainst === inc.id && x.townId !== seat);
  for (const r of risen) {
    r.perceivedDelivery = Math.min(Math.max(r.perceivedDelivery, cfg.rivalCeiling), clamp01(r.perceivedDelivery + p * cfg.rivalGrowth));
    r.propaganda = Math.min(Math.max(r.propaganda, cfg.rivalCeiling), clamp01(r.propaganda + p * cfg.rivalVoice));
  }
  // Only a creed with no living rival breeds a new one (otherwise the ordinary competition carries the story).
  if (live.length > 1) return;
  inc.dissent = (inc.dissent ?? 0) + p;
  if (inc.dissent < cfg.riseAfter) return;
  const rival = raiseRival(state, all, inc, seat, d, cfg, linked);
  if (!rival) return; // no linked town to rise in: the pressure keeps, and tries again next dawn
  inc.dissent = 0;
  all[rival.id] = rival;
  pushJuice(state, 'doctrine.rival', { doctrineId: inc.id, challengerId: rival.id, townId: rival.townId });
}

/**
 * The seat's creed has fallen. A seat does not stay empty: the same discontent builds up (on the fallen creed's
 * record) and then a living creed moves in, the rival that rose against it first, else any other; with none left
 * standing, a new creed rises at the seat itself.
 */
function fillEmptySeat(state: SimState, all: Record<string, DoctrineState>, live: DoctrineState[], seat: string, d: { col: number; row: number }, cfg: Dissent, p: number): void {
  const fallen = Object.keys(all).sort().map((k) => all[k]!).filter((x) => x.collapsed && x.townId === seat && x.gen).pop();
  if (!fallen || !(p > 0)) return;
  fallen.dissent = (fallen.dissent ?? 0) + p;
  if (fallen.dissent < cfg.riseAfter) return;
  const heir = live.find((x) => x.risenAgainst === fallen.id) ?? live.find((x) => x.gen);
  if (heir) {
    fallen.dissent = 0;
    heir.townId = seat;
    heir.streaks = {};
    pushJuice(state, 'doctrine.swap', { incumbentId: fallen.id, challengerId: heir.id, townId: seat });
    return;
  }
  const risen = raiseRival(state, all, fallen, seat, d, cfg, () => true, seat);
  if (!risen) return;
  fallen.dissent = 0;
  all[risen.id] = risen;
  pushJuice(state, 'doctrine.rival', { doctrineId: fallen.id, challengerId: risen.id, townId: seat });
}

/** A rival creed in a town linked to the seat: another style than the incumbent's, led by one of its own folk. */
function raiseRival(state: SimState, all: Record<string, DoctrineState>, inc: DoctrineState, seat: string, d: { col: number; row: number }, cfg: Dissent, linked: (a: string, b: string) => boolean, at?: string): DoctrineState | undefined {
  const did = districtId(d.col, d.row);
  const n = Object.keys(all).length;
  const held = new Set(Object.values(all).filter((x) => !x.collapsed).map((x) => x.townId));
  // `at` forces the town (an empty seat); otherwise a free town on a route from the seat, so it can compete and swap.
  const towns = at ? [at] : Object.keys(state.towns ?? {}).sort().filter((t) => t !== seat && !held.has(t) && linked(seat, t));
  const styles = DISTRICTS.doctrineStyles.filter((s) => s.id !== inc.gen?.style && rulesOf(state)?.generated?.[s.id]);
  if (!towns.length || !styles.length) return undefined;
  const rng = deriveRng(state.seed, 'doctrine-rival', did, n);
  const townId = towns[rng.int(0, towns.length)]!;
  const style = styles[rng.int(0, styles.length)]!;
  const fresh = DISTRICTS.doctrineWords.filter((w) => !inc.gen?.name.startsWith(`${w} `));
  const words = fresh.length ? fresh : DISTRICTS.doctrineWords;
  const name = `${words[rng.int(0, words.length)]!} ${style.name}`;
  const start = rulesOf(state)!.generated![style.id]!.start;
  const leader = pickLeader(state, townId, 'doctrine-rival-leader', did, n);
  const perceivedDelivery = clamp01(start.perceivedDelivery * cfg.rivalStartMul);
  const control = clamp01(start.control * cfg.rivalControlMul);
  return {
    id: `doctrine_${did}_r${n}`, townId, ...start, perceivedDelivery, control, exposure: 0,
    // First reading only (doctrine-tick legitimacyOf recomputes it every dawn).
    legitimacy: clamp01(0.15 + 0.7 * perceivedDelivery + 0.15 * control),
    risenAgainst: inc.id,
    // The seat's creed never "challenges" a rising rival into swapping it onto the seat: only the rival contests.
    truceWith: inc.id,
    gen: { name, style: style.id, promise: style.promise, ...(leader ? { leaderPersonId: leader } : {}) },
  };
}
