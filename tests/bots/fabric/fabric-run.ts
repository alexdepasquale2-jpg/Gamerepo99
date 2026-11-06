import {
  connectFabricApi,
  type FabricApi,
  type FabricWorld,
} from './fabric-api';
import {
  worldDiversity,
  determinismEqual,
} from './fabric-metrics';
import defaultThresholds from './fabric-thresholds.json';
import {
  aggregateCells,
  emptyAggregates,
  evaluateWorld,
  pendingCell,
  resolveAssertions,
  type FabricAggregates,
  type FabricCell,
  type FabricSuiteResult,
  type FabricThresholds,
} from './fabric-report';

export type {
  FabricThresholds,
  CellStatus,
  FabricCell,
  FabricAggregates,
  FabricSuiteResult,
} from './fabric-report';

export {
  collectWorldLines,
  resolveAssertions,
  evaluateWorld,
} from './fabric-report';

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

  const aggregates: FabricAggregates = aggregateCells(cells, worldDiversity);

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
