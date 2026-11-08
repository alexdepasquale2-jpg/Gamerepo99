import { describe, it, expect } from 'vitest';
import { createPlaySession } from '../../../src/sim';
import type { PlaySession } from '../../../src/sim/play-session/play-session';
import { parseTargetAction, parseTargetKey, targetActionId, targetKey } from '../../../src/sim/play-session/targets';
import { registerTargetProvider } from '../../../src/sim/play-session/action-providers';
import { placeNodes } from '../../../src/sim/goods/nodes';
import { facilityPlaces } from '../../../src/sim/economy/facilities';
import { dropItem } from '../../../src/sim/goods/item-use';
import { siteInTown } from '../../../src/sim/hoard/state';
import { inventoryOf } from '../../../src/sim/goods/inventory';
import { layoutWorld } from '../../../src/sim';

function session(seed = 42): PlaySession {
  const s = createPlaySession({ mode: 'play', seed, archetypeId: 'marrow' });
  if (!s || !('listVerbs' in s)) throw new Error('expected play session');
  s.start({ seed, archetypeId: 'marrow' });
  return s;
}

describe('target refs and act ids', () => {
  it('people keep <verb>@<id>; things are <verb>@<kind>:<id>, ids may carry colons', () => {
    expect(targetActionId('talk_gentle', { kind: 'person', id: 'jonah_pike' })).toBe('talk_gentle@jonah_pike');
    expect(targetActionId('enter', { kind: 'door', id: 'peat_ladder:3' })).toBe('enter@door:peat_ladder:3');
    expect(parseTargetAction('enter@door:peat_ladder:3')).toEqual({ verb: 'enter', target: { kind: 'door', id: 'peat_ladder:3' } });
    expect(parseTargetAction('inspire@jonah_pike')).toEqual({ verb: 'inspire', target: { kind: 'person', id: 'jonah_pike' } });
    expect(parseTargetKey(targetKey({ kind: 'ground-item', id: 'g1_1' }))).toEqual({ kind: 'ground-item', id: 'g1_1' });
    expect(parseTargetAction('advance:dawn')).toBeNull();
  });
});

describe('listActions(personId) builds for one person only', () => {
  it('matches the world-wide list filtered to them', () => {
    const s = session();
    const pid = s.listPeople()[3]!.id;
    const one = s.listActions(pid).map((a) => a.id);
    const all = s.listActions().filter((a) => a.id.endsWith(`@${pid}`)).map((a) => a.id);
    expect(one).toEqual(all);
    expect(one.length).toBeGreaterThan(0);
  });
});

describe('the five legacy method ids still resolve', () => {
  it('session.act accepts inspire/carry_burden/challenge/shame/lie@person (old saves, bots, specs)', () => {
    for (const m of ['inspire', 'carry_burden', 'challenge', 'shame', 'lie']) {
      const s = session();
      const pid = s.listPeople().find((p) => !p.tags?.includes('child'))!.id;
      s.getState()!.player.spark = 100;
      s.act(`${m}@${pid}`);
      expect(s.events().some((e) => e.type === 'interaction' || e.type.startsWith('refusal')), m).toBe(true);
    }
  });

  it('talk verbs resolve the same interaction their old method did', () => {
    const pairs: [string, string][] = [['talk_gentle', 'inspire'], ['talk_hard_shame', 'shame'], ['favor_do', 'carry_burden'], ['stand_up', 'challenge']];
    for (const [verb, method] of pairs) {
      const a = session(), b = session();
      const pid = a.listPeople().find((p) => !p.tags?.includes('child'))!.id;
      a.act(`${verb}@${pid}`);
      b.act(`${method}@${pid}`);
      const last = (s: PlaySession) => s.events().filter((e) => e.type === 'interaction').map((e) => e.methodId);
      expect(last(a), verb).toEqual(last(b));
    }
  });
});

describe('30 dawns of ring verbs', () => {
  /** Each day: the first verb of each family on a neighbour, a gather, a shift; then rest. */
  function run(seed: number) {
    const s = session(seed);
    const st = s.getState()!;
    const layout = layoutWorld(s.getWorld()!, s.getSeed());
    const nodes = placeNodes(s.getSeed(), layout.settlements, layout.routes);
    const fac = facilityPlaces(st)[0]!;
    const seen = new Set<string>();
    for (let d = 0; d < 30; d++) {
      st.player.spark = Math.max(st.player.spark, 60);
      const pid = s.listPeople().filter((p) => p.townId === st.player.townId)[d % 5]!.id;
      const verbs = s.listVerbs({ kind: 'person', id: pid });
      for (const v of verbs.filter((x, i, all) => all.findIndex((y) => y.family === x.family) === i).slice(0, 4)) s.act(v.id);
      const node = nodes[d % nodes.length]!;
      s.act(`gather@node:${node.id}`, { kind: 'node', id: node.id, data: node });
      s.act(`work@facility:${fac.id}`, { kind: 'facility', id: fac.id });
      s.tick();
      for (const e of s.events()) seen.add(e.type);
    }
    return { snap: s.snapshot(), inv: JSON.stringify(st.inventory), coin: st.player.coin, seen: [...seen].sort() };
  }

  it('is deterministic (same seed, same verbs, same world)', () => {
    const a = run(42);
    expect(run(42)).toEqual(a);
    expect(a.seen).toContain('interaction');
  });
});

