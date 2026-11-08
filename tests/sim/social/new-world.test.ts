/**
 * A new world each run (tree F16 / F9): any seed boots with its own social web.
 * Seed 42 keeps the baked JSON; every other seed builds its web at boot.
 */
import { describe, expect, it } from 'vitest';
import { dataForSeed, loadData } from '../../../src/sim/load-data';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { createPlaySession, type PlaySession } from '../../../src/sim';
import { loadState, parseSave, saveState, serializeSave } from '../../../src/sim/save';
import { createSocialGraph } from '../../../src/sim/social';
import { buildSocialWeb } from '../../../src/sim/social/social-web-build';
import type { SimState } from '../../../src/sim/types/runtime';

const NEW = 73104;
const genIds = (ids: Iterable<string>, seed: number) => [...ids].filter((id) => id.startsWith(`gen_p_${seed}_`));

describe('a new world each run', () => {
  it('a non-42 seed boots with a web over its own gen people, in time', () => {
    const t0 = performance.now();
    const { state } = bootPlayState(NEW, 'marrow');
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1500);
    const d = state.data as ReturnType<typeof loadData>;
    expect(d.socialWeb.seed).toBe(NEW);
    expect(d.socialCentrality.seed).toBe(NEW);
    const nodes = new Set(createSocialGraph(d.socialWeb.edges).nodes());
    expect(genIds(nodes, NEW).length).toBeGreaterThan(0);
    expect(genIds(nodes, 42)).toEqual([]);
    // every procedural inhabitant of this world sits in the web, and has a centrality row
    const people = genIds(Object.keys(state.people), NEW);
    expect(people.length).toBeGreaterThan(0);
    const rows = new Set(d.socialCentrality.rows.map((r) => r.personId));
    for (const id of people) {
      expect(nodes.has(id), id).toBe(true);
      expect(rows.has(id), id).toBe(true);
    }
    expect(d.socialCentrality.rows.some((r) => r.influential)).toBe(true);
  });

  it('is deterministic per seed and differs between seeds', () => {
    const a = bootPlayState(NEW, 'marrow').state.data as ReturnType<typeof loadData>;
    const b = bootPlayState(NEW, 'marrow').state.data as ReturnType<typeof loadData>;
    expect(a.socialWeb).toEqual(b.socialWeb);
    expect(a.socialCentrality).toEqual(b.socialCentrality);
    const c = bootPlayState(NEW + 1, 'marrow').state.data as ReturnType<typeof loadData>;
    expect(c.socialWeb.edges).not.toEqual(a.socialWeb.edges);
  });

  it('seed 42 is unchanged: the baked tables, untouched', () => {
    const baked = loadData();
    expect(dataForSeed(baked, 42)).toBe(baked);
    const d = bootPlayState(42, 'marrow').state.data as ReturnType<typeof loadData>;
    expect(d.socialWeb).toEqual(baked.socialWeb);
    expect(d.socialCentrality).toEqual(baked.socialCentrality);
    expect(d.socialWeb.edges.length).toBe(109);
    // and the runtime builder reproduces the bake for 42
    expect(buildSocialWeb(42).web.edges).toEqual(baked.socialWeb.edges);
  });

  it('two sessions on different seeds do not bleed into each other', () => {
    const s42 = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' }) as PlaySession;
    s42.start({ seed: 42, archetypeId: 'marrow' });
    const sNew = createPlaySession({ mode: 'play', seed: NEW, archetypeId: 'marrow' }) as PlaySession;
    sNew.start({ seed: NEW, archetypeId: 'marrow' });
    const web = (s: PlaySession) => (s.getState() as SimState).data as ReturnType<typeof loadData>;
    expect(web(s42).socialWeb.seed).toBe(42);
    expect(web(sNew).socialWeb.seed).toBe(NEW);
    expect(loadData().socialWeb.seed).toBe(42);
    s42.act('advance:dawn');
    sNew.act('advance:dawn');
    expect(web(s42).socialWeb.seed).toBe(42);
    expect(web(sNew).socialWeb.seed).toBe(NEW);
  });

  it('save/load round trip keeps the world, even when loaded over seed-42 data', () => {
    const { state } = bootPlayState(NEW, 'marrow');
    const before = state.data as ReturnType<typeof loadData>;
    const blob = parseSave(serializeSave(saveState(state)))!;
    expect(blob.seed).toBe(NEW);
    const back = loadState(blob, loadData()) as SimState;
    expect(back.seed).toBe(NEW);
    const d = back.data as ReturnType<typeof loadData>;
    expect(d.socialWeb).toEqual(before.socialWeb);
    expect(d.socialCentrality).toEqual(before.socialCentrality);
    expect(Object.keys(back.people).sort()).toEqual(Object.keys(state.people).sort());

    // through the session's own load path, starting from the known world
    const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' }) as PlaySession;
    s.start({ seed: 42, archetypeId: 'marrow' });
    s.loadBlob(blob);
    expect(s.getSeed()).toBe(NEW);
    expect(((s.getState() as SimState).data as ReturnType<typeof loadData>).socialWeb.seed).toBe(NEW);
    expect(genIds(Object.keys((s.getState() as SimState).people), NEW).length).toBeGreaterThan(0);
  });
});
