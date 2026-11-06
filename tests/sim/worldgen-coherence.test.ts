import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../src/sim/gen/world';
import { loadHistoryTables } from '../../src/sim/gen/load/load-history';
import { historyChainCoherent } from '../../src/sim/gen/society/history-gen';
import { assertWorldCoherence } from '../../src/sim/dyn/coherence';

describe('worldgen coherence', () => {
  it('history chainsFrom order is coherent for seed 42', () => {
    const tables = loadHistoryTables();
    const w = generateWorld({ seed: 42, peopleCount: 8 });
    expect(historyChainCoherent(w.history ?? [], tables)).toBe(true);
  });

  it('assertWorldCoherence ok for seed 42 gapSites', () => {
    const w = generateWorld({ seed: 42, peopleCount: 8 });
    const result = assertWorldCoherence({ gapSites: w.gapSites });
    expect(result.ok).toBe(true);
  });

  it('history beat ids come from loaded tables', () => {
    const tables = loadHistoryTables();
    const ids = new Set(tables.historyBeats.map((b) => b.id));
    expect(ids.size).toBeGreaterThanOrEqual(15);
    const w = generateWorld({ seed: 7, peopleCount: 8 });
    for (const h of w.history ?? []) {
      expect(ids.has(h.id)).toBe(true);
    }
  });
});
