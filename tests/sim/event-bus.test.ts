import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/sim/event-bus';

describe('event bus', () => {
  it('delivers payloads to subscribers', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('tick', handler);
    bus.emit('tick', { n: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ n: 1 });
  });

  it('supports multiple subscribers for the same event', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('moved', a);
    bus.on('moved', b);
    bus.emit('moved', { id: 'p1' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops further delivery', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const off = bus.on('tick', handler);
    bus.emit('tick', {});
    off();
    bus.emit('tick', {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not cross-talk between event names', () => {
    const bus = createEventBus();
    const tick = vi.fn();
    const moved = vi.fn();
    bus.on('tick', tick);
    bus.on('moved', moved);
    bus.emit('tick', { n: 3 });
    expect(tick).toHaveBeenCalledTimes(1);
    expect(moved).not.toHaveBeenCalled();
  });
});
