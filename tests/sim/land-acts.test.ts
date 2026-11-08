import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../src/sim/play-session/play-session-state';
import { loadData } from '../../src/sim/load-data';
import { loadState, saveState } from '../../src/sim/save';
import { generateWorld } from '../../src/sim/gen/world';
import { layoutWorld } from '../../src/sim/map/world-layout';
import { createTerrainAccess } from '../../src/sim/map/terrain-access';
import { createNavigator } from '../../src/sim/map/nav';
import { createStampRasterSource } from '../../src/sim/map/stamp-raster';
import { editAt } from '../../src/sim/map/tile-edits';
import { riverRow } from '../../src/sim/map/terrain';
import { collectDawnLines } from '../../src/sim/dawn-lines';
import '../../src/sim/contrib';
import { LAND_RULES, labourLeft, landActOn, landDawnLines, workLand, workLandHere } from '../../src/sim/land-acts';
import type { SimState } from '../../src/sim/types/runtime';

const SEED = 7;
const setup = () => {
  const { state } = bootPlayState(SEED, 'marrow');
  const world = generateWorld({ seed: SEED, includeAnchors: true, peopleCount: 60 });
  const layout = layoutWorld(world, SEED);
  const live = { state: state as SimState };
  const terrain = createTerrainAccess(layout, SEED, undefined, () => live.state.tileEdits);
  const towns = layout.settlements.map((t) => ({ id: t.id, q: t.q, r: t.r }));
  return { live, state, world, layout, terrain, towns };
};
type Setup = ReturnType<typeof setup>;

/** A river bank: dry tile (q, r) with impassable, shallow water just south of it, near a town but not in it. */
function findBank(t: Setup): { q: number; r: number; town: string } {
  for (const town of t.layout.settlements) {
    for (let dq = 16; dq < 60; dq++) for (const q of [town.q + dq, town.q - dq]) {
      const mid = Math.round(riverRow(SEED, q));
      for (let r = mid - 6; r <= mid; r++) {
        if (t.terrain.passable(q, r) && t.terrain.biome(q, r) !== 'water' && !t.terrain.inTown(q, r) && !t.terrain.passable(q, r + 1)
          && Math.hypot(q - town.q, r - town.r) < LAND_RULES.noticeRadiusTiles - 2 && landActOn(t.terrain, q, r + 1)?.id === 'lay_stones') return { q, r, town: town.id };
      }
    }
  }
  throw new Error('no bank found');
}

