import { createSuccessionScreen } from '../../src/ui/succession-screen';
import type { PlaySession } from '../../src/sim';

export class FakeEl {
  children: FakeEl[] = [];
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  textContent = '';
  hidden = false;
  type = '';
  id = '';
  private fn: (() => void) | undefined;
  constructor(public tag: string) {}
  setAttribute(): void {}
  append(...n: FakeEl[]): void { this.children.push(...n); }
  appendChild(n: FakeEl): void { this.children.push(n); }
  replaceChildren(): void { this.children = []; }
  addEventListener(_e: string, f: () => void): void { this.fn = f; }
  click(): void { this.fn?.(); }
  focus(): void { FakeEl.focused = this; }
  static focused: FakeEl | undefined;
}

/** Minimal DOM stand-in (vitest env is node). Returns the screen plus probes. */
export function makeScreen(opts: { canContinue: boolean }) {
  (globalThis as unknown as { document: unknown }).document = { createElement: (t: string) => new FakeEl(t) };
  const chosen: string[] = [];
  let open = true;
  const session = {
    successionOffer: () =>
      open
        ? {
            canContinue: opts.canContinue,
            heir: null,
            ui: { screenCopy: 'Your fire went out. Someone remembers it.', buttons: { continue: 'Carry it on', quit: 'Let it rest' } },
          }
        : null,
    chooseSuccession: (c: string) => {
      chosen.push(c);
      open = false;
      return { ok: true };
    },
  } as unknown as PlaySession;
  const host = new FakeEl('body');
  const screen = createSuccessionScreen(session, host as unknown as HTMLElement);
  return { screen, el: screen.el as unknown as FakeEl, chosen, focused: () => FakeEl.focused?.textContent };
}
