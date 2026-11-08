/**
 * The pad: one input layer for touch screens and real controllers.
 *  - Touch: a floating d-pad / joystick on the left, A B X Y on the right, Start / Select top centre,
 *    L / R shoulders above each cluster. Shown on touch (coarse pointer, narrow window, or any touch);
 *    keyboard input hides it again. `body[data-pad=on]` while shown, so the kit can make room.
 *  - Controllers: polled once a frame (own rAF loop, so it still drives the pause menu while the game is
 *    paused); a pad in use shows a glyph hint strip instead of the on-screen pad.
 * What every button does lives in bindings.ts; movement goes through move-source.ts to the player.
 */
import type { GameContext } from '../../app/contracts';
import { registerDevHook } from '../../app/dev-hooks';
import { uiLayer } from '../kit/layer';
import { createBindings, PAD_BUTTONS, type PadButton, type PadIo } from './bindings';
import { createButtons } from './buttons';
import { createDPad } from './dpad';
import { glyphStyle, readGamepad } from './gamepad';
import { cardinal, setNavigating, setStick, type Dir, type Stick } from './move-source';
import { ensurePadStyle } from './style';

export type InputMode = 'touch' | 'keys' | 'gamepad';

export type Pad = {
  setAct(label: string | null): void;
  setBrood(show: boolean): void;
  setLetters(unread: number): void;
  shown(): boolean;
  onShownChange(fn: (shown: boolean) => void): void;
  mode(): InputMode;
  press(b: PadButton): void;
  release(b: PadButton): void;
  stick(x: number, y: number): void;
  destroy(): void;
};

/** Room the on-screen pad needs under a tall phone's canvas (sheets docked below stop above it). */
const PAD_RESERVE = 176;
const NARROW_PX = 760;
const REPEAT_FIRST_MS = 340;
const REPEAT_MS = 110;