describe('verbs on things go through session.act', () => {
  it('gather on a node takes from it and says what you got', () => {
    const s = session();
    const st = s.getState()!;
    const layout = layoutWorld(s.getWorld()!, s.getSeed());
    const node = placeNodes(s.getSeed(), layout.settlements, layout.routes)[0]!;
    const target = { kind: 'node' as const, id: node.id, data: node };
    const verbs = s.listVerbs(target);
    expect(verbs.map((v) => v.id)).toEqual([`gather@node:${node.id}`]);
    const before = JSON.stringify(inventoryOf(st));
    const out = s.act(verbs[0]!.id, target);
    expect(out?.ok).toBe(true);
    expect(out?.line).toBeTruthy();
    expect(JSON.stringify(inventoryOf(st))).not.toBe(before);
  });

  it('work a shift on a facility, once a day', () => {
    const s = session();
    const st = s.getState()!;
    const fac = facilityPlaces(st)[0]!;
    const target = { kind: 'facility' as const, id: fac.id };
    const [verb] = s.listVerbs(target);
    expect(verb!.id).toBe(`work@facility:${fac.id}`);
    expect(s.act(verb!.id, target)).toMatchObject({ ok: true });
    expect(s.act(verb!.id, target)).toMatchObject({ ok: false });
    expect(st.flags.facilityShiftDay).toBe(st.day);
  });

  it('board, wagon, signpost, door and hearth offer their one verb', () => {
    const s = session();
    const st = s.getState()!;
    const town = st.player.townId!;
    expect(s.listVerbs({ kind: 'board', id: town }).map((v) => v.id)).toEqual([`read@board:${town}`]);
    expect(s.listVerbs({ kind: 'signpost', id: town }).map((v) => v.id)).toEqual([`roads@signpost:${town}`]);
    expect(s.listVerbs({ kind: 'hearth', id: town }).map((v) => v.id)).toEqual([`rest@hearth:${town}`]);
    expect(s.listVerbs({ kind: 'door', id: `${town}:0` }).map((v) => v.id)).toEqual([`enter@door:${town}:0`]);
    expect(s.listVerbs({ kind: 'door', id: 'exit' }).map((v) => v.id)).toEqual(['leave@door:exit']);
    const wagon = st.caravans?.[0];
    if (wagon) expect(s.listVerbs({ kind: 'wagon', id: wagon.id }).map((v) => v.id)).toEqual([`trade@wagon:${wagon.id}`]);
    expect(s.listVerbs({ kind: 'wagon', id: 'no_such_wagon' })).toEqual([]);
    expect(s.act(`read@board:${town}`, { kind: 'board', id: town })).toEqual({ ok: true });
  });

  it('a door the body cannot fit refuses with the body line (the ogre and the cottage)', () => {
    const s = session(); // marrow is an ogre
    const out = s.act('enter@door:x:0', { kind: 'door', id: 'x:0', data: { kind: 'house' } });
    expect(out?.ok).toBe(false);
    expect(out?.line).toBeTruthy();
    expect(s.act('enter@door:x:1', { kind: 'door', id: 'x:1', data: { kind: 'inn' } })?.ok).toBe(true);
  });

  it('pick up a ground item', () => {
    const s = session();
    const st = s.getState()!;
    st.inventory = { ...(st.inventory ?? {}), bread: 2 };
    const g = dropItem(st, 'bread', { x: 10, y: 10 })!;
    const target = { kind: 'ground-item' as const, id: g.id };
    expect(s.listVerbs(target).map((v) => v.id)).toEqual([`pick_up@ground-item:${g.id}`]);
    expect(s.act(`pick_up@ground-item:${g.id}`, target)?.ok).toBe(true);
    expect(st.inventory!.bread).toBe(2);
    expect(s.listVerbs(target)).toEqual([]);
  });

  it('the stash chest digs up and fills through the stash acts', () => {
    const s = session();
    const st = s.getState()!;
    const site = siteInTown(st, st.player.townId)!;
    const chest = { kind: 'chest' as const, id: site.id };
    st.player.coin = 30;
    const hide = s.listVerbs(chest).find((v) => v.id.startsWith('stash_hide@'));
    expect(hide?.id).toBe(`stash_hide@chest:${site.id}`);
    s.act(hide!.id, chest);
    expect(st.hoard!.stash[site.id]!.coin).toBeGreaterThan(0);
    const dig = s.listVerbs(chest).find((v) => v.id.startsWith('stash_withdraw@'))!;
    expect(s.act(dig.id, chest)?.ok).toBe(true);
    expect(st.hoard!.stash[site.id]!.coin).toBe(0);
    expect(st.player.coin).toBe(30);
  });

  it('a target provider can be added from a contrib module', () => {
    registerTargetProvider({
      id: 'test-fauna',
      kinds: ['fauna'],
      list: (_s, t) => [{ id: `pet@fauna:${t.id}`, label: 'Pet' }],
      act: (_s, id) => (id.startsWith('pet@') ? { ok: true, line: 'It leans in.' } : false),
    });
    const s = session();
    expect(s.listVerbs({ kind: 'fauna', id: 'fox' }).map((v) => v.id)).toEqual(['pet@fauna:fox']);
    expect(s.act('pet@fauna:fox', { kind: 'fauna', id: 'fox' })).toEqual({ ok: true, line: 'It leans in.' });
  });
});
