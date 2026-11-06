import { describe, it, expect } from 'vitest';
import { createPlaySession } from '../../src/sim';

describe('createPlaySession play', () => {
  it('boots generated world for marrow seed 42', () => {
    const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' });
    expect(s).not.toBeNull();
    if (!s || !('listActions' in s)) throw new Error('expected play session');
    s.start();
    const snap = s.snapshot();
    expect(snap.spark).toBeGreaterThan(0);
    expect(snap.burnedOut).toBe(false);
    expect(snap.townCount).toBeGreaterThanOrEqual(3);
    expect(s.listActions().length).toBeGreaterThan(0);
  });

  it('act does not throw and tick advances', () => {
    const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' });
    expect(s).not.toBeNull();
    if (!s || !('listActions' in s) || !('act' in s)) throw new Error('expected play session');
    s.start();
    const actions = s.listActions();
    expect(actions.length).toBeGreaterThan(0);
    expect(() => s.act(actions[0]!.id)).not.toThrow();
    const before = s.snapshot().tick;
    s.tick();
    expect(s.snapshot().tick).toBeGreaterThan(before);
  });

  it('no-arg factory returns BotSession-shaped play shell for feature-detect', () => {
    const s = createPlaySession();
    expect(s).not.toBeNull();
    if (!s) throw new Error('expected session');
    expect(typeof (s as { start?: unknown }).start).toBe('function');
    expect(typeof (s as { listActions?: unknown }).listActions).toBe('function');
    expect(typeof (s as { act?: unknown }).act).toBe('function');
    expect(typeof (s as { tick?: unknown }).tick).toBe('function');
    expect(typeof (s as { snapshot?: unknown }).snapshot).toBe('function');
    expect(typeof (s as { events?: unknown }).events).toBe('function');
  });
});
