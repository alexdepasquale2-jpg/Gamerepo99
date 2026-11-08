import { describe, expect, it } from 'vitest';
import { makeLog, makeStore, move, net, put, room, spoil, take, total } from '../../src/sim/civic/store';

describe('civic store', () => {
  it('puts up to capacity and takes no more than it holds', () => {
    const s = makeStore(10);
    expect(put(s, 'grain', 7, 'source:harvest')).toBe(7);
    expect(put(s, 'wood', 5, 'source:harvest')).toBe(3);
    expect(total(s)).toBe(10);
    expect(room(s)).toBe(0);
    expect(take(s, 'grain', 9, 'sink:eaten')).toBe(7);
    expect(s.items.grain).toBeUndefined();
    expect(total(s, 'wood')).toBe(3);
  });

  it('moves conserve goods and respect the receiver room', () => {
    const a = makeStore(100), b = makeStore(4);
    put(a, 'bread', 10, 'source:production');
    const before = total(a) + total(b);
    expect(move(a, b, 'bread', 6)).toBe(4);
    expect(move(a, b, 'bread', 6)).toBe(0);
    expect(total(a) + total(b)).toBe(before);
    expect(move(b, a, 'fish', 3)).toBe(0);
  });

  it('the log accounts for every change at a label', () => {
    const log = makeLog(500);
    const a = makeStore(50, 0.1), b = makeStore(50);
    const ctxA = { log, label: 'site:a', day: 1 };
    put(a, 'grain', 20, 'source:harvest', ctxA);
    take(a, 'grain', 3, 'sink:eaten', ctxA);
    move(a, b, 'grain', 5, { ...ctxA, toLabel: 'site:b' });
    spoil(a, ctxA);
    put(b, 'fish', 2, 'source:catch', { log, label: 'site:b' });
    expect(total(a)).toBeCloseTo(net(log, 'site:a'), 9);
    expect(total(b)).toBeCloseTo(net(log, 'site:b'), 9);
    // Only named sources create and named sinks destroy: their sum is the change in all stores.
    const made = log.entries.filter((e) => e.from.startsWith('source:')).reduce((n, e) => n + e.qty, 0);
    const lost = log.entries.filter((e) => e.to.startsWith('sink:')).reduce((n, e) => n + e.qty, 0);
    expect(total(a) + total(b)).toBeCloseTo(made - lost, 9);
    expect(log.entries.some((e) => e.to === 'sink:spoiled')).toBe(true);
  });

  it('keeps the log bounded', () => {
    const log = makeLog(5);
    const s = makeStore(1000);
    for (let i = 0; i < 20; i++) put(s, 'stone', 1, 'source:quarry', { log, day: i });
    expect(log.entries.length).toBe(5);
    expect(log.entries[0]!.day).toBe(15);
  });
});