describe('land acts', () => {
  it('lay stepping stones: costs stone and labour, makes shallow water a passable ford the navigator uses', () => {
    const t = setup();
    const bank = findBank(t);
    const nav = createNavigator(t.terrain);
    expect(nav.walkable(bank.q, bank.r + 1)).toBe(false);
    t.state.inventory = { ...(t.state.inventory ?? {}), stone: 5 };
    const before = labourLeft(t.state);
    const res = workLandHere(t.state, t.terrain, bank, { dx: 0, dy: 1 }, t.towns);
    expect(res).toMatchObject({ ok: true, act: 'lay_stones', q: bank.q, r: bank.r + 1 });
    expect(t.state.inventory!.stone).toBe(2);
    expect(labourLeft(t.state)).toBe(before - 1);
    expect(editAt(t.state.tileEdits, bank.q, bank.r + 1)).toBe('ford');
    expect(t.terrain.passable(bank.q, bank.r + 1)).toBe(true);
    expect(t.terrain.isFord(bank.q, bank.r + 1)).toBe(true);
    expect(nav.walkable(bank.q, bank.r + 1)).toBe(true);
    expect(nav.findPath(bank, { q: bank.q, r: bank.r + 1 })).toHaveLength(2);
  });

  it('refuses without enough stone, on deep or dry-for-stones ground, and in towns', () => {
    const t = setup();
    const bank = findBank(t);
    t.state.inventory = { ...(t.state.inventory ?? {}), stone: 2 };
    const res = workLand(t.state, t.terrain, 'lay_stones', bank.q, bank.r + 1, t.towns);
    expect(res.ok).toBe(false);
    expect(res.line).toMatch(/needs 3 stone/);
    expect(t.state.inventory!.stone).toBe(2);
    expect(t.state.tileEdits).toBeUndefined();
    // Dry ground cannot take stepping stones.
    t.state.inventory.stone = 9;
    expect(workLand(t.state, t.terrain, 'lay_stones', bank.q, bank.r, t.towns).ok).toBe(false);
    // Town ground is not for paths either.
    const home = t.layout.settlements[0]!;
    t.state.inventory.timber = 3;
    expect(workLand(t.state, t.terrain, 'mend_path', home.q + 2, home.r + 2, t.towns).ok).toBe(false);
    expect(t.state.inventory.stone).toBe(9);
    expect(t.state.inventory.timber).toBe(3);
    // Open lake far from any bank is too deep.
    let deep: { q: number; r: number } | null = null;
    for (let q = -600; q < 1600 && !deep; q += 3) for (let r = -400; r < 400 && !deep; r += 3) {
      let wet = true;
      for (let dr = -4; dr <= 4 && wet; dr++) for (let dq = -4; dq <= 4 && wet; dq++) if (t.terrain.natural(q + dq, r + dr) !== 'water') wet = false;
      if (wet && !t.terrain.passable(q, r)) deep = { q, r };
    }
    expect(deep).not.toBeNull();
    expect(landActOn(t.terrain, deep!.q, deep!.r)).toBeNull();
  });

  it('clears brush, then mends a path on it; labour runs out and refills at dawn', () => {
    const t = setup();
    let forest: { q: number; r: number } | null = null;
    const home = t.layout.settlements[0]!;
    for (let d = 20; d < 200 && !forest; d++) for (const [q, r] of [[home.q + d, home.r - 30], [home.q - d, home.r + 30], [home.q + d, home.r + 30]] as const) {
      if (!forest && t.terrain.biome(q, r) === 'forest' && !t.terrain.onRoad(q, r) && !t.terrain.inTown(q, r)) forest = { q, r };
    }
    expect(forest).not.toBeNull();
    const { q, r } = forest!;
    t.state.inventory = { ...(t.state.inventory ?? {}), timber: 1, wood: 0 };
    const cleared = workLand(t.state, t.terrain, 'clear_brush', q, r, t.towns);
    expect(cleared.ok).toBe(true);
    expect(t.terrain.biome(q, r)).toBe('meadow');
    expect(t.state.inventory!.wood).toBe(1);
    expect(landActOn(t.terrain, q, r)?.id).toBe('mend_path');
    expect(workLand(t.state, t.terrain, 'mend_path', q, r, t.towns).ok).toBe(true);
    expect(editAt(t.state.tileEdits, q, r)).toBe('road_track');
    expect(t.state.inventory!.timber ?? 0).toBe(0);
    expect(t.terrain.onRoad(q, r)).toBe(true);
    expect(landActOn(t.terrain, q, r)).toBeNull();
    // Drawn: the chunk shows the worked track.
    const src = createStampRasterSource(t.world, SEED, () => t.state.tileEdits);
    const chunk = src.getChunk({ cx: Math.floor(q / 32), cy: Math.floor(r / 32) });
    expect(chunk.tiles.find((x) => x.q === q && x.r === r)?.biomeId).toBe('road_track');
    // Labour: 2 + 1 spent; burn the rest, then the next act is refused until dawn.
    t.state.landWork!.used = LAND_RULES.labourPerDay;
    t.state.inventory!.timber = 1;
    const next = [[q + 1, r], [q - 1, r], [q, r + 1], [q, r - 1]].find(([a, b]) => landActOn(t.terrain, a!, b!))!;
    const tired = workLand(t.state, t.terrain, landActOn(t.terrain, next[0]!, next[1]!)!.id, next[0]!, next[1]!, t.towns);
    expect(tired.ok).toBe(false);
    expect(tired.line).toMatch(/Rest/);
    t.state.day += 1;
    expect(labourLeft(t.state)).toBe(LAND_RULES.labourPerDay);
  });

  it('picks ground it can pay for, and leaves streams, tracks and structures alone (synthetic land)', () => {
    const { state } = bootPlayState(SEED, 'marrow');
    // Row r=1 is water, everything else forest; the player stands at (0,0) facing the water.
    const ground = new Map<string, { ground?: string; props: string[] }>();
    const view = {
      natural: (_q: number, r: number) => (r === 1 ? 'water' : 'forest') as 'water' | 'forest',
      biome: (_q: number, r: number) => (r === 1 ? 'water' : 'forest') as 'water' | 'forest',
      edit: () => undefined,
      onRoad: () => false,
      inTown: () => false,
      passable: (_q: number, r: number) => r !== 1,
      drawn: (q: number, r: number) => ground.get(`${q},${r}`) ?? { props: [] },
    };
    state.inventory = { wood: 0 };
    // No stone: the faced water is skipped for brush beside it that costs nothing.
    const res = workLandHere(state, view, { q: 0, r: 0 }, { dx: 0, dy: 1 }, []);
    expect(res).toMatchObject({ ok: true, act: 'clear_brush' });
    expect(res!.r).not.toBe(1);
    // With F and stone in hand but too little of it, F does not claim the press for brush; it names the cost.
    expect(workLandHere(state, view, { q: 0, r: 0 }, { dx: 0, dy: 1 }, [], 'stone')).toMatchObject({ ok: false, line: expect.stringMatching(/needs 3 stone/) });
    expect(workLandHere(state, view, { q: 0, r: 0 }, { dx: 0, dy: 1 }, [], 'bread')).toBeNull();
    // Drawn streams, farm tracks and structures block work; loose growth does not.
    ground.set('5,5', { ground: 'stream', props: [] });
    ground.set('6,5', { ground: 'road_track', props: [] });
    ground.set('7,5', { ground: 'forest', props: ['farmstead'] });
    ground.set('8,5', { ground: 'forest', props: ['bush', 'reeds'] });
    expect(landActOn(view, 5, 5)).toBeNull();
    expect(landActOn(view, 6, 5)).toBeNull();
    expect(landActOn(view, 7, 5)).toBeNull();
    expect(landActOn(view, 8, 5)?.id).toBe('clear_brush');
  });

  it('edits survive save/load and stay passable', () => {
    const t = setup();
    const bank = findBank(t);
    t.state.inventory = { ...(t.state.inventory ?? {}), stone: 3 };
    expect(workLand(t.state, t.terrain, 'lay_stones', bank.q, bank.r + 1, t.towns).ok).toBe(true);
    const back = loadState(JSON.parse(JSON.stringify(saveState(t.state))), loadData());
    expect(editAt(back.tileEdits, bank.q, bank.r + 1)).toBe('ford');
    expect(back.landWork?.log).toHaveLength(1);
    t.live.state = back;
    expect(t.terrain.passable(bank.q, bank.r + 1)).toBe(true);
    expect(back.inventory!.stone ?? 0).toBe(0);
  });

  it('townsfolk mention work near their town at the next dawn', () => {
    const t = setup();
    const bank = findBank(t);
    t.state.inventory = { ...(t.state.inventory ?? {}), stone: 3 };
    workLand(t.state, t.terrain, 'lay_stones', bank.q, bank.r + 1, t.towns.map((x) => (x.id === bank.town ? { ...x, name: 'Peat Ladder' } : x)));
    expect(landDawnLines(t.state)).toEqual([]);
    t.state.day += 1;
    const lines = landDawnLines(t.state);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/says someone laid stepping stones across the water outside Peat Ladder\.$/);
    expect(collectDawnLines(t.state)).toContain(lines[0]);
    t.state.day += 1;
    expect(landDawnLines(t.state)).toEqual([]);
  });
});
