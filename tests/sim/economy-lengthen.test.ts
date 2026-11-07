import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPlaySession } from '../../src/sim';
import type { PlaySession } from '../../src/sim';
import { advanceToDawn } from '../../src/sim/scenario/scenario-advance';
import { loadData } from '../../src/sim/load-data';
import { createRng } from '../../src/sim/rng';
import { startTravel } from '../../src/sim/travel/travel';
import { forceSpark } from '../../src/sim/succession';
import type { SimState } from '../../src/sim/types/runtime';

function playSession(seed = 42, archetypeId = 'marrow'): PlaySession {
  const s = createPlaySession({ mode: 'play', seed, archetypeId });
  if (!s || !('listActions' in s)) throw new Error('expected play session');
  const play = s as PlaySession;
  play.start();
  return play;
}

describe('economy lengthen (M3 burnout fix)', () => {
  it('method sparkCosts match Loom spark-pacing-balance table', () => {
    const methods = JSON.parse(readFileSync('src/data/systems/methods.json', 'utf8'));
    const byId = Object.fromEntries(methods.methods.map((m: { id: string }) => [m.id, m]));
    expect(byId.challenge.sparkCost).toBe(6);
    expect(byId.shame.sparkCost).toBe(4);
    expect(byId.inspire.sparkCost).toBe(4);
    expect(byId.inspire.emptyInspireSparkSurcharge).toBe(4);
    expect(byId.carry_burden.sparkCost).toBe(4);
    expect(byId.lie.sparkCost).toBe(5);
  });

  it('sparkStarts and dawn recovery match Loom table', () => {
    const traits = JSON.parse(readFileSync('src/data/people/traits.json', 'utf8'));
    const profiles = Object.fromEntries(
      traits.sparkProfiles.map((p: { id: string }) => [p.id, p]),
    );
    expect(profiles.spark_den_ogre.sparkStart).toBe(88);
    expect(profiles.spark_clerk_ink.sparkStart).toBe(90);
    expect(profiles.spark_brood_shared.sparkStart).toBe(85);

    const player = JSON.parse(readFileSync('src/data/systems/player.json', 'utf8'));
    expect(player.defaults.sparkStart).toBe(88);

    const recovery = JSON.parse(readFileSync('src/data/hooks/spark-recovery.json', 'utf8'));
    const base = recovery.hooks.find((h: { id: string }) => h.id === 'recovery_base_dawn');
    expect(base.effects[0].value).toBe(12);
    const den = recovery.hooks.find((h: { id: string }) => h.id === 'recovery_den_hearth');
    expect(den.effects[0].value).toBe(10);

    const personal = JSON.parse(readFileSync('src/data/hooks/personal-cost.json', 'utf8'));
    const despair = personal.hooks.find((h: { id: string }) => h.id === 'cost_town_despair');
    expect(despair.effects[0].value).toBe(-1);
  });

  it('advanceToDawn runs dawn recovery hooks and clamps to sparkMax', () => {
    const data = loadData();
    const state: SimState = {
      day: 1,
      seed: 1,
      player: {
        id: 'player',
        archetypeId: 'marrow',
        spark: 50,
        sparkMax: 100,
        hookIds: ['recovery_base_dawn'],
        statusTraits: [],
        embodiment: { bodySlots: 1, activeBodiesMax: 1, blockedTileTags: [] },
      },
      people: {},
      flags: {},
      packets: [],
      data,
      rng: createRng(1),
    };
    advanceToDawn(state);
    expect(state.player.spark).toBe(62); // 50 + 12
    state.player.spark = 95;
    advanceToDawn(state);
    expect(state.player.spark).toBe(100); // clamped to sparkMax
  });

  it('listActions exposes advance:dawn, advance:day, and travel:<routeId>', () => {
    const play = playSession();
    const ids = play.listActions().map((a) => a.id);
    expect(ids).toContain('advance:dawn');
    expect(ids).toContain('advance:day');
    const travelIds = ids.filter((id) => id.startsWith('travel:'));
    expect(travelIds.length).toBeGreaterThan(0);
    const routes = play.listRoutes?.() ?? [];
    for (const r of routes) {
      expect(ids).toContain(`travel:${r}`);
    }
  });

  it('act travel:<routeId> moves the player (same as session.travel)', () => {
    const play = playSession();
    const travelAction = play.listActions().find((a) => a.id.startsWith('travel:'));
    expect(travelAction).toBeDefined();
    const townBefore = play.snapshot().townId;
    play.act(travelAction!.id);
    expect(play.snapshot().townId).not.toBe(townBefore);
  });

  it('each travel day nets +2 spark (Loom pacing; not full dawn hooks)', () => {
    const routes = [
      { id: 'route_a_b', fromId: 'town_a', toId: 'town_b', days: 2, biomeIds: [] as string[] },
    ];
    const data = loadData();
    const state = {
      day: 1,
      seed: 1,
      player: {
        id: 'p',
        archetypeId: 'marrow',
        spark: 40,
        sparkMax: 100,
        hookIds: ['recovery_base_dawn'],
        statusTraits: [] as string[],
        embodiment: { bodySlots: 1, activeBodiesMax: 1, blockedTileTags: [] as string[] },
        townId: 'town_a',
      },
      people: {},
      flags: {},
      packets: [],
      bus: { lastIds: [] as string[] },
      routes,
      data,
      rng: createRng(1),
    };
    const sparkBefore = state.player.spark;
    const dayBefore = state.day;
    const result = startTravel(state, 'route_a_b');
    expect(result.daysEff).toBeGreaterThanOrEqual(2);
    // Loom: +2 spark per travel day (not dawn +12)
    expect(state.player.spark).toBe(sparkBefore + 2 * result.daysEff);
    expect(state.day).toBe(dayBefore + result.daysEff);
    expect(state.player.spark).toBeLessThanOrEqual(100);

    // Clamp to sparkMax
    state.player.townId = 'town_b';
    state.player.spark = 99;
    const routes2 = [
      { id: 'route_b_a', fromId: 'town_b', toId: 'town_a', days: 1, biomeIds: [] as string[] },
    ];
    state.routes = routes2;
    startTravel(state, 'route_b_a');
    expect(state.player.spark).toBe(100);
  });

  it('careful kind play with dawn keeps spark > ember zone after 10 kind acts', () => {
    const play = playSession(7, 'marrow');
    const startSpark = play.snapshot().spark;
    expect(startSpark).toBeGreaterThanOrEqual(85);

    let kindActs = 0;
    for (let i = 0; i < 30 && kindActs < 10; i++) {
      const kind = play.listActions().find((a) => a.family === 'kind' && a.id.includes('@'));
      if (!kind) break;
      play.act(kind.id);
      kindActs += 1;
      play.act('advance:dawn');
    }
    expect(kindActs).toBe(10);
    expect(play.snapshot().spark).toBeGreaterThan(20);
    expect(play.snapshot().burnedOut).toBe(false);
  });

  it('succession opens at emberZoneBelow (≤20), not only at hard zero', () => {
    const play = playSession(3, 'ivy_quill');
    const person = play.listPeople()[0]!;
    forceSpark(play, 20);
    // tick() is a real dawn (recovers spark), so use a spark-neutral act, which re-checks succession.
    play.act(`approach@${person.id}`);
    expect(play.snapshot().spark).toBeLessThanOrEqual(20);
    expect(play.snapshot().burnedOut).toBe(true);
    expect(play.events().some((e) => e.type === 'succession.open')).toBe(true);
  });

  it('succession opens promptly on the act that drops spark into ember zone', () => {
    const play = playSession(3, 'ivy_quill');
    forceSpark(play, 20.2);
    const shame = play.listActions().find((a) => a.id.startsWith('shame@'));
    expect(shame).toBeDefined();
    play.act(shame!.id); // talk_hard_shame: strain 1 × 0.55 × 0.55 (hard, shame_lean) ≈ −0.30 → 19.9 ≤ 20
    expect(play.snapshot().spark).toBeLessThan(20.2);
    expect(play.snapshot().spark).toBeLessThanOrEqual(20);
    expect(play.snapshot().burnedOut).toBe(true);
    expect(play.events().some((e) => e.type === 'succession.open')).toBe(true);
  });
});
