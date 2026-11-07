/**
 * M4 living-world evidence probe (Probe harness) — PREP STUB.
 *
 * Prep only while M4 is on HOLD. Full go-time fill-in lands when Forge lists
 * all four modules (LOD + caravans + doctrine + letters) and cites green
 * validate/test/build. Until then this script soft-records API_PENDING for
 * missing modules and optionally takes a light LOD-only dawn sample.
 *
 * Does NOT write docs/qa/reports/m4-living-world.md (verdict is go-time only).
 * Does NOT run the living-world gate checklist or the Hybrid-C matrix.
 *
 * Run:  npx vite-node scripts/m4-living-world-evidence.mts
 * Out:  docs/qa/reports/_m4-living-world-evidence.json
 * Exit: 0 stub success · 2 crash
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureEconomyState, tickEconomyLod } from '../src/sim/economy/index.ts';
import { bootPlayState } from '../src/sim/play-session/play-session-state.ts';
import { advanceToDawn } from '../src/sim/scenario/scenario-advance.ts';
import type { SimState } from '../src/sim/types/runtime.ts';

const SEED = 42;
const SHORT_DAWNS = 3;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = resolve(ROOT, 'docs/qa/reports/_m4-living-world-evidence.json');

type ModuleStatus = 'OK' | 'STUB' | 'API_PENDING';

type ModuleReport = {
  status: ModuleStatus;
  path: string;
  present: boolean;
  notes: string[];
};

type LodSample = {
  attempted: boolean;
  seed: number;
  dawns: number;
  notes: string[];
  histogram: Record<string, number>;
  towns?: Record<string, { economyOptIn?: boolean; despair?: number; stock?: Record<string, number> }>;
  error?: string;
};

function modulePath(rel: string): string {
  return resolve(ROOT, rel);
}

function probeModule(rel: string, label: string): ModuleReport {
  const abs = modulePath(rel);
  const present = existsSync(abs);
  if (!present) {
    return {
      status: 'API_PENDING',
      path: rel,
      present: false,
      notes: [`${label} not in tree yet — await Forge; soft-skip (prep stub)`],
    };
  }
  return {
    status: 'STUB',
    path: rel,
    present: true,
    notes: [`${label} present; full evidence wiring deferred to go-time`],
  };
}

function juiceSince(state: SimState, before: number): string[] {
  return state.bus?.lastIds?.slice(before) ?? [];
}

function histogramOf(ids: string[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const id of ids) h[id] = (h[id] ?? 0) + 1;
  return h;
}

function snapshotTowns(state: SimState) {
  const out: LodSample['towns'] = {};
  for (const [id, t] of Object.entries(state.towns ?? {})) {
    out[id] = {
      economyOptIn: t.economyOptIn,
      despair: t.despair,
      stock: { ...(t.stock ?? {}) },
    };
  }
  return out;
}

/** Light LOD-only sample: seed 42, short dawn advance. Not the gate. */
function sampleLod(): LodSample {
  const notes: string[] = [
    'prep stub: short dawn sample only; full 10–20 dawn + determinism double-run at go-time',
  ];
  try {
    // Confirm export is reachable (also exercises ensureEconomyState path).
    void tickEconomyLod;
    const { state } = bootPlayState(SEED, 'marrow');
    ensureEconomyState(state);
    const juiceBefore = state.bus?.lastIds?.length ?? 0;
    for (let i = 0; i < SHORT_DAWNS; i++) advanceToDawn(state);
    const juice = juiceSince(state, juiceBefore);
    notes.push(`letters in flight=${state.letters?.flight.length ?? 0}`);
    notes.push(`LOD available; advanced ${SHORT_DAWNS} dawn(s) seed=${SEED}`);
    return {
      attempted: true,
      seed: SEED,
      dawns: SHORT_DAWNS,
      notes,
      histogram: histogramOf(juice),
      towns: snapshotTowns(state),
    };
  } catch (err) {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    return {
      attempted: true,
      seed: SEED,
      dawns: 0,
      notes: [...notes, 'LOD sample failed; recorded error, still stub-exit 0'],
      histogram: {},
      error: message,
    };
  }
}

function main(): number {
  const modules = {
    lod: {
      status: existsSync(modulePath('src/sim/economy/economy-lod.ts')) ? ('OK' as const) : ('API_PENDING' as const),
      path: 'src/sim/economy/economy-lod.ts',
      present: existsSync(modulePath('src/sim/economy/economy-lod.ts')),
      notes: existsSync(modulePath('src/sim/economy/economy-lod.ts'))
        ? ['packet-01 LOD in tree; light sample only (prep stub)']
        : ['LOD missing — unexpected on current tip'],
    },
    caravans: probeModule('src/sim/caravans.ts', 'caravans'),
    doctrine: probeModule('src/sim/doctrine-tick.ts', 'doctrine-tick'),
    letters: probeModule('src/sim/letters-scale.ts', 'letters-scale'),
  };

  const lod = modules.lod.present ? sampleLod() : {
    attempted: false,
    seed: SEED,
    dawns: 0,
    notes: ['LOD module absent; skipped sample'],
    histogram: {},
  };

  const report = {
    generatedAt: new Date().toISOString(),
    kind: 'm4-living-world-evidence',
    status: 'STUB' as const,
    prep: true,
    hold: true,
    notes: [
      'PREP STUB — living-world gate remains HOLD until Forge lists LOD+caravans+doctrine+letters + green validate/test/build.',
      'Do not treat this JSON as a go-time verdict. Full metrics + determinism double-run fill in later.',
      'Verdict file docs/qa/reports/m4-living-world.md is intentionally NOT written by this stub.',
    ],
    modules,
    lod,
    determinism: {
      attempted: false,
      note: 'full at go-time',
    },
    ok: true,
  };

  mkdirSync(dirname(DEST), { recursive: true });
  writeFileSync(DEST, JSON.stringify(report, null, 2) + '\n');
  console.error(`wrote ${DEST}`);
  console.log(
    `m4-living-world-evidence status=STUB prep=true ` +
      `lod=${modules.lod.status} caravans=${modules.caravans.status} ` +
      `doctrine=${modules.doctrine.status} letters=${modules.letters.status} ` +
      `lodSample=${lod.attempted ? 'yes' : 'no'}`,
  );
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(JSON.stringify({ status: 'ERROR', ok: false, error: message }, null, 2));
  process.exit(2);
}
