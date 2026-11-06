import { describe, expect, it } from 'vitest';
import {
  connectFabricApi,
  FABRIC_EXPORT_CANDIDATES,
  type FabricApi,
  type FabricWorld,
} from './fabric-api';

describe('connectFabricApi', () => {
  it('connects to Forge fabric facade (generateWorld / generatePeople)', async () => {
    const api = await connectFabricApi();
    expect(api).not.toBeNull();
    expect(typeof api!.generateWorld).toBe('function');
    expect(typeof api!.generatePeople).toBe('function');
    const w = await api!.generateWorld!({ seed: 11 });
    expect(w.seed).toBe(11);
    expect(w.fingerprint.length).toBeGreaterThan(0);
    expect(w.people.length).toBeGreaterThanOrEqual(1);
  });

  it('lists expected Forge export candidates including worldgen helpers', () => {
    for (const name of [
      'createFabric',
      'generatePeople',
      'generatePersonDraft',
      'interpolateLine',
      'assertVoice',
      'generateWorld',
      'createWorldFabric',
      'worldFingerprint',
      'historySummary',
      'kinGraph',
      'gapAxisSpread',
      'assertionResults',
    ]) {
      expect(FABRIC_EXPORT_CANDIDATES).toContain(name);
    }
  });

  it('FabricApi / FabricWorld contracts are structurally usable via a fake', async () => {
    const fakeWorld: FabricWorld = {
      seed: 1,
      fingerprint: 'world-1',
      people: [
        {
          id: 'p1',
          fingerprint: 'person-1',
          vector: { warmth: 0.2 },
          lines: [{ id: 'l1', text: 'hello' }],
        },
      ],
      history: [{ id: 'h1', at: 1 }],
      historyCoherence: 1,
      kinEdges: [],
      gapSites: [{ id: 's1', gap01: 0.3 }],
      assertions: [{ ok: true }],
    };
    const fake: FabricApi = {
      generateWorld: ({ seed }) => ({ ...fakeWorld, seed }),
      generatePeople: ({ seed, count = 1 }) =>
        Array.from({ length: count }, (_, i) => ({
          id: `p-${seed}-${i}`,
          fingerprint: `fp-${seed}-${i}`,
        })),
    };
    const w = await fake.generateWorld!({ seed: 9 });
    expect(w.fingerprint).toBe('world-1');
    expect(w.seed).toBe(9);
    const people = await fake.generatePeople!({ seed: 2, count: 3 });
    expect(people).toHaveLength(3);
  });
});
