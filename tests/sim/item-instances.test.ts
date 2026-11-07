import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../src/sim/play-session/play-session-state';
import { applyDeedGoods } from '../../src/sim/goods/deed-goods';
import { addItem, inventoryOf, listStacks } from '../../src/sim/goods/inventory';
import { instancesHeldBy, mintInstance, playerInstances } from '../../src/sim/goods/instances';
import { loadData } from '../../src/sim/load-data';
import { loadState, saveState } from '../../src/sim/save';

describe('item instances', () => {
  it('a gifted bread keeps provenance, survives save/load, counts match', () => {
    const { state } = bootPlayState(7, 'marrow');
    const pid = Object.keys(state.people).sort()[0]!;
    const before = inventoryOf(state).bread ?? 0;
    addItem(state, 'bread', 1);
    const m = mintInstance(state, 'bread', 'maker_x', 'ashford');
    expect(playerInstances(state, 'bread')).toContain(m);
    expect(applyDeedGoods(state, 'gift_give', pid, 'bread')?.ok).toBe(true);
    expect(inventoryOf(state).bread ?? 0).toBe(before);
    expect(listStacks(state).find((s) => s.item.id === 'bread')?.qty ?? 0).toBe(before);
    const held = instancesHeldBy(state, pid);
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ id: m.id, madeBy: 'maker_x', townId: 'ashford', dawn: state.day });
    const loaded = loadState(JSON.parse(JSON.stringify(saveState(state))), loadData(), 'marrow');
    expect(instancesHeldBy(loaded, pid)[0]).toMatchObject({ id: m.id, madeBy: 'maker_x', townId: 'ashford' });
    expect(inventoryOf(loaded).bread ?? 0).toBe(before);
  });
});
