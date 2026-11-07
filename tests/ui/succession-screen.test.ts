import { describe, expect, it } from 'vitest';
import { makeScreen } from './succession-screen-fake';

describe('succession screen', () => {
  it('locked copy, Carry it on default focus, Let it rest same size class', () => {
    const { screen, el, focused } = makeScreen({ canContinue: true });
    screen.refresh();
    expect(el.children[0]!.textContent).toBe('Your fire went out. Someone remembers it.');
    const btns = el.children[1]!.children;
    expect(btns.map((b) => b.textContent)).toEqual(['Carry it on', 'Let it rest']);
    expect(focused()).toBe('Carry it on');
    expect(btns[0]!.style.padding).toBe(btns[1]!.style.padding);
    expect(btns[0]!.style.minWidth).toBe(btns[1]!.style.minWidth);
  });
  it('zero eligible heirs -> only Let it rest, no warning copy', () => {
    const { screen, el, focused } = makeScreen({ canContinue: false });
    screen.refresh();
    expect(el.children[1]!.children.map((b) => b.textContent)).toEqual(['Let it rest']);
    expect(focused()).toBe('Let it rest');
    expect(el.children.length).toBe(2);
  });
  it('buttons call the sim session', () => {
    const { screen, el, chosen } = makeScreen({ canContinue: true });
    screen.refresh();
    el.children[1]!.children[1]!.click();
    expect(chosen).toEqual(['quit']);
  });
});
