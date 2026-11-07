/**
 * M4 living-world evidence probe (Probe harness).
 *
 * Deterministic seeded headless runs per module (LOD, caravans, doctrine,
 * letters/rumors, Blessings and Burdens) plus a two-run determinism check.
 * Does NOT write docs/qa/reports/m4-living-world.md (verdict is the team's)
 * and does NOT run the Hybrid-C matrix.
 *
 * Run:  npx vite-node scripts/m4-living-world-evidence.mts
 * Out:  docs/qa/reports/_m4-living-world-evidence.json
 * Exit: 0 all checks pass · 1 a check failed · 2 crash
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureEconomyState } from '../src/sim/economy/index.ts';
import { ensureDoctrines, applyDoctrineAct, tickDoctrines } from '../src/sim/doctrine-tick.ts';
import { encodeUnspokenForState } from '../src/sim/social/unspoken.ts';
import { bootPlayState } from '../src/sim/play-session/play-session-state.ts';
import { advanceToDawn } from '../src/sim/scenario/scenario-advance.ts';
import type { SimState } from '../src/sim/types/runtime.ts';

const SEED = 42;
const DAWNS = 15;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = resolve(ROOT, 'docs/qa/reports/_m4-living-world-evidence.json');

type Check = { name: string; pass: boolean; detail: string };
type Event = { id: string; payload: any };

function boot(): SimState {
  const { state } = bootPlayState(SEED, 'marrow');
  ensureEconomyState(state);
  return state;
}

function capture(state: SimState): Event[] {
  const events: Event[] = [];
  state.bus = { ...(state.bus ?? {}), lastIds: state.bus?.lastIds ?? [], emit: (id, payload) => void events.push({ id, payload }) };
  return events;
}

function hist(events: Event[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const e of events) h[e.id] = (h[e.id] ?? 0) + 1;
  return Object.fromEntries(Object.entries(h).sort(([a], [b]) => a.localeCompare(b)));
}

function fingerprint(state: SimState): string {
  const view = {
    towns: Object.fromEntries(Object.entries(state.towns ?? {}).map(([k, t]) => [k, { d: t.despair, s: t.stock }])),
    doctrines: state.doctrines,
    caravans: state.caravans,
    letters: state.letters,
    unspoken: state.unspoken,
    ids: state.bus?.lastIds,
  };
  return createHash('sha256').update(JSON.stringify(view)).digest('hex').slice(0, 16);
}

/** Shipped data opts every town out, so LOD is exercised with these towns opted in (as the LOD tests do). */
const OPT_IN = ['lowmere', 'city_reach'];

function mainRun() {
  const state = boot();
  for (const id of OPT_IN) state.towns![id]!.economyOptIn = true;
  const events = capture(state);
  const townIds = Object.keys(state.towns ?? {});
  const optOut = townIds.filter((id) => state.towns![id]!.economyOptIn === false);
  const startStock = JSON.stringify(Object.values(state.towns ?? {}).map((t) => t.stock));
  const trace: Record<string, number[]> = Object.fromEntries(townIds.map((id) => [id, [state.towns![id]!.despair]]));
  const perDawn: Record<string, number>[] = [];
  const sparkStart = state.player.spark;
  for (let i = 0; i < DAWNS; i++) {
    const before = events.length;
    advanceToDawn(state);
    for (const id of townIds) trace[id]!.push(state.towns![id]!.despair);
    perDawn.push(hist(events.slice(before)));
  }
  const maxDelta = Math.max(0, ...townIds.flatMap((id) => trace[id]!.slice(1).map((v, i) => v - trace[id]![i]!)));
  return {
    state, events, optOut, townIds, trace, maxDelta, perDawn, sparkStart,
    stockChanged: JSON.stringify(Object.values(state.towns ?? {}).map((t) => t.stock)) !== startStock,
  };
}

