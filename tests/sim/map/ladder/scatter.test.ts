import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../../../src/sim/gen/world';
import { createStampRasterSource } from '../../../../src/sim/map/stamp-raster';
import { layoutWorld } from '../../../../src/sim/map/world-layout';
import { createTerrainAccess } from '../../../../src/sim/map/terrain-access';
import { buildRoads } from '../../../../src/sim/map/stamp-raster';

const world = generateWorld({ seed: 42, includeAnchors: true, peopleCount: 60 });
const layout = layoutWorld(world, 42);

function sweep() {
  const src = createStampRasterSource(world, 42);
  const props = [];
  const s0 = layout.settlements[0]!;
  const c0 = Math.floor(s0.q / 32), r0 = Math.floor(s0.r / 32);
  for (let cy = r0 - 12; cy < r0 + 12; cy++) for (let cx = c0 - 12; cx < c0 + 12; cx++) props.push(...src.getChunk({ cx, cy }).props);
  return props.filter((p) => p.id.startsWith('scatter_'));
}

describe('density scatter between towns', () => {
  const props = sweep();

  it('is deterministic and fills the land with farms, fields, camps and mines', () => {
    expect(sweep()).toEqual(props);
    const types = new Set(props.map((p) => p.type));
    for (const t of ['field', 'farmstead', 'camp', 'mine']) expect(types.has(t)).toBe(true);
    expect(props.length).toBeGreaterThan(200);
  });

  it('never lands on water, roads or inside town clearance', () => {
    const terrain = createTerrainAccess(layout, 42);
    const roads = buildRoads(layout);
    for (const p of props) {
      const { x: q, y: r } = p.position;
      expect(terrain.biome(q, r)).not.toBe('water');
      expect(roads.has(`${q},${r}`)).toBe(false);
      expect(Math.min(...layout.settlements.map((s) => Math.hypot(q - s.q, r - s.r)))).toBeGreaterThan(40);
    }
    expect(new Set(props.map((p) => p.id)).size).toBe(props.length);
  });
});
