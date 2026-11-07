/**
 * M7 balance-bot harness (measurement only; never edits sim code or data).
 * playstyles x archetypes x seeds x dawns, headless, deterministic.
 *
 * Run:  npm run balance
 * Out:  docs/qa/reports/_m7-balance-matrix.json + docs/qa/reports/m7-balance.md
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import archetypesJson from '../src/data/people/archetypes.json' with { type: 'json' };
import { bootPlayState } from '../src/sim/play-session/play-session-state.ts';
import { actMethod, listMethodActions } from '../src/sim/play-session/play-session-act.ts';
import { buildPlaySnapshot } from '../src/sim/play-session/play-session-boot.ts';
import { maybeOpenSuccession } from '../src/sim/succession.ts';
import { detectEnding, ensureHoard } from '../src/sim/hoard/index.ts';
import { deriveRng, type Rng } from '../src/sim/rng.ts';

export type Playstyle = 'kind' | 'harsh' | 'hoarder' | 'neglect';
export const PLAYSTYLES: Playstyle[] = ['kind', 'harsh', 'hoarder', 'neglect'];
export const ARCHETYPES: string[] = (archetypesJson.archetypes as unknown as { id: string }[]).map((a) => a.id);
export const DEFAULT_SEEDS = [1, 2, 3, 4, 5];
export const DEFAULT_DAWNS = 60;
const ACTS_PER_DAWN: Record<Playstyle, number> = { kind: 3, harsh: 12, hoarder: 3, neglect: 0 };

export type Cell = {
  style: Playstyle;
  archetypeId: string;
  seed: number;
  dawnsSurvived: number;
  burnoutDay: number | null;
  reignitedCount: number;
  hollowCount: number;
  despair: number;
  finalSpark: number;
  minSpark: number;
  ending: string;
  /** Thrown acts swallowed as no-ops (harness-breakage detector; expect low). */
  actErrors: number;
};

type Ev = { type: string; methodId?: string };

function pickAction(
  style: Playstyle,
  actions: { id: string; family?: string }[],
  rng: Rng,
  spark: number,
): string | null {
  if (style === 'neglect') return null;
  // kind holds back when low; hoarder's carry_burden is gated at spark > 30 in runCell; harsh never does (that is the point of the style).
  if (style !== 'harsh' && spark <= 30) return null;
  if (style === 'hoarder') return null; // hoarder earns coin via carry_burden (see runCell)
  const want = style === 'harsh' ? 'savage' : 'kind';
  const pool = actions.filter((a) => a.family === want);
  if (pool.length === 0) return null;
  return pool[Math.floor(rng.next() * pool.length)]!.id;
}

export function runCell(style: Playstyle, archetypeId: string, seed: number, dawns: number): Cell {
  const { state, interactionRt } = bootPlayState(seed, archetypeId);
  const log: Ev[] = [];
  const open = { value: false };
  const extras = { tickN: 0, metrics: {}, setLastResolve: () => {} };
  const opts = { interactionCompat: interactionRt };
  let burnoutDay: number | null = null;
  let survived = 0;
  let minSpark = state.player.spark;
  let actErrors = 0;
  const peopleIds = Object.keys(state.people).sort();

  const safeAct = (id: string) => {
    try {
      actMethod(state, id, log, extras, opts);
    } catch {
      actErrors += 1; /* an unplayable pick is a deterministic no-op */
    }
  };

  for (let d = 0; d < dawns && !open.value; d++) {
    const rng = deriveRng(seed, 'balance-bot', style, archetypeId, d);
    extras.tickN = d;
    if (style !== 'neglect') {
      const actions = listMethodActions(state);
      for (let k = 0; k < ACTS_PER_DAWN[style] && !open.value; k++) {
        const id = pickAction(style, actions, rng, state.player.spark);
        if (id) safeAct(id);
        if (style === 'hoarder') {
          const person = peopleIds[Math.floor(rng.next() * peopleIds.length)]!;
          if (state.player.spark > 30) safeAct(`carry_burden@${person}`);
          const stashed = Object.values(ensureHoard(state).stash).reduce((a, s) => a + s.coin, 0);
          const act = (state.player.coin ?? 0) > 0 ? 'stash_hide' : stashed > 0 && d % 7 === 6 ? 'stash_withdraw' : null;
          if (act) safeAct(`${act}@${person}`);
        }
        maybeOpenSuccession(state, log, open);
        minSpark = Math.min(minSpark, state.player.spark);
      }
    }
    if (open.value) break;
    safeAct('advance:dawn');
    survived += 1;
    maybeOpenSuccession(state, log, open);
    minSpark = Math.min(minSpark, state.player.spark);
  }
  if (open.value) burnoutDay = state.day;

  const snap = buildPlaySnapshot({ tickN: survived, state, world: null, successionOpen: open.value });
  const here = state.towns?.[state.player.townId ?? ''];
  const despair = Number((here?.despair ?? 0).toFixed(4));
  const ending = detectEnding(state) ?? (open.value ? 'burnout' : 'survived');
  return {
    style,
    archetypeId,
    seed,
    dawnsSurvived: survived,
    burnoutDay,
    reignitedCount: snap.reignitedCount,
    hollowCount: snap.hollowCount,
    despair,
    finalSpark: Math.round(state.player.spark * 100) / 100,
    minSpark: Math.round(minSpark * 100) / 100,
    ending,
    actErrors,
  };
}

