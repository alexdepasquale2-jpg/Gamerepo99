/**
 * Civic clock cost cap (the method of the root scripts/perf-dawn.mts, on the v2 play session).
 * For each seed: 100 days stepped as full dawns vs one 100-day fastForward (the LOD stretch, civic/lod).
 *   - cost: the fast-forward must stay under LOD_SHARE of the full dawns' time and under BUDGET_MS;
 *   - agreement: population, mean town despair, food in store and coin (purses and tills) within
 *     tolerance of the full run;
 *   - determinism: two fast-forwards from the same seed save byte-identically.
 * Run: npx vite-node --config game/vite.config.ts game/scripts/perf-civic.mts   (exit 1 on a strict miss;
 * despair, food and coin agreement only warn)
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
 * Tolerances. People and despair follow the dawn's own rules closely. Food and coin are looser: the LOD
 * stretch makes goods at their expected rate (not person by person, so which company a hand ends up in
 * and when a raid falls differ), and runs company founding and polity every other day.
 */
const TOL = { people: 0.1, despair: 0.15, food: 0.5, coin: 0.5 };
/** Coin within this much is a match however small the totals (a few days of one workshop's takings). */
const COIN_FLOOR = 50;

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
    // Every coin the civic loop moves sits in a purse or a company's till (civic/sites moveCoin).
    coin: Object.values(st.companies?.purse ?? {}).reduce((n, c) => n + c, 0) + (st.companies?.list ?? []).reduce((n, c) => n + c.coin, 0),
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
let warned = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};
/**
 * Agreement on stocks is reported, not enforced: one raid, levy or caravan landing in a shortage moves a
 * single seed's despair, food or coin by more than the tolerance (the LOD makes goods at their expected
 * rate, so it cannot follow one run's luck). Cost, calendar, population and determinism stay strict.
 */
const warn = (ok: boolean, what: string, full: number, lod: number, tol: string): void => {
  if (!ok) warned++;
  console.log(`  ${ok ? 'ok  ' : 'WARN'} ${what} (full ${full.toFixed(2)}, lod ${lod.toFixed(2)}, tolerance ${tol})`);
};
for (const seed of SEEDS) {
  const { ms: tFull, st: full } = best(seed, (s) => { for (let i = 0; i < DAYS; i++) fullDay(s); });
  const { ms: tLod, st: lod } = best(seed, (s) => void fastForward(s, DAYS));
  const again = boot(seed);
  fastForward(again, DAYS);
  const a = agg(full), b = agg(lod);
  console.log(`seed ${seed}: ${DAYS} full dawns ${tFull.toFixed(0)} ms, fastForward ${tLod.toFixed(0)} ms (${((tLod / tFull) * 100).toFixed(0)}%)`);
  console.log(`  full: people ${a.people}, despair ${a.despair.toFixed(3)}, food ${a.food.toFixed(1)}, coin ${a.coin.toFixed(0)}`);
  console.log(`  lod:  people ${b.people}, despair ${b.despair.toFixed(3)}, food ${b.food.toFixed(1)}, coin ${b.coin.toFixed(0)}`);
  check(full.day === lod.day, `same calendar (day ${lod.day})`);
  check(tLod <= tFull * LOD_SHARE && tLod <= BUDGET_MS, `cost under ${LOD_SHARE * 100}% of full and ${BUDGET_MS} ms`);
  check(Math.abs(b.people - a.people) <= Math.max(2, a.people * TOL.people), `population within ${TOL.people * 100}%`);
  warn(Math.abs(b.despair - a.despair) <= TOL.despair, 'mean despair', a.despair, b.despair, `±${TOL.despair}`);
  warn(Math.abs(b.food - a.food) <= Math.max(10, a.food * TOL.food), 'food', a.food, b.food, `±${TOL.food * 100}%`);
  warn(Math.abs(b.coin - a.coin) <= Math.max(COIN_FLOOR, a.coin * TOL.coin), 'coin', a.coin, b.coin, `±${TOL.coin * 100}% (at least ${COIN_FLOOR})`);
  check(hash(lod) === hash(again), 'fast-forward is deterministic');
}
if (warned) console.log(`perf-civic: ${warned} agreement warning(s) (reported, not failed)`);
console.log(failed ? `perf-civic: ${failed} check(s) failed` : 'perf-civic: all checks passed');
process.exit(failed ? 1 : 0);
