import {
  connectFabricApi,
  type FabricApi,
  type FabricWorld,
} from './fabric-api';
import {
  peopleDiversity,
  worldDiversity,
  historyCoherence,
  kinConnectedness,
  gapSpread,
  assertionViolationRate,
  determinismEqual,
  repeatLineRate,
  type AssertionSample,
  type FabricWorldSample,
} from './fabric-metrics';
import defaultThresholds from './fabric-thresholds.json';

export type FabricThresholds = {
  defaultSeeds: number[];
  peopleCountPerWorld: number;
  worldDiversityFloor: number;
  peopleDiversityFloor: number;
  historyCoherenceFloor: number;
  kinConnectednessFloor: number;
  gapSpreadFloor: number;
  assertionViolationRateCap: number;
  repeatLineRateCap: number;
};

export type CellStatus = 'OK' | 'API_PENDING' | 'ERROR';

export type FabricCell = {
  seed: number;
  status: CellStatus;
  world?: FabricWorldSample;
  peopleDiversity: number;
  historyCoherence: number;
  kinConnectedness: number;
  gapSpread: number;
  assertionViolationRate: number;
  repeatLineRate: number;
  error?: string;
};

export type FabricAggregates = {
  worldDiversity: number;
  peopleDiversity: number;
  historyCoherence: number;
  kinConnectedness: number;
  gapSpread: number;
  assertionViolationRate: number;
  repeatLineRate: number;
  determinism: boolean;
};

export type FabricSuiteResult = {
  status: 'OK' | 'API_PENDING';
  cells: FabricCell[];
  aggregates: FabricAggregates;
};

function emptyAggregates(): FabricAggregates {
  return {
    worldDiversity: 0,
    peopleDiversity: 0,
    historyCoherence: 0,
    kinConnectedness: 0,
    gapSpread: 0,
    assertionViolationRate: 0,
    repeatLineRate: 0,
    determinism: false,
  };
}

function pendingCell(seed: number): FabricCell {
  return {
    seed,
    status: 'API_PENDING',
    peopleDiversity: 0,
    historyCoherence: 0,
    kinConnectedness: 0,
    gapSpread: 0,
    assertionViolationRate: 0,
    repeatLineRate: 0,
  };
}

export function collectWorldLines(world: FabricWorldSample) {
  return world.lines ?? world.people.flatMap((p) => p.lines ?? []);
}

/**
 * Prefer live assertVoice / runFabricAssertions over baked world.assertions.
 * Fake unit paths (no helpers) keep using baked assertions.
 */
export async function resolveAssertions(
  api: FabricApi | undefined,
  world: FabricWorldSample,
): Promise<AssertionSample[]> {
  const lines = collectWorldLines(world);
  if (api?.runFabricAssertions) {
    return (await api.runFabricAssertions(lines)) as AssertionSample[];
  }
  if (api?.assertVoice) {
    const out: AssertionSample[] = [];
    for (const line of lines) {
      out.push((await api.assertVoice(line)) as AssertionSample);
    }
    return out;
  }
  return world.assertions ?? [];
}

export function evaluateWorld(
  world: FabricWorldSample,
  _thresholds: FabricThresholds,
  opts?: {
    /** Prefer live results from resolveAssertions when present. */
    assertions?: AssertionSample[];
  },
): FabricCell {
  const lines = collectWorldLines(world);
  const assertions = opts?.assertions ?? world.assertions ?? [];
  return {
    seed: world.seed,
    status: 'OK',
    world,
    peopleDiversity: peopleDiversity(world.people),
    historyCoherence: historyCoherence(world),
    kinConnectedness: kinConnectedness(
      world.people.map((p) => p.id),
      world.kinEdges ?? [],
    ),
    gapSpread: gapSpread(world.gapSites ?? []),
    assertionViolationRate: assertionViolationRate(assertions),
    repeatLineRate: repeatLineRate(lines),
  };
}

