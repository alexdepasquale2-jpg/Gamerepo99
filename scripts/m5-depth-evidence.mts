/**
 * M5 depth evidence probe (headless, seeded, deterministic; no wall-clock in outputs).
 *
 * Task A: 30-dawn hoarder run -> ash_hoard ending, no loss; notoriety drives encounters; neglect raises despair, never fails.
 * Task B: patron deal shifts doctrine meters + notoriety, identical across two runs.
 * Task C: burnout -> "Carry it on" heir; exportWorld -> importWorld has legend/grave; same seed -> identical file.
 * A failing check is recorded as a gap (sim code is not patched here).
 *
 * Run:  npm run evidence:m5   (npx vite-node scripts/m5-depth-evidence.mts)
 * Out:  docs/qa/reports/_m5-depth.json, docs/qa/reports/m5-depth.md
 * Exit: 0 all checks pass · 1 a check failed (gaps listed) · 2 crash
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureEconomyState } from '../src/sim/economy/index.ts';
import { bootPlayState } from '../src/sim/play-session/play-session-state.ts';
import { actMethod } from '../src/sim/play-session/play-session-act.ts';
import { advanceToDawn } from '../src/sim/scenario/scenario-advance.ts';
import { maybeOpenSuccession } from '../src/sim/succession.ts';
import { ensureDoctrines } from '../src/sim/doctrine-tick.ts';
import { applyStashAct, attractorRoadBonus, detectEnding, ensureHoard, rollAttractors } from '../src/sim/hoard/index.ts';
import { carryItOn, exportWorld, importWorld, letItRest } from '../src/sim/legacy/index.ts';
import { openDeals } from '../src/sim/patrons/index.ts';

const SEED = 7;
const DAWNS = 30;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = resolve(ROOT, 'docs/qa/reports/_m5-depth.json');
const OUT_MD = resolve(ROOT, 'docs/qa/reports/m5-depth.md');

type Check = { name: string; pass: boolean; detail: string };
const r4 = (n: number) => +n.toFixed(4);

function hoarderRun(seed: number) {
  const { state } = bootPlayState(seed, 'marrow');
  ensureEconomyState(state);
  // Shipped data opts every town out of the LOD (M4 caveat); opt these in as the M4 evidence/tests do.
  for (const id of ['lowmere', 'city_reach']) state.towns![id]!.economyOptIn = true;
  state.player.townId = 'ashford';
  state.player.coin = 60;
  const hides = [applyStashAct(state, 'stash_hide'), applyStashAct(state, 'stash_hide')];
  const maxDespair = () => Object.values(state.towns ?? {}).reduce((a, t) => a + t.despair, 0);
  const despair0 = maxDespair();
  const notoTrace = [r4(ensureHoard(state).notoriety)];
  let lost = false;
  for (let d = 0; d < DAWNS; d++) {
    advanceToDawn(state);
    notoTrace.push(r4(ensureHoard(state).notoriety));
    if ((state.ended as string | undefined) === 'loss' || state.flags.lost || state.flags.gameOver) lost = true;
  }
  return {
    hides, ending: detectEnding(state), peakCoin: ensureHoard(state).peakCoin, reignites: ensureHoard(state).reigniteCount,
    ended: state.ended ?? null, lost, despair0: r4(despair0), despair1: r4(maxDespair()), notoTrace, hoard: JSON.stringify(state.hoard),
  };
}

function encounterRun() {
  const { state } = bootPlayState(SEED, 'marrow');
  const h = ensureHoard(state);
  const ids: string[] = ((state.data as any).notoriety.attractors as any[]).filter((a) => a.channels.includes('encounter')).map((a) => a.id);
  const sample = (n: number) => {
    h.notoriety = n;
    const bonus = Object.fromEntries(ids.map((id) => [id, r4(attractorRoadBonus(state, id))]));
    let rolls = 0;
    for (let day = 1; day <= 60; day++) {
      state.day = day;
      rolls += rollAttractors(state, 'road').length;
    }
    return { bonus, rolls };
  };
  return { low: sample(0), high: sample(0.9) };
}

function patronRun(seed: number) {
  const b = bootPlayState(seed, 'marrow');
  const { state } = b;
  state.player.townId = 'ashford';
  ensureHoard(state).notoriety = 0.5;
  const doc = ensureDoctrines(state).doctrine_mill_bread!;
  const snap = () => ({ propaganda: doc.propaganda, perceived: doc.perceivedDelivery, real: doc.realDelivery, exposure: doc.exposure, legitimacy: doc.legitimacy });
  const before = snap();
  const noto0 = ensureHoard(state).notoriety;
  const voice = Object.keys(state.people).sort().find((id) => state.people[id]!.townId === 'ashford' && state.people[id]!.tags?.includes('doctrine_voice'));
  const open = openDeals(state, 'patron_mill_trust');
  if (voice) actMethod(state, `patron_accept_mill_deny@${voice}`, [], undefined, { interactionCompat: b.interactionRt });
  for (let i = 0; i < 3; i++) advanceToDawn(state);
  const after = snap();
  const doctrineDelta = Object.fromEntries(Object.keys(before).map((k) => [k, r4((after as any)[k] - (before as any)[k])]));
  return { voice: voice ?? null, open, deals: JSON.parse(JSON.stringify(state.patronDeals ?? {})), notoDelta: r4(ensureHoard(state).notoriety - noto0), doctrineDelta };
}

function legacyRun(seed: number) {
  const b = bootPlayState(seed, 'marrow');
  const { state } = b;
  const pid = Object.keys(state.people).sort()[0]!;
  state.player.townId = state.people[pid]!.townId;
  for (let i = 0; i < 4; i++) {
    state.player.spark = 100;
    for (const m of ['carry_burden', 'inspire']) actMethod(state, `${m}@${pid}`, [], undefined, { interactionCompat: b.interactionRt });
    actMethod(state, 'advance:dawn', []);
  }
  state.player.spark = 0;
  maybeOpenSuccession(state, [], { value: false });
  const res = carryItOn(state);
  const file = exportWorld(state);
  const imp = importWorld(JSON.parse(JSON.stringify(file)));
  const fresh = 'error' in imp ? null : imp;
  const lg = fresh?.state.legacy;
  return {
    ok: res.ok, heirPersonId: res.ok ? (res.heirPersonId ?? null) : null, heirSpark: state.player.spark,
    contentHash: file.contentHash, version: file.version, imported: !!fresh, importError: 'error' in imp ? imp.error : null,
    graves: lg?.graves.length ?? 0, npcs: Object.keys(lg?.npcs ?? {}).length, legends: fresh?.legends ?? [], file,
  };
}

function restRun(seed: number) {
  const { state } = bootPlayState(seed, 'marrow');
  state.player.spark = 0;
  maybeOpenSuccession(state, [], { value: false });
  const r = letItRest(state);
  return { ok: r.ok, ended: state.ended ?? null };
}

function main(): number {
  const a1 = hoarderRun(SEED);
  const a2 = hoarderRun(SEED);
  const enc = encounterRun();
  const p1 = patronRun(SEED);
  const p2 = patronRun(SEED);
  const c1 = legacyRun(SEED);
  const c2 = legacyRun(SEED);
  const rest = restRun(SEED);

  const tasks: Record<string, Check[]> = {
    'A hoarder / notoriety': [
      { name: '30-dawn hoarder run (0 reignites) ends with ash_hoard', pass: a1.ending === 'ash_hoard' && a1.reignites === 0, detail: `ending=${a1.ending} peakCoin=${a1.peakCoin} reignites=${a1.reignites}` },
      { name: 'run is not a loss', pass: !a1.lost && a1.ended !== 'loss', detail: `ended=${a1.ended} lost=${a1.lost}` },
      { name: 'Let it rest is a warm ending', pass: rest.ok && rest.ended === 'rest', detail: `ok=${rest.ok} ended=${rest.ended}` },
      { name: 'notoriety raises encounter weights and rolls', pass: Object.values(enc.high.bonus).some((v) => v > 0) && Object.values(enc.low.bonus).every((v) => v === 0) && enc.high.rolls > enc.low.rolls, detail: `low=${JSON.stringify(enc.low)} high=${JSON.stringify(enc.high)}` },
      { name: 'neglect raises despair, never fails', pass: a1.despair1 > a1.despair0 && !a1.lost, detail: `totalTownDespair ${a1.despair0}->${a1.despair1}` },
      { name: 'deterministic double-run', pass: JSON.stringify(a1) === JSON.stringify(a2), detail: 'same seed twice' },
    ],
    'B patrons': [
      { name: 'patron deal opens at notoriety 0.5', pass: p1.open.length > 0, detail: `open=${p1.open}` },
      { name: 'deal accepted via interaction', pass: Object.keys(p1.deals).length > 0, detail: `deals=${JSON.stringify(p1.deals)}` },
      { name: 'notoriety shifts', pass: p1.notoDelta !== 0, detail: `delta=${p1.notoDelta}` },
      { name: 'doctrine meters shift', pass: Object.values(p1.doctrineDelta).some((v) => v !== 0), detail: JSON.stringify(p1.doctrineDelta) },
      { name: 'same seed twice -> equal', pass: JSON.stringify(p1) === JSON.stringify(p2), detail: 'deep-equal' },
    ],
    'C legacy': [
      { name: 'burnout -> Carry it on yields an heir', pass: c1.ok && !!c1.heirPersonId, detail: `heir=${c1.heirPersonId} heirSpark=${c1.heirSpark}` },
      { name: 'exportWorld -> importWorld on fresh state', pass: c1.imported, detail: c1.importError ?? `v${c1.version} hash=${c1.contentHash}` },
      { name: 'grave + legend present after import', pass: c1.graves >= 1 && c1.npcs >= 1 && c1.legends.length >= 1, detail: `graves=${c1.graves} npcs=${c1.npcs} legends=${c1.legends.length}` },
      { name: 'same seed -> identical file', pass: JSON.stringify(c1.file) === JSON.stringify(c2.file), detail: `hash=${c1.contentHash}` },
    ],
  };
  const gaps = Object.entries(tasks).flatMap(([t, cs]) => cs.filter((c) => !c.pass).map((c) => `${t}: ${c.name} [${c.detail}]`));
  const ok = gaps.length === 0;

  const { file: _file, ...c1Public } = c1;
  const report = { kind: 'm5-depth-evidence', status: ok ? 'OK' : 'FAIL', seed: SEED, dawns: DAWNS, tasks, gaps, notorietyTrace: a1.notoTrace, patron: p1, encounters: enc, legacy: c1Public, ok };
  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n');
  const md = [
    '# M5 depth evidence', '',
    `- Status: **${report.status}** (seed ${SEED}, ${DAWNS} dawns, deterministic; regenerate with \`npm run evidence:m5\`)`,
    "- Verdict is Alex's: see `docs/qa/M5_GATE.md` (Go/Hold unchecked).", '',
    ...Object.entries(tasks).flatMap(([t, cs]) => [`## ${t}`, '', '| Check | Result | Detail |', '|---|---|---|', ...cs.map((c) => `| ${c.name} | ${c.pass ? 'pass' : 'FAIL'} | ${c.detail.replace(/\|/g, '/')} |`), '']),
    '## Gaps', '', ...(gaps.length ? gaps.map((g) => `- ${g}`) : ['- none']), '',
  ].join('\n');
  writeFileSync(OUT_MD, md);

  console.log(`m5-depth-evidence status=${report.status}`);
  for (const [t, cs] of Object.entries(tasks)) for (const c of cs) console.log(`  ${c.pass ? 'pass' : 'FAIL'} ${t}: ${c.name} [${c.detail}]`);
  console.log(`gaps: ${JSON.stringify(gaps)}`);
  return ok ? 0 : 1;
}

try {
  process.exit(main());
} catch (err) {
  console.error(JSON.stringify({ status: 'ERROR', ok: false, error: err instanceof Error ? (err.stack ?? err.message) : String(err) }, null, 2));
  process.exit(2);
}
