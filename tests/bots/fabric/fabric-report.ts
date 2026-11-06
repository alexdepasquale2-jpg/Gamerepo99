import {
  type FabricApi,
} from './fabric-api';
import {
  peopleDiversity,
  historyCoherence,
  kinConnectedness,
  gapSpread,
  assertionViolationRate,
  repeatLineRate,
  type AssertionSample,
  type FabricWorldSample,
} from './fabric-metrics';

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

export function emptyAggregates(): FabricAggregates {
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

export function pendingCell(seed: number): FabricCell {
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

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function aggregateCells(
  cells: FabricCell[],
  worldDiversityFn: (worlds: FabricWorldSample[]) => number,
): FabricAggregates {
  const ok = cells.filter((c) => c.status === 'OK' && c.world);
  if (ok.length === 0) return emptyAggregates();
  const worlds = ok.map((c) => c.world!);
  return {
    worldDiversity: worldDiversityFn(worlds),
    peopleDiversity: mean(ok.map((c) => c.peopleDiversity)),
    historyCoherence: mean(ok.map((c) => c.historyCoherence)),
    kinConnectedness: mean(ok.map((c) => c.kinConnectedness)),
    gapSpread: mean(ok.map((c) => c.gapSpread)),
    assertionViolationRate: mean(ok.map((c) => c.assertionViolationRate)),
    repeatLineRate: mean(ok.map((c) => c.repeatLineRate)),
    determinism: true,
  };
}