function doctrineRun() {
  const state = boot();
  const events = capture(state);
  const d = ensureDoctrines(state);
  const ids = Object.keys(d).sort();
  const id = ids.find((k) => state.towns![d[k]!.townId])!;
  const town = state.towns![d[id]!.townId]!;
  const sparkBefore = state.player.spark;
  const despairBefore = town.despair;
  const person = state.people[Object.keys(state.people).sort()[0]!]!;
  person.townId = d[id]!.townId;
  person.tags = ['leader'];
  const exposureBefore = d[id]!.exposure;
  const actId = applyDoctrineAct(state, 'act_expose_lie', person.id);
  const actApplied = !!actId && d[actId]!.exposure > exposureBefore;
  Object.assign(d[id]!, { perceivedDelivery: 0.9, realDelivery: 0.1, exposure: 0.8, control: 0 });
  const r1 = tickDoctrines(state);
  const r2 = tickDoctrines(state);
  const kin = Object.keys(d).filter((k) => k !== id && !d[k]!.collapsed);
  return {
    actId: actId ?? null, actApplied, collapsed1: r1.collapsed, collapsed2: r2.collapsed,
    despairDelta: +(town.despair - despairBefore).toFixed(4),
    sparkNeutral: state.player.spark === sparkBefore,
    collapseEvents: events.filter((e) => e.id === 'doctrine.collapse').length,
    exposedEvents: events.filter((e) => e.id === 'doctrine.exposed').length,
    kinRelapsePressure: events.filter((e) => e.id === 'packet.emit' && e.payload?.kind === 'relapse_pressure').length,
    survivors: kin.length,
  };
}

function unspokenRun() {
  const state = boot();
  const events = capture(state);
  const person = state.people[Object.keys(state.people).sort()[0]!]!;
  const made = encodeUnspokenForState(state, 'promise_keep', person.id);
  const encoded = made.length;
  const w0 = made.reduce((a, m) => a + m.weight, 0);
  for (let i = 0; i < DAWNS; i++) advanceToDawn(state);
  const after = state.unspoken?.instances ?? [];
  const w1 = after.filter((m) => !m.consumed).reduce((a, m) => a + m.weight, 0);
  return {
    encoded, consumed: after.filter((m) => m.consumed).length, weightBefore: +w0.toFixed(4), weightAfter: +w1.toFixed(4),
    classIds: made.map((m) => m.classId), histogram: hist(events),
  };
}

