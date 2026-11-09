import { describe, expect, it } from 'vitest';
import type { Thing } from '../../src/app/contracts';
import { KIND_PRIORITY, pickFocus } from '../../src/interact/focus';
import { TARGET_KINDS } from '../../src/sim/play-session/targets';
import { landActOn, type LandView } from '../../src/sim/land-acts';
import { netFlows, storesOf, worldGoods } from '../../src/sim/civic/town-stores';
import { stockOpeningShelves } from '../../src/sim/economy/opening-shelves';
import type { SimState } from '../../src/sim/types/runtime';

describe('focus ranks every kind', () => {
  it('lists each target kind once', () => {
    expect([...KIND_PRIORITY].sort()).toEqual([...TARGET_KINDS].sort());
  });
  it('the keeper beside a stall wins the tie, the stall beats a wagon, a grave beats the ground', () => {
    const at = (kind: Thing['kind'], x: number): Thing => ({ key: `${kind}:a`, kind, id: 'a', x, y: 0, label: kind, target: { kind, id: 'a' } }) as Thing;
    expect(pickFocus([at('person', 20), at('stall', 22)], { x: 0, y: 0 }, { dx: 1, dy: 0 })?.kind).toBe('person');
    expect(pickFocus([at('wagon', 20), at('stall', 22)], { x: 0, y: 0 }, { dx: 1, dy: 0 })?.kind).toBe('stall');
    expect(pickFocus([at('tile', 20), at('grave', 22)], { x: 0, y: 0 }, { dx: 1, dy: 0 })?.kind).toBe('grave');
  });
});

describe('no path-mending inside a fenced field', () => {
  // A w x h field at (0,0) laid as map/ladder/dress lays it: fence round the edge (fence_h on the top and
  // bottom rows, corners included), crop on odd rows, the gate on the left edge's middle row; `top` puts
  // a second gate in the top fence. Plus lone scattered field props at (20,0) and (20,2).
  const farm = (w: number, h: number, top = false) => {
    const gate = { q: 0, r: Math.floor(h / 2) };
    const props = (q: number, r: number): string[] => {
      if (q === 20 && (r === 0 || r === 2)) return ['field'];
      if (q < 0 || r < 0 || q >= w || r >= h || (q === gate.q && r === gate.r) || (top && q === 2 && r === 0)) return [];
      if (r === 0 || r === h - 1) return ['fence_h'];
      if (q === 0 || q === w - 1) return ['fence_v'];
      return r % 2 === 1 ? ['field'] : [];
    };
    const view = {
      biome: () => 'fields', natural: () => 'fields', edit: () => undefined, onRoad: () => false, inTown: () => false, passable: () => true,
      drawn: (q: number, r: number) => ({ ground: 'fields', props: props(q, r) }),
    } as unknown as LandView;
    return { gate, view };
  };
  it('refuses every bare tile inside the fence', () => {
    for (const [w, h, top] of [[6, 4, false], [6, 5, true], [11, 7, false], [8, 6, true]] as const) {
      const { view } = farm(w, h, top);
      for (let q = 1; q < w - 1; q++) for (let r = 2; r < h - 1; r += 2) expect(landActOn(view, q, r), `${w}x${h} at ${q},${r}`).toBeNull();
    }
  });
  it('still works the gates, the ground outside and between scattered field props', () => {
    for (const [w, h] of [[6, 4], [11, 7]] as const) {
      const { view, gate } = farm(w, h, true);
      expect(landActOn(view, gate.q, gate.r)?.id).toBe('mend_path');
      expect(landActOn(view, 2, 0)?.id).toBe('mend_path');
      expect(landActOn(view, -1, gate.r)?.id).toBe('mend_path');
      expect(landActOn(view, 2, -1)?.id).toBe('mend_path');
      expect(landActOn(view, 2, h)?.id).toBe('mend_path');
      expect(landActOn(view, 20, 1)?.id).toBe('mend_path');
    }
  });
});

describe('opening shelves', () => {
  it('fills a new town as a named source, so goods still balance', () => {
    const s = { day: 1, seed: 1, people: {}, player: { id: 'player' } } as unknown as SimState;
    stockOpeningShelves(s, 't1', 'town');
    const goods = s.villageEconomy!.towns.t1!.goods;
    expect(goods.bread).toBe(4);
    expect(goods.tools).toBe(2);
    expect(storesOf(s).flows['source:opening']).toBeGreaterThan(0);
    expect(Math.abs(worldGoods(s) - netFlows(s))).toBeLessThan(1e-9);
  });
});
