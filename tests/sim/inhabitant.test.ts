import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadData } from '../../src/sim/load-data';
import { assembleInhabitant, canEnterTile } from '../../src/sim/inhabitant';

describe('inhabitant assembly', () => {
  it('marrow blocked on door_front, ivy not', () => {
    const d = loadData();
    const m = assembleInhabitant(d, 'marrow');
    const i = assembleInhabitant(d, 'ivy_quill');
    expect(canEnterTile(m, ['door_front'])).toBe(false);
    expect(canEnterTile(i, ['door_front'])).toBe(true);
  });

  it('brood has bodySlots 3 and activeBodiesMax 1', () => {
    const b = assembleInhabitant(loadData(), 'basilisk_brood');
    expect(b.embodiment.bodySlots).toBe(3);
    expect(b.embodiment.activeBodiesMax).toBe(1);
  });

  it('copies hook ids from archetype and spark profile without archetype switches', () => {
    const d = loadData();
    const m = assembleInhabitant(d, 'marrow');
    expect(m.hookIds).toContain('cost_loneliness_tax');
    expect(m.hookIds).toContain('refusal_shame_child');
    expect(m.hookIds).toContain('recovery_den_hearth');
    expect(m.spark).toBe(88); // spark_den_ogre sparkStart (Loom pacing)
    expect(m.townId).toBe('ashford');

    const src = readFileSync('src/sim/inhabitant.ts', 'utf8');
    expect(src).not.toMatch(/archetypeId\s*===\s*['"]/);
  });
});