export function runMatrix(opts: {
  styles?: Playstyle[];
  archetypes?: string[];
  seeds?: number[];
  dawns?: number;
}): Cell[] {
  const cells: Cell[] = [];
  for (const style of opts.styles ?? PLAYSTYLES)
    for (const a of opts.archetypes ?? ARCHETYPES)
      for (const seed of opts.seeds ?? DEFAULT_SEEDS) cells.push(runCell(style, a, seed, opts.dawns ?? DEFAULT_DAWNS));
  return cells;
}

export type Agg = {
  style: string;
  archetypeId: string;
  n: number;
  burnoutRate: number;
  medianDawns: number;
  meanReignited: number;
  meanHollow: number;
  meanDespair: number;
  minSparkFloor: number;
  endings: Record<string, number>;
};

export function aggregate(cells: Cell[]): Agg[] {
  const groups = new Map<string, Cell[]>();
  for (const c of cells) {
    const k = `${c.style}|${c.archetypeId}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const mean = (xs: number[]) => (xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3)) : 0);
  return [...groups.entries()].map(([k, cs]) => {
    const [style, archetypeId] = k.split('|') as [string, string];
    const sorted = cs.map((c) => c.dawnsSurvived).sort((a, b) => a - b);
    const endings: Record<string, number> = {};
    for (const c of cs) endings[c.ending] = (endings[c.ending] ?? 0) + 1;
    return {
      style,
      archetypeId,
      n: cs.length,
      burnoutRate: mean(cs.map((c) => (c.burnoutDay !== null ? 1 : 0))),
      medianDawns: sorted[Math.floor(sorted.length / 2)] ?? 0,
      meanReignited: mean(cs.map((c) => c.reignitedCount)),
      meanHollow: mean(cs.map((c) => c.hollowCount)),
      meanDespair: mean(cs.map((c) => c.despair)),
      minSparkFloor: Math.min(...cs.map((c) => c.minSpark)),
      endings,
    };
  });
}

function report(cells: Cell[], aggs: Agg[], dawns: number): string {
  const stuck = aggs.filter((a) => a.burnoutRate >= 0.8);
  const trivial = aggs.filter((a) => a.style !== 'neglect' && a.burnoutRate === 0 && a.minSparkFloor >= 60);
  const idle = aggs.filter((a) => a.style !== 'neglect' && a.meanReignited === 0 && a.meanHollow === 0);
  const row = (a: Agg) =>
    `| ${a.style} | ${a.archetypeId} | ${a.burnoutRate} | ${a.medianDawns} | ${a.meanReignited} | ${a.meanHollow} | ${a.meanDespair} | ${JSON.stringify(a.endings)} |`;
  const list = (xs: Agg[]) =>
    xs.length ? xs.map((a) => `- ${a.style} x ${a.archetypeId} (burnout ${a.burnoutRate}, median ${a.medianDawns} dawns)`).join('\n') : '- none';
  const basilisk = aggs.filter((a) => a.archetypeId === 'basilisk_brood');
  const harsh = basilisk.find((a) => a.style === 'harsh');
  return `# M7 balance matrix

Generated by \`npm run balance\` (scripts/balance-bots.mts). ${cells.length} cells = ${PLAYSTYLES.length} playstyles x ${ARCHETYPES.length} archetypes x ${DEFAULT_SEEDS.length} seeds x ${dawns} dawns. Measurement only; no sim or data changes. Raw: \`_m7-balance-matrix.json\`.

dawnsSurvived counts completed dawns (a mid-dawn burnout does not count its partial dawn). Bots: acts per dawn (kind 3, harsh 12, hoarder 3, neglect 0) then \`advance:dawn\`. kind = kind-family acts, holds back below spark 30; harsh = savage-family acts, never holds back; hoarder = carry_burden (-> favor_do, coin) plus stash_hide / periodic stash_withdraw; neglect = only advances dawns.

## Per style x archetype

| style | archetype | burnout rate | median dawns | mean reignited | mean hollow | mean despair | endings |
|---|---|---:|---:|---:|---:|---:|---|
${aggs.map(row).join('\n')}

## Stuck cells (burnout rate >= 0.8)
${list(stuck)}

## Trivial cells (never burns out and spark never falls below 60; non-neglect)
${list(trivial)}

## No-impact cells (zero reignited and zero hollow; non-neglect)
${list(idle)}

## Harness health
Swallowed act errors across all cells: ${cells.reduce((a, c) => a + c.actErrors, 0)} (hoarder stash/carry picks that fail are expected no-ops).

## basilisk_brood
${basilisk.map((a) => `- ${a.style}: burnout ${a.burnoutRate}, median ${a.medianDawns} dawns`).join('\n')}

The known basilisk_brood x savage (harsh) burnout pocket is ${harsh && harsh.burnoutRate > 0 ? `reproduced (burnout ${harsh.burnoutRate})` : 'not reproduced by this bot policy'}.
`;
}

if (!process.env.VITEST) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const cells = runMatrix({});
  const aggs = aggregate(cells);
  const dir = resolve(root, 'docs/qa/reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, '_m7-balance-matrix.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), seeds: DEFAULT_SEEDS, dawns: DEFAULT_DAWNS, aggregates: aggs, cells }, null, 2),
  );
  writeFileSync(resolve(dir, 'm7-balance.md'), report(cells, aggs, DEFAULT_DAWNS));
  console.log(
    aggs.map((a) => `${a.style}/${a.archetypeId} burn=${a.burnoutRate} med=${a.medianDawns} re=${a.meanReignited} hol=${a.meanHollow} desp=${a.meanDespair}`).join('\n'),
  );
}
