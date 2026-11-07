import { describe, expect, it } from 'vitest';
import { resolveDrop, dropItem, pickUpItem } from '../../src/sim/goods/item-use';
import { addItem, inventoryOf } from '../../src/sim/goods/inventory';
import { mintInstance } from '../../src/sim/goods/instances';
import type { SimState } from '../../src/sim/types/runtime';

const bread = { itemId: 'bread', qty: 2 };
describe('resolveDrop', () => {
  it('person -> gift_give, ground -> drop, else none', () => {
    expect(resolveDrop(bread, { kind: 'person', id: 'ana' })).toEqual({ kind: 'gift_give', personId: 'ana', itemId: 'bread' });
    expect(resolveDrop(bread, { kind: 'ground' })).toEqual({ kind: 'drop', itemId: 'bread' });
    expect(resolveDrop(bread, null)).toEqual({ kind: 'none' });
    expect(resolveDrop({ itemId: 'bread', qty: 0 }, { kind: 'ground' })).toEqual({ kind: 'none' });
    expect(resolveDrop(undefined, { kind: 'ground' })).toEqual({ kind: 'none' });
  });
  it('coin cannot be gifted but can be dropped', () => {
    expect(resolveDrop({ itemId: 'coin', qty: 3 }, { kind: 'person', id: 'ana' })).toEqual({ kind: 'none' });
    expect(resolveDrop({ itemId: 'coin', qty: 3 }, { kind: 'ground' }).kind).toBe('drop');
  });
});

describe('drop / pick up', () => {
  it('moves one item to the ground and back, keeping provenance', () => {
    const s = { day: 1, inventory: {}, itemInstances: [] } as unknown as SimState;
    addItem(s, 'bread', 2);
    mintInstance(s, 'bread', 'ana', 't1');
    const g = dropItem(s, 'bread', { x: 10, y: 20 })!;
    expect(inventoryOf(s).bread).toBe(1);
    expect(s.groundItems).toHaveLength(1);
    expect(s.itemInstances![0]!.heldBy).toBe('ground');
    expect(pickUpItem(s, g.id)).toBe(true);
    expect(inventoryOf(s).bread).toBe(2);
    expect(s.groundItems).toHaveLength(0);
    expect(s.itemInstances![0]!.heldBy).toBe('player');
  });
  it('refuses when not carried', () => {
    const s = { day: 1, inventory: {} } as unknown as SimState;
    expect(dropItem(s, 'bread', { x: 0, y: 0 })).toBeNull();
  });
});
