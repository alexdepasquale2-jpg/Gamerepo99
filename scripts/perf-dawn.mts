/**
 * M7 dawn-tick profile. Times each advanceToDawn subsystem (wrapped here, no timing in src/sim).
 * Run: npm run perf:dawn   Out: docs/qa/reports/_m7-perf.json
 * Env: PERF_PEOPLE (default 1500) PERF_DAWNS (default 200) PERF_SEED (default 7)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../src/sim/load-data.ts';
import { generateWorld } from '../src/sim/fabric/fabric-bake.ts';
import { assembleInhabitant } from '../src/sim/inhabitant.ts';
import { createEventBus } from '../src/sim/event-bus.ts';
import { createRng } from '../src/sim/rng.ts';
import { tickCaravans } from '../src/sim/caravans.ts';
import { doctrineSupplyHook, tickDoctrines, applyDoctrineAct, ensureDoctrines } from '../src/sim/doctrine-tick.ts';
import { ensureEconomyState } from '../src/sim/economy/index.ts';
import { tickEconomyLod } from '../src/sim/economy/economy-lod.ts';
import { tickLetters } from '../src/sim/letters-scale.ts';
import { tickHoardDawn } from '../src/sim/hoard/index.ts';
import { tickUnspokenDawn, encodeUnspokenForState } from '../src/sim/social/unspoken.ts';
import { runHooks } from '../src/sim/hooks.ts';
import { clampPlayerSpark } from '../src/sim/scenario/scenario-advance.ts';
import { toTravelRoutes, loadBiomeTerrainMuls, loadEncounterTables, loadSizeTravelMuls } from '../src/sim/travel/travel.ts';
import { installPlayReactions } from '../src/sim/play-session/play-session-act.ts';
import { peopleFromWorld, pickTownId } from '../src/sim/play-session/play-session-boot.ts';

const SEED = Number(process.env.PERF_SEED ?? 7);
const PEOPLE = Number(process.env.PERF_PEOPLE ?? 1500);
const DAWNS = Number(process.env.PERF_DAWNS ?? 200);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function boot(): any {
  const data = loadData();
  const world = generateWorld({ seed: SEED, includeAnchors: true, peopleCount: PEOPLE });
  const player = assembleInhabitant(data, 'marrow');
  player.townId = pickTownId(player.townId, world);
  const state: any = {
    day: 1, seed: SEED, player, people: peopleFromWorld(world, data, SEED), flags: {}, packets: [],
    bus: { lastIds: [], ...createEventBus() }, data, rng: createRng(SEED),
    routes: toTravelRoutes(world.routes ?? []), kinEdges: world.kinEdges ?? [],
    encounterTables: loadEncounterTables(), biomeTerrainMuls: loadBiomeTerrainMuls(), sizeTravelMuls: loadSizeTravelMuls(),
  };
  state.economyHooks = { caravan: (s: any) => void tickCaravans(s, s.day), doctrine: doctrineSupplyHook };
  installPlayReactions(state);
  ensureEconomyState(state);
  return state;
}

const stateSize = (s: any) => { const { data, rng, ...rest } = s; return JSON.stringify(rest).length; };
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]!; };
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const state = boot();
const ids = Object.keys(state.people).sort();
const names = ['runHooks', 'tickEconomyLod', 'tickDoctrines', 'tickLetters', 'tickUnspokenDawn', 'tickHoardDawn', 'total'];
const times: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
const mem: number[] = []; const size: number[] = [];
const t = (name: string, fn: () => void) => { const a = performance.now(); fn(); times[name]!.push(performance.now() - a); };

const start = performance.now();
for (let d = 0; d < DAWNS; d++) {
  if (d % 3 === 0) encodeUnspokenForState(state, 'promise_keep', ids[(d * 7) % ids.length]!);
  if (d % 10 === 0) { try { ensureDoctrines(state); applyDoctrineAct(state, 'act_expose_lie', ids[(d * 13) % ids.length]!); } catch { /* ignore */ } }
  const t0 = performance.now();
  state.day += 1; state.flags.kindSuccessToday = false;
  t('runHooks', () => runHooks(state, 'dawn', { data: state.data, rng: state.rng }));
  t('tickEconomyLod', () => tickEconomyLod(state));
  t('tickDoctrines', () => { if (state.towns) tickDoctrines(state); });
  t('tickLetters', () => tickLetters(state));
  t('tickUnspokenDawn', () => tickUnspokenDawn(state));
  t('tickHoardDawn', () => tickHoardDawn(state));
  clampPlayerSpark(state);
  times.total!.push(performance.now() - t0);
  if (d % 10 === 0 || d === DAWNS - 1) { mem.push(process.memoryUsage().heapUsed); size.push(stateSize(state)); }
}
const stats = Object.fromEntries(names.map((n) => {
  const a = times[n]!;
  return [n, { p50: r3(q(a, 0.5)), p95: r3(q(a, 0.95)), max: r3(Math.max(...a)), sum: r3(a.reduce((x, y) => x + y, 0)) }];
}));
const out = {
  seed: SEED, people: Object.keys(state.people).length, dawns: DAWNS, wallMs: r3(performance.now() - start),
  unit: 'ms', stats, heapUsedMB: { first: r3(mem[0]! / 1e6), last: r3(mem[mem.length - 1]! / 1e6) },
  stateJsonBytes: { first: size[0], last: size[size.length - 1], samples: size },
};
const dir = resolve(ROOT, 'docs/qa/reports');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, '_m7-perf.json'), JSON.stringify(out, null, 2) + '\n');
console.table(stats);
console.log(JSON.stringify({ people: out.people, heapUsedMB: out.heapUsedMB, stateJsonBytes: { first: size[0], last: size[size.length - 1] } }));
