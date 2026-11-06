import { describe, expect, it } from 'vitest';
import { connectFabricApi, type FabricApi, type FabricWorld } from './fabric-api';
import {
  runFabricSuite,
  runFabricWithApi,
  evaluateWorld,
  type FabricSuiteResult,
} from './fabric-run';
import thresholds from './fabric-thresholds.json';
import {
  worldDiversity,
  peopleDiversity,
  historyCoherence,
  kinConnectedness,
  gapSpread,
  assertionViolationRate,
  determinismEqual,
  repeatLineRate,
} from './fabric-metrics';

/** In-test fake fabric producing diverse worlds + lines (no Forge). */
function createFakeFabricApi(opts?: {
  cloneWorlds?: boolean;
  violate?: boolean;
}): FabricApi {
  const clone = opts?.cloneWorlds ?? false;
  const violate = opts?.violate ?? false;

  return {
    generateWorld({ seed }) {
      const fingerprint = clone ? 'CLONE' : `world-${seed}`;
      const people = Array.from({ length: 4 }, (_, i) => ({
        id: `p-${seed}-${i}`,
        fingerprint: clone ? `person-${i}` : `person-${seed}-${i}`,
        vector: {
          warmth: ((seed * 17 + i * 3) % 100) / 100,
          bite: ((seed * 13 + i * 7) % 100) / 100,
        },
        lines: [
          {
            id: `line-${seed}-${i}`,
            text: clone ? 'templated hello' : `voice-${seed}-${i}`,
          },
        ],
      }));
      const world: FabricWorld = {
        seed,
        fingerprint,
        people,
        lines: people.flatMap((p) => p.lines ?? []),
        history: [
          { id: `h-${seed}-1`, at: 1 },
          { id: `h-${seed}-2`, at: 2 },
          { id: `h-${seed}-3`, at: 4 },
        ],
        historyCoherence: 1,
        kinEdges: [
          { from: people[0]!.id, to: people[1]!.id },
          { from: people[1]!.id, to: people[2]!.id },
          { from: people[2]!.id, to: people[3]!.id },
          { from: people[3]!.id, to: people[0]!.id },
        ],
        gapSites: [
          { id: `v-${seed}`, gap01: 0.05 },
          { id: `m-${seed}`, gap01: 0.5 },
          { id: `c-${seed}`, gap01: 0.95 },
        ],
        assertions: violate
          ? [{ ok: false, violationId: 'voice' }, { ok: true }]
          : [{ ok: true }, { ok: true }],
      };
      return world;
    },
  };
}

