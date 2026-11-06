import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../../src/sim/gen/world';
import { WALK_MINUTES_SPINE, TILES_PER_MINUTE } from '../../../src/sim/map/constants';
import { layoutWorld } from '../../../src/sim/map/world-layout';

const SOFT_CAP = 200;
const MIN_SPINE =
  Math.floor(0.8 * WALK_MINUTES_SPINE * TILES_PER_MINUTE);

function lineCount(rel: string): number {
  return readFileSync(rel, 'utf8').split('\n').length;
}

describe('WorldLayout at minutes-scale spacing', () => {
  it('places spine neighbors at walk-scale Manhattan distance', () => {
    const world = generateWorld({ seed: 7, peopleCount: 8 });
    const layout = layoutWorld(world, 7);
    expect(layout.settlements.length).toBeGreaterThanOrEqual(3);
    const [a, b] = layout.settlements;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    const d = Math.abs(a!.q - b!.q) + Math.abs(a!.r - b!.r);
    expect(d).toBeGreaterThanOrEqual(MIN_SPINE);
  });

  it('is deterministic for the same seed', () => {
    const world = generateWorld({ seed: 7, peopleCount: 8 });
    const a = layoutWorld(world, 7);
    const b = layoutWorld(world, 7);
    expect(a).toEqual(b);
  });

  it('maps routes to settlement ids', () => {
    const world = generateWorld({ seed: 7, peopleCount: 8 });
    const layout = layoutWorld(world, 7);
    const ids = new Set(layout.settlements.map((s) => s.id));
    expect(layout.routes.length).toBeGreaterThanOrEqual(1);
    for (const route of layout.routes) {
      expect(ids.has(route.from)).toBe(true);
      expect(ids.has(route.to)).toBe(true);
    }
  });

  it('layout modules stay under soft line cap', () => {
    for (const rel of [
      'src/sim/map/constants.ts',
      'src/sim/map/world-layout.ts',
    ]) {
      expect(lineCount(rel), rel).toBeLessThanOrEqual(SOFT_CAP);
    }
  });
});
