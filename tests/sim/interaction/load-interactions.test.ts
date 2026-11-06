import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadData } from '../../../src/sim/load-data';
import {
  loadInteractionTables,
  loadMigrationMap,
} from '../../../src/sim/interaction/load-interactions';
import {
  createCompatRuntime,
  expandMethodAct,
} from '../../../src/sim/interaction/interaction-compat';

const person = { id: 'marta', flame01: 0.28, trust: 0.35, marks: {}, touchScore: 0, presence: 0, bond: 0, spark: 86 };

describe('loadInteractionTables', () => {
  it('loads catalog, scoring and indexed migration map', () => {
    const t = loadInteractionTables();
    expect(t.catalog.interactions.some((i) => i.id === 'talk_gentle')).toBe(true);
    expect(t.scoring.reignite.touchScoreMin).toBeGreaterThan(0);
    expect(t.migration.get('inspire')).toEqual(['talk_gentle']);
  });

  it('is exposed on DataTables via loadData()', () => {
    const d = loadData();
    expect(d.interactions.migration.get('carry_burden')).toEqual(['favor_do']);
    expect(d.interactions.catalog.interactions.length).toBeGreaterThan(0);
  });
});

describe('loadMigrationMap (pure)', () => {
  it('indexes a passed-in migration table', () => {
    const m = loadMigrationMap({ map: [{ methodId: 'x', recipeDefault: ['y', 'z'] }] });
    expect(m.get('x')).toEqual(['y', 'z']);
    expect(m.size).toBe(1);
  });
});

describe('compat takes data in', () => {
  it('expandMethodAct reads the migration map it is given', () => {
    const migration = new Map([['inspire', ['custom_talk']]]);
    expect(expandMethodAct(migration, 'inspire')).toBe('custom_talk');
    expect(expandMethodAct(migration, 'nope')).toBeUndefined();
  });

  it('createCompatRuntime builds from passed tables and carries migration', () => {
    const tables = loadInteractionTables();
    const rt = createCompatRuntime(tables, person);
    expect(rt.catalog.has('talk_gentle')).toBe(true);
    expect(rt.migration).toBe(tables.migration);
    expect(rt.people.get('marta')?.flame01).toBe(0.28);
  });

  it('interaction-compat.ts has no direct JSON imports', () => {
    const src = readFileSync(new URL('../../../src/sim/interaction/interaction-compat.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from\s+['"][^'"]+\.json['"]/);
  });
});
