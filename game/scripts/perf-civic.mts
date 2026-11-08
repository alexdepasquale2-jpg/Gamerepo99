/**
 * Civic clock cost cap (the method of the root scripts/perf-dawn.mts, on the v2 play session).
 * For each seed: 100 days stepped as full dawns vs one 100-day fastForward (the LOD stretch, civic/lod).
 *   - cost: the fast-forward must stay under LOD_SHARE of the full dawns' time and under BUDGET_MS;
 *   - agreement: population, mean town despair and food in store within tolerance of the full run;
 *   - determinism: two fast-forwards from the same seed save byte-identically.
 * Run: npx vite-node --config game/vite.config.ts game/scripts/perf-civic.mts   (exit 1 on a miss)
 * Times are the best of REPEATS runs on fresh states.
 * Env: PERF_DAYS (default 100), PERF_SEEDS (default "42,7").
 */
import { createHash } from 'node:crypto';
import { createPlaySession, type PlaySession } from '../src/sim/play-session/play-session';
import { fastForward, fullDay } from '../src/sim/civic/clock';
import { districtFood } from '../src/sim/civic/lod';
import type { SimState } from '../src/sim/types/runtime';

const DAYS = Number(process.env.PERF_DAYS ?? 100);
const SEEDS = (process.env.PERF_SEEDS ?? '42,7').split(',').map(Number);
/** The LOD stretch must cost at most this share of the same days as full dawns... */
const LOD_SHARE = 0.4;
/** ...and never more than this, whatever the machine. */
const BUDGET_MS = 1500;
/**
 * Tolerances. People and despair follow the dawn's own rules closely. Food is looser: the LOD stretch
 * folds the carts (no tech spreads along cart roads in the dark) and runs town growth every other day.
 */
const TOL = { people: 0.1, despair: 0.15, food: 0.5 };

const boot = (seed: number): SimState => {
  const s = createPlaySession({ mode: 'play', seed }) as PlaySession;
  s.start();
  return s.getState() as SimState;
};
const agg = (st: SimState) => {
  const towns = Object.values(st.towns ?? {});
  return {
    people: Object.keys(st.people).length,
    despair: towns.length ? towns.reduce((n, t) => n + t.despair, 0) / towns.length : 0,
    food: districtFood(st),
  };
};
const hash = (st: SimState): string => {
  const { data: _d, rng: _r, bus: _b, ...rest } = st as SimState & Record<string, unknown>;
  return createHash('sha1').update(JSON.stringify(rest)).digest('hex');
};
/** Best of REPEATS on fresh states (this machine is shared: the minimum is the cost, the rest is noise). */
const REPEATS = 3;
const best = (seed: number, run: (st: SimState) => void): { ms: number; st: SimState } => {
  let ms = Infinity, st: SimState | undefined;
  for (let i = 0; i < REPEATS; i++) {
    const s = boot(seed), t = performance.now();
    run(s);
    const took = performance.now() - t;
    if (took < ms) { ms = took; st = s; }
  }
  return { ms, st: st! };
};

// Warm the JIT and the lazy tables once so the first seed is not charged for them.
{ const w = boot(1); for (let i = 0; i < 5; i++) fullDay(w); fastForward(w, 20); }

let failed = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};
for (const seed of SEEDS) {
  const { ms: tFull, st: full } = best(seed, (s) => { for (let i = 0; i < DAYS; i++) fullDay(s); });
  const { ms: tLod, st: lod } = best(seed, (s) => void fastForward(s, DAYS));
  const again = boot(seed);
  fastForward(again, DAYS);
  const a = agg(full), b = agg(lod);
  console.log(`seed ${seed}: ${DAYS} full dawns ${tFull.toFixed(0)} ms, fastForward ${tLod.toFixed(0)} ms (${((tLod / tFull) * 100).toFixed(0)}%)`);
  console.log(`  full: people ${a.people}, despair ${a.despair.toFixed(3)}, food ${a.food.toFixed(1)}`);
  console.log(`  lod:  people ${b.people}, despair ${b.despair.toFixed(3)}, food ${b.food.toFixed(1)}`);
  check(full.day === lod.day, `same calendar (day ${lod.day})`);
  check(tLod <= tFull * LOD_SHARE && tLod <= BUDGET_MS, `cost under ${LOD_SHARE * 100}% of full and ${BUDGET_MS} ms`);
  check(Math.abs(b.people - a.people) <= Math.max(2, a.people * TOL.people), `population within ${TOL.people * 100}%`);
  check(Math.abs(b.despair - a.despair) <= TOL.despair, `mean despair within ${TOL.despair}`);
  check(Math.abs(b.food - a.food) <= Math.max(10, a.food * TOL.food), `food within ${TOL.food * 100}%`);
  check(hash(lod) === hash(again), 'fast-forward is deterministic');
}
console.log(failed ? `perf-civic: ${failed} check(s) failed` : 'perf-civic: all checks passed');
process.exit(failed ? 1 : 0);
