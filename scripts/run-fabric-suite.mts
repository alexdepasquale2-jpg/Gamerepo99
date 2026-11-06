import { runFabricSuite } from '../tests/bots/fabric/fabric-run';
import thresholds from '../tests/bots/fabric/fabric-thresholds.json';

const result = await runFabricSuite({
  seeds: thresholds.defaultSeeds,
  thresholds: thresholds as never,
});
const out = {
  status: result.status,
  cellCount: result.cells.length,
  cellStatuses: [...new Set(result.cells.map((c) => c.status))],
  aggregates: result.aggregates,
  sampleFingerprints: result.cells.slice(0, 5).map((c) => c.world?.fingerprint),
  perSeed: result.cells.map((c) => ({
    seed: c.seed,
    status: c.status,
    fp: c.world?.fingerprint,
    peopleDiversity: c.peopleDiversity,
    historyCoherence: c.historyCoherence,
    kinConnectedness: c.kinConnectedness,
    gapSpread: c.gapSpread,
    assertionViolationRate: c.assertionViolationRate,
    repeatLineRate: c.repeatLineRate,
  })),
};
console.log(JSON.stringify(out, null, 2));