function main(): number {
  const a = mainRun();
  const b = mainRun();
  const du1 = doctrineRun();
  const du2 = doctrineRun();
  const un1 = unspokenRun();
  const un2 = unspokenRun();
  const h = hist(a.events);
  const arrivals = a.events.filter((e) => e.id === 'stock.deliver' && e.payload?.routeId);
  const letterPerDawn = a.perDawn.map((d) => (d['letter.deliver'] ?? 0) + (d['rumor.spread'] ?? 0));
  const letterTotal = letterPerDawn.reduce((x, y) => x + y, 0);
  const optOutStarve = a.events.filter((e) => e.id === 'stock.starve' && a.optOut.includes(e.payload?.townId)).length;
  const fpA = fingerprint(a.state);
  const fpB = fingerprint(b.state);
  const deterministic = fpA === fpB && JSON.stringify(h) === JSON.stringify(hist(b.events));

  const mk = (rel: string, checks: Check[]) => ({
    status: checks.every((c) => c.pass) ? ('OK' as const) : ('FAIL' as const),
    path: rel,
    present: existsSync(resolve(ROOT, rel)),
    checks,
  });
  const lod = mk('src/sim/economy/economy-lod.ts', [
    { name: 'stock moves or deliver/starve emitted', pass: a.stockChanged || !!(h['stock.deliver'] || h['stock.starve']), detail: `stockChanged=${a.stockChanged} deliver=${h['stock.deliver'] ?? 0} starve=${h['stock.starve'] ?? 0}` },
    { name: 'per-dawn despair delta <= 0.05 (incl. doctrine collapse pulse)', pass: a.maxDelta <= 0.05 + 1e-9, detail: `max=${a.maxDelta.toFixed(4)}` },
    { name: 'opt-out towns inert (no stock.starve)', pass: optOutStarve === 0 && a.optOut.length > 0 && !a.optOut.some((id) => a.trace[id]!.some((v) => v !== a.trace[id]![0])), detail: `optedIn=[${OPT_IN}] optOut=[${a.optOut}] starve=${optOutStarve} despairMoved=${a.optOut.some((id) => a.trace[id]!.some((v) => v !== a.trace[id]![0]))}` },
  ]);
  const caravans = mk('src/sim/caravans.ts', [
    { name: '>=1 route.caravan within 15 dawns', pass: (h['route.caravan'] ?? 0) >= 1, detail: `route.caravan=${h['route.caravan'] ?? 0}` },
    { name: 'a caravan arrives and delivers stock', pass: arrivals.length >= 1, detail: `route deliveries=${arrivals.length}` },
  ]);
  const doctrine = mk('src/sim/doctrine-tick.ts', [
    { name: 'applyDoctrineAct raises exposure + doctrine.exposed', pass: du1.actApplied && du1.exposedEvents >= 1, detail: `act=${du1.actId} exposed=${du1.exposedEvents}` },
    { name: 'forced exposed lie collapses once, juice, +0.05 despair', pass: du1.collapsed1.length >= 1 && du1.collapsed2.length === 0 && du1.collapseEvents >= 1 && Math.abs(du1.despairDelta - 0.05) < 1e-6, detail: `collapsed=${du1.collapsed1} second=${du1.collapsed2.length} despair+${du1.despairDelta}` },
    { name: 'cascade finite (second tick does not re-collapse)', pass: du1.collapsed2.length === 0, detail: `survivors=${du1.survivors}` },
    { name: 'doctrine tick spark-neutral', pass: du1.sparkNeutral, detail: `spark unchanged=${du1.sparkNeutral}` },
    { name: 'deterministic double-run', pass: JSON.stringify(du1) === JSON.stringify(du2), detail: 'deep-equal' },
  ]);
  const letters = mk('src/sim/letters-scale.ts', [
    { name: '>=3 letter.deliver/rumor.spread over 15 dawns', pass: letterTotal >= 3, detail: `total=${letterTotal} (letter=${h['letter.deliver'] ?? 0} rumor=${h['rumor.spread'] ?? 0})` },
    { name: 'per-dawn cap <= 5', pass: Math.max(0, ...letterPerDawn) <= 5, detail: `max/dawn=${Math.max(0, ...letterPerDawn)}` },
  ]);
  const unspoken = mk('src/sim/social/unspoken.ts', [
    { name: 'promise_keep encodes an instance', pass: un1.encoded >= 1, detail: `classes=${un1.classIds}` },
    { name: 'decays or comes to pass over dawns', pass: un1.consumed > 0 || un1.weightAfter < un1.weightBefore, detail: `consumed=${un1.consumed} weight ${un1.weightBefore}->${un1.weightAfter}` },
    { name: 'deterministic double-run', pass: JSON.stringify(un1) === JSON.stringify(un2), detail: 'deep-equal' },
  ]);
  const modules = { lod, caravans, doctrine, letters, unspoken };
  const determinism = { pass: deterministic, fingerprintA: fpA, fingerprintB: fpB };
  const ok = Object.values(modules).every((m) => m.status === 'OK') && deterministic;

  const report = {
    generatedAt: new Date().toISOString(),
    kind: 'm4-living-world-evidence',
    status: ok ? 'OK' : 'FAIL',
    seed: SEED,
    dawns: DAWNS,
    notes: [
      'Verdict file docs/qa/reports/m4-living-world.md is intentionally NOT written; Go/No-go is the team\'s call.',
    ],
    modules,
    histogram: h,
    despairMaxDelta: +a.maxDelta.toFixed(4),
    gaps: [
      `gate-doc metric 'collapse emits relapse_pressure packet to a kin town': packets=${du1.kinRelapsePressure} (doctrine-tick.ts only juices + despair pulse + exposure cascade)`,
      'gate-doc metrics challenger-swap (3 dawns) and city->village perceivedDelivery shock: not implemented, not checked',
    ],
    determinism,
    ok,
  };

  mkdirSync(dirname(DEST), { recursive: true });
  writeFileSync(DEST, JSON.stringify(report, null, 2) + '\n');
  console.error(`wrote ${DEST}`);
  console.log(
    `m4-living-world-evidence status=${report.status} ` +
      Object.entries(modules).map(([k, m]) => `${k}=${m.status}`).join(' ') +
      ` determinism=${deterministic ? 'OK' : 'FAIL'}`,
  );
  for (const [k, m] of Object.entries(modules)) for (const c of m.checks) console.log(`  ${c.pass ? 'pass' : 'FAIL'} ${k}: ${c.name} [${c.detail}]`);
  return ok ? 0 : 1;
}

try {
  process.exit(main());
} catch (err) {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(JSON.stringify({ status: 'ERROR', ok: false, error: message }, null, 2));
  process.exit(2);
}