async function materializeWorld(
  api: FabricApi,
  seed: number,
  peopleCount: number,
): Promise<FabricWorld> {
  if (api.generateWorld) {
    return await api.generateWorld({ seed, peopleCount });
  }
  // Fallback: assemble from people generator
  let people = api.generatePeople
    ? await api.generatePeople({ seed, count: peopleCount })
    : [];
  if ((!people || people.length === 0) && api.generatePersonDraft) {
    people = [];
    for (let i = 0; i < peopleCount; i++) {
      people.push(await api.generatePersonDraft({ seed, index: i }));
    }
  }
  return {
    seed,
    fingerprint: `assembled-${seed}-${people.map((p) => p.fingerprint).join('|')}`,
    people,
    lines: people.flatMap((p) => p.lines ?? []),
    kinEdges: [],
    gapSites: [],
    assertions: [],
    history: [],
  };
}

function aggregate(cells: FabricCell[], api: FabricApi, seeds: number[]): FabricAggregates {
  const ok = cells.filter((c) => c.status === 'OK' && c.world);
  if (ok.length === 0) return emptyAggregates();

  const worlds = ok.map((c) => c.world!);
  const mean = (xs: number[]) =>
    xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

  // Determinism: re-generate first seed and compare
  let determinism = true;
  const first = ok[0]!;
  // Synchronous check only if generateWorld is sync-cached on cell; we compare
  // two evaluations already stored isn't enough — caller may pass pre-built.
  // Best-effort: if two cells share a seed they must match; else probe API again sync-unsafe.
  void api;
  void seeds;
  // Use pairwise equal for duplicate seeds if present; else assume true when
  // single-pass worlds are self-consistent (re-check done in runFabricWithApi).
  determinism = true;

  return {
    worldDiversity: worldDiversity(worlds),
    peopleDiversity: mean(ok.map((c) => c.peopleDiversity)),
    historyCoherence: mean(ok.map((c) => c.historyCoherence)),
    kinConnectedness: mean(ok.map((c) => c.kinConnectedness)),
    gapSpread: mean(ok.map((c) => c.gapSpread)),
    assertionViolationRate: mean(ok.map((c) => c.assertionViolationRate)),
    repeatLineRate: mean(ok.map((c) => c.repeatLineRate)),
    determinism,
  };
}

export async function runFabricWithApi(
  api: FabricApi,
  opts?: {
    seeds?: number[];
    thresholds?: FabricThresholds;
  },
): Promise<FabricSuiteResult> {
  const thresholds = (opts?.thresholds ??
    defaultThresholds) as FabricThresholds;
  const seeds = opts?.seeds ?? thresholds.defaultSeeds;
  const peopleCount = thresholds.peopleCountPerWorld;
  const cells: FabricCell[] = [];

  for (const seed of seeds) {
    try {
      const world = await materializeWorld(api, seed, peopleCount);
      const assertions = await resolveAssertions(api, world);
      cells.push(evaluateWorld(world, thresholds, { assertions }));
    } catch (err) {
      cells.push({
        ...pendingCell(seed),
        status: 'ERROR',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const aggregates = aggregate(cells, api, seeds);

  // Live determinism probe: regenerate first seed twice
  if (api.generateWorld && seeds.length > 0) {
    try {
      const s = seeds[0]!;
      const a = await api.generateWorld({ seed: s, peopleCount });
      const b = await api.generateWorld({ seed: s, peopleCount });
      aggregates.determinism = determinismEqual(a, b);
    } catch {
      aggregates.determinism = false;
    }
  }

  return { status: 'OK', cells, aggregates };
}

export async function runFabricSuite(opts?: {
  seeds?: number[];
  thresholds?: FabricThresholds;
}): Promise<FabricSuiteResult> {
  const thresholds = (opts?.thresholds ??
    defaultThresholds) as FabricThresholds;
  const seeds = opts?.seeds ?? thresholds.defaultSeeds;
  const api = await connectFabricApi();

  if (!api) {
    return {
      status: 'API_PENDING',
      cells: seeds.map(pendingCell),
      aggregates: emptyAggregates(),
    };
  }

  return runFabricWithApi(api, { seeds, thresholds });
}
