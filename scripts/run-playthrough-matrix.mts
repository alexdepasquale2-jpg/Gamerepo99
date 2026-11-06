import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMatrix } from '../tests/bots/run-matrix';
import thresholds from '../tests/bots/thresholds.json';

const result = await runMatrix({
  seeds: thresholds.defaultSeeds,
  maxTicks: thresholds.maxTicksPerRun,
  thresholds: thresholds as never,
});

const cells = result.cells.map((c) => {
  const last = c.traces[c.traces.length - 1];
  return {
    archetypeId: c.archetypeId,
    style: c.style,
    seed: c.seed,
    status: c.status,
    stuck: c.stuck,
    bored: c.bored,
    dominance: c.dominance,
    burnedOut: c.summary.burnedOut,
    hollowCount: c.summary.hollowCount,
    reignitedCount: c.summary.reignitedCount,
    tracesLength: c.traces.length,
    lastFingerprint: last?.fingerprint ?? null,
    lastTick: last?.tick ?? null,
    lastMeaningfulChoices: last?.meaningfulChoices ?? null,
    lastActionCount: last?.actionCount ?? null,
    error: c.error ?? null,
  };
});

const ok = cells.filter((c) => c.status === 'OK');
const pending = cells.filter((c) => c.status === 'API_PENDING');
const errors = cells.filter((c) => c.status === 'ERROR');
const stuck = ok.filter((c) => c.stuck);
const bored = ok.filter((c) => c.bored);
const dominanceBreaches = ok.filter((c) => c.dominance.breached);
const burned = ok.filter((c) => c.burnedOut);
const hollowTotal = ok.reduce((a, c) => a + c.hollowCount, 0);
const reignitedTotal = ok.reduce((a, c) => a + c.reignitedCount, 0);

const aggregates = {
  matrixStatus: result.status,
  cellCount: cells.length,
  okCount: ok.length,
  apiPendingCount: pending.length,
  errorCount: errors.length,
  stuckCount: stuck.length,
  stuckRate: ok.length ? stuck.length / ok.length : null,
  boredCount: bored.length,
  boredRate: ok.length ? bored.length / ok.length : null,
  methodDominanceBreaches: dominanceBreaches.map(
    (c) => `${c.archetypeId}/${c.style}/seed${c.seed}:${c.dominance.dominantMethodId}@${c.dominance.maxPickRate.toFixed(3)}`,
  ),
  burnoutCount: burned.length,
  burnoutRate: ok.length ? burned.length / ok.length : null,
  hollowTotal,
  reignitedTotal,
  errorMessages: errors.map((c) => ({
    cell: `${c.archetypeId}/${c.style}/seed${c.seed}`,
    error: c.error,
  })),
};

const out = { generatedAt: new Date().toISOString(), thresholds, aggregates, cells };
console.log(JSON.stringify({ aggregates, sampleCells: cells.slice(0, 3) }, null, 2));

const dest = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../docs/qa/reports/_m3-matrix-raw.json',
);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`wrote ${dest}`);
