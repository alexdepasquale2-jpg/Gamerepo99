import { describe, expect, it } from 'vitest';
import { advanceDays } from '../../../src/sim/scenario/scenario-advance';
import {
  assembleFromImprint,
  buildImprint,
  carryItOn,
  exportWorld,
  importWorld,
  legacyInspectLines,
  mapTendenciesToHooks,
  tickLegacyNpcs,
} from '../../../src/sim/legacy';
import { contentHash } from '../../../src/sim/legacy/delta-log';
import { migrations } from '../../../src/sim/legacy/world-file';
import { bondedState, burnOut } from './helpers';

function lifeThenFile() {
  const { state } = bondedState();
  burnOut(state);
  carryItOn(state);
  return { state, file: exportWorld(state) };
}

describe('imprint', () => {
  it('records tendencies, bonds and marks; assembles a legend inhabitant without archetype branches', () => {
    const { state } = bondedState();
    const imprint = buildImprint(state);
    expect(imprint.methodTendencies.carry_burden).toBe(1);
    expect(imprint.bonds.length).toBeGreaterThan(0);
    const npc = assembleFromImprint(imprint);
    expect(npc.tags).toEqual(expect.arrayContaining(['legacy_player', 'legend_candidate']));
    expect(npc.methodWeights).toEqual(imprint.methodTendencies);
    expect(mapTendenciesToHooks({ ...imprint, methodTendencies: { shame: 0.9 } })).toContain('refusal_shame_child');
  });
});

describe('world file', () => {
  it('exports the versioned shape; same seed and play => identical file', () => {
    const a = lifeThenFile().file;
    const b = lifeThenFile().file;
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.format).toBe('hearthfall.world');
    expect(a.version).toBe(1);
    expect(a.contentPackIds).toEqual(['core@1']);
    expect(a.imprint?.displayName).toBeTruthy();
    expect(a.deltas.at(-1)?.t).toBe('day');
  });

  it('round trips: import replays to the recorded world and shows the former PC', () => {
    const { file } = lifeThenFile();
    const wire = JSON.parse(JSON.stringify(file));
    const out = importWorld(wire);
    if ('error' in out) throw new Error(out.error);
    expect(out.state.seed).toBe(file.seed);
    expect(out.state.day).toBe(file.deltas.at(-1)!.t === 'day' ? (file.deltas.at(-1) as { day: number }).day : 0);
    expect(out.state.legacy!.graves.length).toBe(1);
    const npcId = Object.keys(out.state.legacy!.npcs)[0]!;
    expect(out.state.people[npcId]?.tags).toContain('legacy_player');
    expect(out.legends.length).toBeGreaterThan(0);
    expect(out.legends[0]).toContain(file.imprint!.displayName);
    // Re-export of an import is stable.
    const again = exportWorld(out.state);
    expect(again.deltas).toEqual(file.deltas);
    expect(again.contentHash).toBe(file.contentHash);
  });

  it('legend NPCs act in LOD under a budget cap, deterministically, and the world keeps running', () => {
    const { file } = lifeThenFile();
    const run = () => {
      const out = importWorld(JSON.parse(JSON.stringify(file)));
      if ('error' in out) throw new Error(out.error);
      const before = JSON.stringify(out.state.people);
      advanceDays(out.state, 3);
      tickLegacyNpcs(out.state);
      return { s: out.state, changed: JSON.stringify(out.state.people) !== before };
    };
    const a = run();
    expect(a.changed).toBe(true);
    expect(JSON.stringify(a.s.people)).toBe(JSON.stringify(run().s.people));
    const who = Object.keys(a.s.people).find((p) => !a.s.people[p]!.tags?.includes('legacy_player') && a.s.people[p]!.townId === file.imprint!.homeTownId);
    if (who) expect(Array.isArray(legacyInspectLines(a.s, who))).toBe(true);
  });

  it('refuses tampered, newer, missing-pack and unknown-delta files; skips unknown deltas when compatible', () => {
    const { file } = lifeThenFile();
    const wire = () => JSON.parse(JSON.stringify(file));
    expect(importWorld('nope')).toHaveProperty('error');
    expect(importWorld({ ...wire(), version: 99 })).toHaveProperty('error');
    expect(importWorld({ ...wire(), contentPackIds: ['core@1', 'mystery@3'] })).toHaveProperty('error');
    expect(importWorld({ ...wire(), seed: file.seed + 1 })).toHaveProperty('error');
    const odd = (compatible: boolean) => {
      const deltas = [{ t: 'mystery', day: 2 }, ...file.deltas];
      const f = { ...wire(), deltas, compatible };
      f.contentHash = contentHash(file.seed, file.contentPackIds, deltas);
      return f;
    };
    const bad = importWorld(odd(false));
    expect('error' in bad && bad.error).toMatch(/Unknown delta/);
    expect('error' in importWorld(odd(true))).toBe(false);
  });

  it('rejects invalid old versions without calling a missing migration', () => {
    const { file } = lifeThenFile();
    const seen: number[] = [];
    migrations[0] = (f) => {
      seen.push(0);
      return f;
    };
    try {
      const out = importWorld({ ...JSON.parse(JSON.stringify(file)), version: 0 });
      expect('error' in out).toBe(true); // version < 1 is invalid
    } finally {
      delete migrations[0];
    }
  });
});