const wantsTouch = (): boolean =>
  (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || window.innerWidth < NARROW_PX;

const pads = new WeakMap<GameContext, Pad>();

export function createPad(ctx: GameContext, io: PadIo): Pad {
  ensurePadStyle();
  const layer = uiLayer();
  const binds = createBindings(ctx, io);
  setNavigating(binds.navigating);

  const root = document.createElement('div');
  root.id = 'hf-pad';
  root.className = 'hf-pad';
  root.hidden = true;
  const dpad = createDPad((v) => setStick('touch', v.x, v.y));
  const buttons = createButtons((b) => binds.press(b), (b) => binds.release(b));
  root.append(dpad.el, buttons.el);
  document.body.appendChild(root);

  const hints = document.createElement('div');
  hints.id = 'hf-pad-hints';
  hints.className = 'hf-pad-hints';
  hints.hidden = true;
  hints.setAttribute('aria-hidden', 'true');
  document.body.appendChild(hints);

  let mode: InputMode = wantsTouch() ? 'touch' : 'keys';
  let shown = false;
  let listener: ((s: boolean) => void) | null = null;
  let actLabel: string | null = null;
  let glyphs: 'ps' | 'abxy' = 'abxy';
  let devStick: Stick = { x: 0, y: 0 };

  const paintHints = (): void => {
    const g = glyphs === 'ps' ? { a: '✕', b: '○', x: '□', y: '△' } : { a: 'A', b: 'B', x: 'X', y: 'Y' };
    const rows: [string, string][] = [
      [g.a, actLabel ?? 'Act'], [g.b, 'Back'], [g.x, 'Satchel'], [g.y, 'Talk'], ['☰', 'Pause'], ['⧉', 'Map'], ['LB RB', 'Hotbar'],
    ];
    hints.replaceChildren(...rows.map(([k, t]) => {
      const s = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = k;
      s.append(b, document.createTextNode(` ${t}`));
      return s;
    }));
  };

  const paint = (): void => {
    const want = mode === 'touch';
    root.hidden = !want;
    hints.hidden = mode !== 'gamepad';
    document.body.dataset.input = mode;
    if (want) document.body.dataset.pad = 'on';
    else delete document.body.dataset.pad;
    layer.setBottomReserve(want ? PAD_RESERVE : 0);
    if (!want) { dpad.release(); setStick('touch', 0, 0); }
    if (want !== shown) {
      shown = want;
      listener?.(shown);
    }
  };
  const setMode = (m: InputMode): void => {
    if (m === mode) return;
    mode = m;
    if (m === 'gamepad') paintHints();
    paint();
  };

  // Whatever the player touched last decides which layer shows.
  const onKey = (e: KeyboardEvent): void => { if (e.isTrusted) setMode('keys'); };
  const onPointer = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') setMode('touch');
    else if (mode === 'gamepad') setMode('keys');
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onPointer, true);
  const onConnect = (e: GamepadEvent): void => { glyphs = glyphStyle(e.gamepad.id); setMode('gamepad'); };
  window.addEventListener('gamepadconnected', onConnect);
  const mq = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
  const onMq = (): void => { if (mq?.matches) setMode('touch'); };
  mq?.addEventListener?.('change', onMq);

  // ---- the frame loop: controller edges, movement, menu-navigation repeat, ring highlight ----
  let prevHeld = new Set<PadButton>();
  let lastDir: Dir | null = null;
  let nextAt = 0;
  let raf = 0;
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    const gp = readGamepad();
    if (gp?.active && mode !== 'gamepad') { glyphs = glyphStyle(gp.id); setMode('gamepad'); }
    const held = gp?.held ?? new Set<PadButton>();
    for (const b of held) if (!prevHeld.has(b) && !isDir(b)) binds.press(b);
    for (const b of prevHeld) if (!held.has(b) && !isDir(b)) binds.release(b);
    prevHeld = held;
    setStick('gamepad', gp?.vec.x ?? 0, gp?.vec.y ?? 0);

    // Directions navigate menus / the ring: edge, then auto-repeat while held. In the world they walk.
    const t = dpad.vector();
    const v = gp && (gp.vec.x || gp.vec.y) ? gp.vec : t.x || t.y ? t : devStick;
    const dir = cardinal(v.x, v.y);
    if (!binds.navigating()) lastDir = dir;
    else if (dir !== lastDir) {
      lastDir = dir;
      if (dir) { binds.press(dir); nextAt = now + REPEAT_FIRST_MS; }
    } else if (dir && now >= nextAt) {
      binds.press(dir);
      nextAt = now + REPEAT_MS;
    }
    binds.tick();
  };
  raf = requestAnimationFrame(frame);
  paint();

  const pad: Pad = {
    setAct(label) {
      actLabel = label;
      buttons.setLabel('a', label ?? 'Act');
      buttons.btn('a')?.classList.toggle('is-live', !!label);
      if (mode === 'gamepad') paintHints();
    },
    setBrood(_show) { /* Brood lives in Select's quick menu; bindings ask io.hasBrood() when it opens. */ },
    setLetters(n) {
      buttons.setBadge('select', n);
      buttons.btn('select')?.setAttribute('aria-label', n > 0 ? `Map (hold: letters, ${n} unread)` : 'Map');
    },
    shown: () => shown,
    onShownChange(fn) {
      listener = fn;
      fn(shown);
    },
    mode: () => mode,
    press: (b) => binds.press(b),
    release: (b) => binds.release(b),
    stick(x, y) {
      devStick = { x, y };
      setStick('dev', x, y);
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('gamepadconnected', onConnect);
      mq?.removeEventListener?.('change', onMq);
      for (const s of ['touch', 'gamepad', 'dev']) setStick(s, 0, 0);
      setNavigating(() => false);
      layer.setBottomReserve(0);
      delete document.body.dataset.pad;
      delete document.body.dataset.input;
      root.remove();
      hints.remove();
      pads.delete(ctx);
    },
  };
  pads.set(ctx, pad);
  return pad;
}

const isDir = (b: PadButton): b is Dir => b === 'up' || b === 'down' || b === 'left' || b === 'right';

// ---- QA hooks (window.__hearth.dev.pad) ----
registerDevHook('pad', (ctx) => {
  const get = (): Pad => {
    const p = pads.get(ctx);
    if (!p) throw new Error('pad not attached');
    return p;
  };
  const check = (b: string): PadButton => {
    if (!(PAD_BUTTONS as readonly string[]).includes(b)) throw new Error(`no pad button ${b}`);
    return b as PadButton;
  };
  return {
    press(b: string) { const p = get(); const k = check(b); p.press(k); p.release(k); },
    hold(b: string, ms = 600): Promise<void> {
      const p = get();
      const k = check(b);
      // A held direction in the world walks, like holding the stick that way.
      const v = isDir(k) ? { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[k] : null;
      if (v) p.stick(v[0]!, v[1]!);
      p.press(k);
      return new Promise((done) => setTimeout(() => {
        p.release(k);
        if (v) p.stick(0, 0);
        done();
      }, ms));
    },
    stick: (x: number, y: number) => get().stick(x, y),
    mode: () => get().mode(),
    shown: () => get().shown(),
  };
});
