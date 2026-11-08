import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../src/sim/goods/inventory';
import { useItem } from '../../src/sim/goods/item-use';
import type { SimState } from '../../src/sim/types/runtime';

describe('every item can be used', () => {
  it('has a use effect or an examine line on every item', () => {
    for (const i of ITEMS.items) expect(i.use, i.id).toBeTruthy();
  });
  it('examining keeps the item and says something specific', () => {
    const state = { inventory: { wood: 2 }, player: { spark: 50 }, people: {}, flags: {} } as unknown as SimState;
    const line = useItem(state, 'wood');
    expect(line).toMatch(/^Wood: /);
    expect(state.inventory!.wood).toBe(2);
  });
});
