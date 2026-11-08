/**
 * The pad's binding table: what each button does, shared by the on-screen pad, real controllers and the
 * dev hooks. Buttons route by what has the floor:
 *   menu / modal  dirs move focus, A activates, B / Start back out
 *   ring open     dirs pick a chip (highlighted), A picks it, B steps out / closes
 *   sheet open    up/down move focus, left/right adjust, A activates, B closes (a sheet's own nav API wins)
 *   world         A act (held = hold-to-work), B put down, X satchel, Y talk to the nearest person,
 *                 Start pause, Select map (long press: quick menu), L/R cycle the hotbar
 * Where a keyboard path already exists we send the same key (E, 1–6, Esc), so the pad can never drift from
 * the keyboard: holding A is holding E, which is how hold-to-work is reached.
 */
import type { GameContext, Thing } from '../../app/contracts';
import { overlays } from '../kit/overlay-stack';
import type { Dir } from './move-source';

export type PadButton = 'a' | 'b' | 'x' | 'y' | 'start' | 'select' | 'l' | 'r' | Dir;
export const PAD_BUTTONS: readonly PadButton[] = ['a', 'b', 'x', 'y', 'start', 'select', 'l', 'r', 'up', 'down', 'left', 'right'];

/** W3C "standard" gamepad mapping: button index → pad button. */
export const STANDARD_MAP: Readonly<Record<number, PadButton>> = {
  0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'l', 5: 'r', 8: 'select', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right',
};

export type PadIo = {
  pause: () => void;
  satchel: () => void;
  map: () => void;
  letters: () => void;
  brood: () => void;
  hasBrood: () => boolean;
};

/** A sheet's own navigation (unit-provided, e.g. the shop): preferred over the generic focus walk. */
export type SheetNav = { moveFocus(dir: Dir): void; activate(): void; back(): void };
const sheetNavs = new Map<string, SheetNav>();
/** Register a sheet's nav API by its overlay / element id. Returns unregister. */
export function registerSheetNav(id: string, nav: SheetNav): () => void {
  sheetNavs.set(id, nav);
  return () => void (sheetNavs.get(id) === nav && sheetNavs.delete(id));
}

export type Floor = 'menu' | 'ring' | 'sheet' | 'world';

export type Bindings = {
  press(b: PadButton): void;
  release(b: PadButton): void;
  floor(): Floor;
  /** Directions navigate (not walk) on this floor. */
  navigating(): boolean;
  /** Keep the ring highlight on the DOM (once a frame). */
  tick(): void;
};

const SELECT_LONG_MS = 500;
const ARRIVE_SLACK = 1.4;
const TALK_RADIUS = 160;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export const HL = 'hf-pad-hl';

/** Send a key through the same listeners a real key reaches (window capture: overlay stack, ring, hotkeys). */
export function sendKey(type: 'keydown' | 'keyup', key: string, code: string): void {
  window.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }));
}
const tapKey = (key: string, code: string): void => (sendKey('keydown', key, code), sendKey('keyup', key, code));
const escape = (): void => tapKey('Escape', 'Escape');

const visible = (el: HTMLElement): boolean => el.getClientRects().length > 0 && !el.closest('[hidden]');

/** The element of whatever DOM overlay is on top (menu, modal or sheet). */
function topOverlayEl(): HTMLElement | null {
  const el = overlays.top()?.el;
  if (el instanceof HTMLElement) return el;
  return document.querySelector<HTMLElement>('.hf-sheet[open]');
}

/** Generic focus walk among an overlay's visible focusables. */
function moveFocusIn(root: HTMLElement, step: number): void {
  const list = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
  if (!list.length) return;
  const at = list.indexOf(document.activeElement as HTMLElement);
  const next = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
  for (const el of root.querySelectorAll(`.${HL}`)) el.classList.remove(HL);
  const el = list[next]!;
  el.focus({ preventScroll: false });
  el.classList.add(HL);
  el.scrollIntoView?.({ block: 'nearest' });
}

