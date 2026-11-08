import { describe, expect, it, vi } from 'vitest';
import { createOverlayStack, type Focusable } from '../../../src/ui/kit/overlay-stack';
import { watchSession } from '../../../src/ui/kit/session-events';
import type { PlaySession } from '../../../src/sim';

/** A focus world: items that record focus into a shared "activeElement". */
function focusWorld() {
  let active: unknown;
  const item = (name: string): Focusable & { name: string; isConnected: boolean } => ({ name, isConnected: true, focus() { active = this; } });
  const el = (items: Focusable[]) => ({ querySelectorAll: () => items });
  return { item, el, active: () => active, set: (a: unknown) => (active = a) };
}

describe('overlay stack', () => {
  it('opens and closes, top is the last opened, subscribers hear each change', () => {
    const s = createOverlayStack({ activeElement: () => undefined });
    const heard = vi.fn();
    s.subscribe(heard);
    s.open({ id: 'pause', kind: 'menu' });
    s.open({ id: 'save', kind: 'menu' });
    expect(s.top()?.id).toBe('save');
    expect(s.count()).toBe(2);
    s.close('save');
    expect(s.top()?.id).toBe('pause');
    s.close('nope');
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it('one sheet at a time: opening a sheet closes the previous one (onClose runs once)', () => {
    const s = createOverlayStack({ activeElement: () => undefined });
    const closedBoard = vi.fn();
    s.open({ id: 'board', kind: 'sheet', onClose: closedBoard });
    s.open({ id: 'satchel', kind: 'sheet' });
    expect(s.list().map((e) => e.id)).toEqual(['satchel']);
    expect(closedBoard).toHaveBeenCalledTimes(1);
    // A menu does not close a sheet.
    s.open({ id: 'pause', kind: 'menu' });
    expect(s.count('sheet')).toBe(1);
    expect(s.count('menu', 'modal')).toBe(1);
  });

  it('re-opening the same id replaces it rather than stacking a copy', () => {
    const s = createOverlayStack({ activeElement: () => undefined });
    const first = vi.fn();
    s.open({ id: 'road', kind: 'menu', onClose: first });
    s.open({ id: 'road', kind: 'menu' });
    expect(s.count()).toBe(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('Esc goes to the top entry only; default closes it; the empty stack does not take it', () => {
    const s = createOverlayStack({ activeElement: () => undefined });
    const pauseEsc = vi.fn();
    s.open({ id: 'pause', kind: 'menu', onEscape: pauseEsc });
    s.open({ id: 'letters', kind: 'sheet' });
    expect(s.handleKey({ key: 'Escape' })).toBe(true);
    expect(s.has('letters')).toBe(false);
    expect(pauseEsc).not.toHaveBeenCalled();
    expect(s.handleKey({ key: 'Escape' })).toBe(true);
    expect(pauseEsc).toHaveBeenCalledTimes(1);
    s.close('pause');
    expect(s.handleKey({ key: 'Escape' })).toBe(false);
  });

  it('other keys reach the top entry onKey only', () => {
    const s = createOverlayStack({ activeElement: () => undefined });
    const low = vi.fn(() => true);
    const top = vi.fn(() => false);
    s.open({ id: 'a', kind: 'menu', onKey: low });
    s.open({ id: 'b', kind: 'menu', onKey: top });
    expect(s.handleKey({ key: 'ArrowDown' })).toBe(false);
    expect(top).toHaveBeenCalledTimes(1);
    expect(low).not.toHaveBeenCalled();
  });

  it('traps Tab inside a modal and wraps both ways; sheets do not trap', () => {
    const w = focusWorld();
    const s = createOverlayStack({ activeElement: w.active });
    const [a, b, c] = [w.item('a'), w.item('b'), w.item('c')];
    s.open({ id: 'm', kind: 'modal', el: w.el([a, b, c]) });
    w.set(c);
    expect(s.handleKey({ key: 'Tab' })).toBe(true);
    expect(w.active()).toBe(a);
    expect(s.handleKey({ key: 'Tab', shiftKey: true })).toBe(true);
    expect(w.active()).toBe(c);
    s.close('m');
    s.open({ id: 'sheet', kind: 'sheet', el: w.el([a]) });
    expect(s.handleKey({ key: 'Tab' })).toBe(false);
  });

  it('returns focus to what had it before a modal opened', () => {
    const w = focusWorld();
    const s = createOverlayStack({ activeElement: w.active });
    const before = w.item('game');
    w.set(before);
    const inside = w.item('btn');
    s.open({ id: 'm', kind: 'menu', el: w.el([inside]) });
    inside.focus();
    s.close('m');
    expect(w.active()).toBe(before);
  });

  it('pause flag: true while any open entry pauses', () => {
    const s = createOverlayStack({ activeElement: () => undefined });
    expect(s.pausing()).toBe(false);
    s.open({ id: 'board', kind: 'sheet' });
    expect(s.pausing()).toBe(false);
    s.open({ id: 'pause', kind: 'menu', pause: true });
    expect(s.pausing()).toBe(true);
    s.close('pause');
    expect(s.pausing()).toBe(false);
  });

  it('escape claims: the scene can own Esc while nothing DOM is open', () => {
    const s = createOverlayStack({ activeElement: () => undefined });
    let ring = false;
    const off = s.claimEscape(() => ring);
    expect(s.escapeClaimed()).toBe(false);
    ring = true;
    expect(s.escapeClaimed()).toBe(true);
    off();
    expect(s.escapeClaimed()).toBe(false);
    s.claimEscape(() => { throw new Error('boom'); });
    expect(s.escapeClaimed()).toBe(false);
  });

  it('clear closes everything and notifies once', () => {
    const s = createOverlayStack({ activeElement: () => undefined });
    const closed = vi.fn();
    const heard = vi.fn();
    s.open({ id: 'a', kind: 'menu', onClose: closed });
    s.open({ id: 'b', kind: 'sheet', onClose: closed });
    s.subscribe(heard);
    s.clear();
    expect(s.count()).toBe(0);
    expect(closed).toHaveBeenCalledTimes(2);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe('watchSession', () => {
  it('tells listeners after each mutating call, wraps once, and unwatches', () => {
    const calls: string[] = [];
    const session = { tick: () => calls.push('tick'), act: (id: string) => calls.push(`act:${id}`), snapshot: () => ({}) } as unknown as PlaySession;
    const a: string[] = [];
    const b: string[] = [];
    const offA = watchSession(session, (m) => a.push(m));
    watchSession(session, (m) => b.push(m));
    session.tick();
    session.act('x@y');
    session.snapshot();
    expect(calls).toEqual(['tick', 'act:x@y']);
    expect(a).toEqual(['tick', 'act']);
    expect(b).toEqual(['tick', 'act']);
    offA();
    session.tick();
    expect(a).toEqual(['tick', 'act']);
    expect(b).toEqual(['tick', 'act', 'tick']);
  });
});
