import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../../../src/sim/gen/world';
import { createStampRasterSource } from '../../../../src/sim/map/stamp-raster';
import { layoutWorld } from '../../../../src/sim/map/world-layout';
import { createTerrainAccess } from '../../../../src/sim/map/terrain-access';
import { buildRoads } from '../../../../src/sim/map/stamp-raster';

const world = generateWorld({ seed: 42, includeAnchors: true, peopleCount: 60 });
const layout = layoutWorld(world, 42);

function sweepAll() {
  const src = createStampRasterSource(world, 42);
  const props = [];
  const s0 = layout.settlements[0]!;
  const c0 = Math.floor(s0.q / 32), r0 = Math.floor(s0.r / 32);
  for (let cy = r0 - 12; cy < r0 + 12; cy++) for (let cx = c0 - 12; cx < c0 + 12; cx++) props.push(...src.getChunk({ cx, cy }).props);
  return props;
}
const sweep = () => sweepAll().filter((p) => p.id.startsWith('scatter_'));
/** Camps and mines alone are sparse (0.004 per 4-tile forest/hills cell): ~50 here, vs >200 when scatter also made fields. */
const SCATTER_MIN = 20;

describe('density scatter between towns', () => {
  const all = sweepAll();
  const props = all.filter((p) => p.id.startsWith('scatter_'));
  const farmProps = all.filter((p) => p.id.startsWith('dress_farmstead_') || p.id.startsWith('dress_field_'));

  // Farms (farmsteads, fenced fields) moved out of scatter into structured features
  // (features.json + ladder/dress.ts, emitted as dress_* props): scatter.json sets their
  // chances to 0 and keeps only camps and mines. See PLAN.md "Wilderness".
  it('is deterministic and keeps camps and mines; farms come from features, not scatter', () => {
    expect(sweep()).toEqual(props);
    const types = new Set(props.map((p) => p.type));
    for (const t of ['camp', 'mine']) expect(types.has(t)).toBe(true);
    for (const t of ['field', 'farmstead']) expect(types.has(t)).toBe(false);
    expect(props.length).toBeGreaterThan(SCATTER_MIN);
    const dressed = new Set(farmProps.map((p) => p.type));
    for (const t of ['field', 'farmstead']) expect(dressed.has(t)).toBe(true);
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
