import { describe, expect, it } from 'vitest';
import { advanceDays } from '../../../src/sim/scenario/scenario-advance';
import { readFileSync } from 'node:fs';
import {
  CURRENT_WORLD_VERSION,
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
    expect(a.version).toBe(CURRENT_WORLD_VERSION);
    expect(a.imprint?.generation).toBe(1);
    expect(a.imprint?.archetypeId).toBe('marrow');
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

describe('world file migrations', () => {
  const v1 = () => JSON.parse(readFileSync('tests/fixtures/world-v1.world.json', 'utf8'));

  it('the committed fixture really is a v1 file (no v2 fields)', () => {
    const f = v1();
    expect(f.version).toBe(1);
    expect(CURRENT_WORLD_VERSION).toBe(2);
    expect(f.imprint).not.toHaveProperty('generation');
    expect(f.imprint).not.toHaveProperty('archetypeId');
  });

  it('migration 1 -> 2 fills generation from the graves and infers the archetype', () => {
    const f = v1();
    const up = migrations[1]!(f);
    expect(up.imprint?.generation).toBe(2); // Marrow's grave, then Elias Boone's
    expect(up.imprint?.archetypeId).toBe('ivy_quill'); // the only human clerk body
    expect(up.deltas).toEqual(f.deltas); // hashed fields untouched
    expect(migrations[1]!({ ...f, imprint: null }).imprint).toBeNull();
    expect(migrations[1]!({ ...f, imprint: { ...f.imprint, generation: 5, archetypeId: 'marrow' } }).imprint).toMatchObject({ generation: 5, archetypeId: 'marrow' });
  });

  it('a v1 file imports transparently into the current version and lists the legends found', () => {
    const out = importWorld(v1());
    if ('error' in out) throw new Error(out.error);
    expect(out.fromVersion).toBe(1);
    expect(out.state.legacy!.lastImprint).toMatchObject({ displayName: 'Elias Boone', generation: 2, archetypeId: 'ivy_quill' });
    expect(out.state.legacy!.graves.map((g) => g.name).sort()).toEqual(['Elias Boone', 'Marrow']);
    const names = out.arrival.names;
    expect(names.map((n) => [n.kind, n.name])).toEqual([
      ['legend', 'Elias Boone'],
      ['grave', 'Marrow'],
    ]);
    expect(names[0]).toMatchObject({ archetypeName: 'Ivy Quill', generation: 2, townName: "Marrow's Den" });
    expect(names[0]!.deeds).toEqual(["carried other people's burdens", 'made people believe again', 'rekindled Clara Whitby']);
    expect(out.arrival.lines[0]).toBe("Two names you don't know are spoken of in Marrow's Den: Elias Boone and Marrow.");
    expect(out.arrival.lines[1]).toBe("Elias Boone (Ivy Quill), second of their line. They carried other people's burdens, made people believe again and rekindled Clara Whitby.");
    expect(out.arrival.lines[2]).toMatch(/^Marrow: a stone in Marrow's Den, laid on day 5/);
    // Re-export writes the current version, with the migrated fields, and the same hashed content.
    const again = exportWorld(out.state);
    expect(again.version).toBe(CURRENT_WORLD_VERSION);
    expect(again.imprint).toMatchObject({ generation: 2, archetypeId: 'ivy_quill' });
    expect(again.contentHash).toBe(v1().contentHash);
    const back = importWorld(JSON.parse(JSON.stringify(again)));
    if ('error' in back) throw new Error(back.error);
    expect(back.fromVersion).toBe(CURRENT_WORLD_VERSION);
    expect(back.arrival.lines).toEqual(out.arrival.lines);
  });

  it('checks integrity on the file as written, before migrating', () => {
    const f = v1();
    f.deltas.find((d: { t: string }) => d.t === 'grave').name = 'Someone Else';
    const out = importWorld(f);
    expect('error' in out && out.error).toMatch(/hash mismatch/);
    const g = v1();
    g.worldDigest = 'deadbeef';
    expect('error' in importWorld(g) && (importWorld(g) as { error: string }).error).toMatch(/did not reproduce/);
  });

  it('refuses a newer-than-known file with a friendly message', () => {
    const out = importWorld({ ...v1(), version: CURRENT_WORLD_VERSION + 1 });
    expect('error' in out && out.error).toMatch(/newer version of the game.*Update the game/);
    expect('error' in importWorld({ ...v1(), version: 1.5 })).toBe(true);
  });

  it('survives malformed imprint text and graves; ordinals past the table read right', () => {
    const f = v1();
    f.imprint.notableChoices = [{ kind: 'reignite' }, 'x', null];
    f.imprint.displayName = { evil: true };
    f.imprint.generation = 22;
    const out = importWorld(f);
    if ('error' in out) throw new Error(out.error);
    expect(out.arrival.names[0]!.name).toBe('A stranger');
    expect(out.arrival.lines.join(' ')).toContain('22nd of their line');
    const g = v1();
    g.deltas.unshift({ t: 'grave', name: { x: 1 }, day: 'soon' });
    g.contentHash = contentHash(g.seed, g.contentPackIds, g.deltas);
    const out2 = importWorld(g);
    if ('error' in out2) throw new Error(out2.error);
    expect(out2.arrival.names.map((n) => n.name)).toEqual(['Elias Boone', 'Marrow']);
    expect(out2.arrival.lines.join(' ')).not.toContain('[object');
  });

  it('a world that carried no one says so', () => {
    const f = v1();
    f.imprint = null;
    f.deltas = f.deltas.filter((d: { t: string }) => d.t !== 'grave');
    f.contentHash = contentHash(f.seed, f.contentPackIds, f.deltas);
    f.worldDigest = undefined;
    const out = importWorld(f);
    if ('error' in out) throw new Error(out.error);
    expect(out.arrival.names).toEqual([]);
    expect(out.arrival.lines[0]).toMatch(/No one here speaks of strangers/);
  });
});