/** Left/right on a range, number or select nudges its value; true when it did. */
function adjust(el: Element | null, step: number): boolean {
  if (el instanceof HTMLInputElement && (el.type === 'range' || el.type === 'number')) {
    if (step > 0) el.stepUp(); else el.stepDown();
  } else if (el instanceof HTMLSelectElement && el.options.length) {
    el.selectedIndex = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + step));
  } else return false;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function activateIn(root: HTMLElement): void {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !root.contains(el) || el === root) return moveFocusIn(root, 1);
  // Some kit controls act on pointerup (like the ring's chips); a click covers buttons and links.
  el.click();
}

export function createBindings(ctx: GameContext, io: PadIo): Bindings {
  let ringSel = 0;
  let ringSig = '';
  let selectTimer = 0;
  let selectLong = false;
  let aDown = false;

  const ringOpen = (): boolean => !!ctx.interact?.isOpen?.();
  const floor = (): Floor => {
    if (overlays.count('menu', 'modal') > 0) return 'menu';
    if (ringOpen()) return 'ring';
    if (ctx.panels?.anyOpen?.() || overlays.count('sheet') > 0) return 'sheet';
    return 'world';
  };

  const chips = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.ix-ring .ix-chip')];
  const paintRing = (): void => {
    const list = chips();
    const sig = list.map((c) => c.dataset.id).join('|');
    if (sig !== ringSig) { ringSig = sig; ringSel = 0; }
    ringSel = Math.max(0, Math.min(list.length - 1, ringSel));
    list.forEach((c, i) => c.classList.toggle(HL, i === ringSel));
  };
  /** Chips sit in rows of three (ring.ts PER_ROW). */
  const ringNav = (d: Dir): void => {
    const n = chips().length;
    if (!n) return;
    const step = d === 'left' ? -1 : d === 'right' ? 1 : d === 'up' ? -3 : 3;
    ringSel = (ringSel + step + n * 3) % n;
    paintRing();
  };

  const sheetNav = (): SheetNav | null => {
    const el = topOverlayEl();
    const id = overlays.top()?.id ?? el?.id ?? '';
    return sheetNavs.get(id) ?? (el?.id ? sheetNavs.get(el.id) : undefined) ?? null;
  };

  const overlayNav = (d: Dir, isSheet: boolean): void => {
    const own = isSheet ? sheetNav() : null;
    if (own) return own.moveFocus(d);
    const root = topOverlayEl();
    if (!root) return;
    const vertical = d === 'up' || d === 'down';
    const step = d === 'up' || d === 'left' ? -1 : 1;
    if (!vertical && isSheet && adjust(document.activeElement, step)) return;
    moveFocusIn(root, step);
  };

  /** Hotbar slots in order (DOM-read so the hotbar keeps its own API); the cycle includes "hands empty". */
  const cycleHotbar = (dir: number): void => {
    const ids = [...document.querySelectorAll<HTMLElement>('.hf-hotslot[data-item]:not(.is-empty)')]
      .map((b) => b.dataset.item!).filter(Boolean);
    if (!ids.length) return;
    const ring: (string | null)[] = [null, ...ids];
    const at = Math.max(0, ring.indexOf(ctx.panels.satchel.held()));
    ctx.panels.satchel.hold(ring[(at + dir + ring.length) % ring.length]!);
  };

  /** Y: the nearest person, opened at once in reach, else walked to first. */
  const talk = (): void => {
    const p = ctx.actors.player.pos();
    const near = ctx.actors.things(p, TALK_RADIUS).filter((t) => t.kind === 'person');
    const d = (t: Thing): number => Math.hypot(t.x - p.x, t.y - p.y);
    near.sort((a, b) => d(a) - d(b));
    const who = near[0];
    if (!who) return ctx.voice.tell('No one near.', 'player');
    const reach = who.reach ?? 48;
    if (d(who) <= reach) return ctx.interact.open(who);
    void ctx.actors.player.walkTo({ x: who.x, y: who.y }).then(() => {
      if (floor() !== 'world') return;
      const now = ctx.actors.things(ctx.actors.player.pos(), TALK_RADIUS).find((t) => t.key === who.key) ?? who;
      if (d(now) <= reach * ARRIVE_SLACK) ctx.interact.open(now);
    });
  };

  /** B with nothing open: put down a carried load (carry API when present), else lower the held item. */
  const putDown = (): void => {
    const s = ctx.session as unknown as { putDown?: () => unknown; drop?: () => unknown };
    const dev = (window as unknown as { __hearth?: { dev?: Record<string, unknown> } }).__hearth?.dev;
    const carry = dev?.carry as { putDown?: () => unknown; drop?: () => unknown } | undefined;
    const fn = s.putDown ?? carry?.putDown ?? carry?.drop;
    if (typeof fn === 'function') { fn.call(s.putDown ? s : carry); return; }
    if (ctx.panels.satchel.held()) ctx.panels.satchel.hold(null);
  };

  const quickMenu = (): void => {
    const items = [
      { id: 'letters', label: 'Letters' },
      ...(io.hasBrood() ? [{ id: 'brood', label: 'Brood' }] : []),
      { id: 'satchel', label: 'Satchel' },
      { id: 'map', label: 'Map' },
    ];
    ctx.ui.menu({
      id: 'hf-pad-quick',
      title: 'Quick',
      items,
      onPick: (id) => (id === 'letters' ? io.letters() : id === 'brood' ? io.brood() : id === 'satchel' ? io.satchel() : io.map()),
    });
  };

  const press = (b: PadButton): void => {
    const f = floor();
    if (b === 'up' || b === 'down' || b === 'left' || b === 'right') {
      if (f === 'ring') ringNav(b);
      else if (f === 'menu' || f === 'sheet') overlayNav(b, f === 'sheet');
      return; // in the world, directions walk (move-source), not press
    }
    switch (b) {
      case 'a':
        if (f === 'ring') { paintRing(); return tapKey(String(ringSel + 1), `Digit${ringSel + 1}`); }
        if (f === 'menu' || f === 'sheet') {
          const own = f === 'sheet' ? sheetNav() : null;
          if (own) return own.activate();
          const root = topOverlayEl();
          return root ? activateIn(root) : undefined;
        }
        aDown = true;
        return sendKey('keydown', 'e', 'KeyE');
      case 'b':
        if (f === 'sheet') { const own = sheetNav(); if (own) return own.back(); }
        if (f !== 'world' || overlays.escapeClaimed()) return escape();
        return putDown();
      case 'x':
        return f === 'menu' ? undefined : io.satchel();
      case 'y':
        return f === 'world' ? talk() : undefined;
      case 'start':
        return f === 'menu' ? escape() : io.pause();
      case 'select':
        if (f === 'menu') return;
        selectLong = false;
        window.clearTimeout(selectTimer);
        selectTimer = window.setTimeout(() => { selectLong = true; quickMenu(); }, SELECT_LONG_MS);
        return;
      case 'l':
      case 'r':
        return f === 'world' || f === 'sheet' ? cycleHotbar(b === 'r' ? 1 : -1) : undefined;
      default:
    }
  };

  const release = (b: PadButton): void => {
    if (b === 'a' && aDown) {
      aDown = false;
      sendKey('keyup', 'e', 'KeyE');
    } else if (b === 'select' && selectTimer) {
      window.clearTimeout(selectTimer);
      selectTimer = 0;
      if (!selectLong) io.map();
    }
  };

  return {
    press,
    release,
    floor,
    navigating: () => floor() !== 'world',
    tick: () => { if (ringOpen()) paintRing(); else ringSig = ''; },
  };
}