describe('fabric-run', () => {
  it('live runFabricSuite is OK once Forge fabric facade exports generateWorld', async () => {
    const live = await connectFabricApi();
    expect(live).not.toBeNull();
    expect(typeof live!.assertVoice).toBe('function');
    expect(typeof live!.runFabricAssertions).toBe('function');
    const result = await runFabricSuite({ seeds: [1, 2, 3] });
    expect(result.status).toBe('OK');
    expect(result.cells.length).toBe(3);
    for (const cell of result.cells) {
      expect(cell.status).toBe('OK');
      expect(cell.world?.fingerprint).toBeTruthy();
    }
    expect(result.aggregates.determinism).toBe(true);
    // Stub scaffold lines must fail assertVoice — floor stays at cap 0 (honest fail).
    expect(result.aggregates.assertionViolationRate).toBeGreaterThan(0);
    expect(result.aggregates.assertionViolationRate).toBeGreaterThan(
      thresholds.assertionViolationRateCap,
    );
  });

  it('documents API_PENDING cell shape when no api is supplied to pending helper path', async () => {
    // runFabricWithApi always OK; pending only when connect returns null.
    // Keep fake path as the offline unit contract.
    const api = createFakeFabricApi();
    const result = await runFabricWithApi(api, { seeds: [1], thresholds });
    expect(result.status).toBe('OK');
    expect(result.cells[0]!.status).toBe('OK');
  });

  it('runFabricWithApi on fake produces OK cells and aggregate metrics', async () => {
    const api = createFakeFabricApi();
    const result = await runFabricWithApi(api, {
      seeds: [1, 2, 3, 5],
      thresholds,
    });
    expect(result.status).toBe('OK');
    expect(result.cells.every((c) => c.status === 'OK')).toBe(true);
    expect(result.aggregates.worldDiversity).toBe(1);
    expect(result.aggregates.peopleDiversity).toBeGreaterThan(
      thresholds.peopleDiversityFloor,
    );
    expect(result.aggregates.historyCoherence).toBeGreaterThanOrEqual(
      thresholds.historyCoherenceFloor,
    );
    expect(result.aggregates.kinConnectedness).toBeGreaterThanOrEqual(
      thresholds.kinConnectednessFloor,
    );
    expect(result.aggregates.gapSpread).toBeGreaterThanOrEqual(
      thresholds.gapSpreadFloor,
    );
    expect(result.aggregates.assertionViolationRate).toBe(0);
    expect(result.aggregates.repeatLineRate).toBeLessThanOrEqual(
      thresholds.repeatLineRateCap,
    );
    expect(result.aggregates.determinism).toBe(true);
  });

  it('evaluateWorld wires metric helpers on a fake world shape', () => {
    const api = createFakeFabricApi();
    const w = api.generateWorld!({ seed: 11 }) as FabricWorld;
    const cell = evaluateWorld(w, thresholds);
    expect(cell.status).toBe('OK');
    expect(cell.peopleDiversity).toBe(peopleDiversity(w.people));
    expect(cell.historyCoherence).toBe(historyCoherence(w));
    expect(cell.kinConnectedness).toBe(
      kinConnectedness(
        w.people.map((p) => p.id),
        w.kinEdges ?? [],
      ),
    );
    expect(cell.gapSpread).toBe(gapSpread(w.gapSites ?? []));
    expect(cell.assertionViolationRate).toBe(
      assertionViolationRate(w.assertions ?? []),
    );
    expect(cell.repeatLineRate).toBe(
      repeatLineRate(w.lines ?? w.people.flatMap((p) => p.lines ?? [])),
    );
  });

  it('cloned worlds drop worldDiversity; violations raise rate', async () => {
    const api = createFakeFabricApi({ cloneWorlds: true, violate: true });
    const result = await runFabricWithApi(api, {
      seeds: [1, 2, 3],
      thresholds,
    });
    expect(worldDiversity(result.cells.map((c) => c.world!).filter(Boolean))).toBe(0);
    expect(result.aggregates.worldDiversity).toBe(0);
    expect(result.aggregates.assertionViolationRate).toBeGreaterThan(0);
    expect(result.aggregates.repeatLineRate).toBeGreaterThan(
      thresholds.repeatLineRateCap,
    );
  });


  it('live assertVoice / runFabricAssertions overrides baked ok assertions', async () => {
    const api: FabricApi = {
      generateWorld({ seed }) {
        return {
          seed,
          fingerprint: `world-${seed}`,
          people: [
            {
              id: `p-${seed}`,
              fingerprint: `fp-${seed}`,
              lines: [
                { id: `l-${seed}`, text: `stub-voice-${seed}-0` },
                { id: `l2-${seed}`, text: 'stub interpolated line' },
              ],
            },
          ],
          lines: [
            { id: `l-${seed}`, text: `stub-voice-${seed}-0` },
            { id: `l2-${seed}`, text: 'stub interpolated line' },
          ],
          // Baked always-ok would make vacuous 0 without live helpers:
          assertions: [{ ok: true }, { ok: true }],
          history: [],
          kinEdges: [],
          gapSites: [{ id: 'g', gap01: 0 }, { id: 'c', gap01: 1 }],
        };
      },
      assertVoice(opts: unknown) {
        const o = (opts ?? {}) as { text?: string };
        const text = typeof o.text === 'string' ? o.text.trim() : '';
        if (
          !text ||
          text.startsWith('stub-voice-') ||
          text === 'stub interpolated line'
        ) {
          return { ok: false, violationId: 'scaffold_line' };
        }
        return { ok: true };
      },
      runFabricAssertions(opts: unknown) {
        const list = Array.isArray(opts) ? opts : [];
        return list.map((item) => api.assertVoice!(item));
      },
    };
    const result = await runFabricWithApi(api, { seeds: [1, 2], thresholds });
    expect(result.aggregates.assertionViolationRate).toBe(1);
    expect(result.cells.every((c) => c.assertionViolationRate === 1)).toBe(true);
  });

  it('fake path without assert helpers still uses baked ok assertions → rate 0', async () => {
    const api = createFakeFabricApi();
    expect(api.assertVoice).toBeUndefined();
    expect(api.runFabricAssertions).toBeUndefined();
    const result = await runFabricWithApi(api, { seeds: [1], thresholds });
    expect(result.aggregates.assertionViolationRate).toBe(0);
  });

  it('determinism helper: two same-seed fake worlds deep-equal', async () => {
    const api = createFakeFabricApi();
    const a = await api.generateWorld!({ seed: 42 });
    const b = await api.generateWorld!({ seed: 42 });
    expect(determinismEqual(a, b)).toBe(true);
    const c = await api.generateWorld!({ seed: 43 });
    expect(determinismEqual(a, c)).toBe(false);
  });
});
