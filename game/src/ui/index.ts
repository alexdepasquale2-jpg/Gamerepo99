/**
 * UI area: the kit, the HUD, the title flow, the pause menu and saves, the succession and hoard
 * ending modals, the touch bar, keyboard shortcuts and the dev menu. See game/README.md.
 *
 * - runTitleFlow(app): title → who → which world → app.start; pause menu; dawn autosave (flow.ts)
 * - trackCanvas(canvas): the DOM layer follows the Phaser canvas (kit/layer.ts)
 * - attachUi(ctx): this run's UiApi; it refreshes the HUD from session state on events, never polls
 *   (one light per-second tick moves the day phase word).
 */
import type { GameContext, UiApi } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import { unreadReplies } from '../sim/letter-replies';
import { inventoryOf } from '../sim/goods/inventory';
import { uiLayer } from './kit/layer';
import { openMenu } from './kit/menu';
import { overlays } from './kit/overlay-stack';
import { ensureKitStyle } from './kit/style';
import { createHud } from './hud';
import { createTouchBar } from './touch-bar';
import { createSheetHost } from './sheets';
import { attachEndScreens } from './end-screens';
import { installShortcuts } from './keys';
import { isBrood, openBroodMenu } from './brood-menu';
import { createDevMenu } from './dev-menu';
import { createGodMenu } from './god/god-menu';
import { applyMuted } from './sound';
import { beginRun, endRun, getFlow } from './run';

export { runTitleFlow } from './flow';

/** The DOM layer follows the Phaser canvas (null when the game stops). */
export function trackCanvas(canvas: HTMLCanvasElement | null): void {
  uiLayer().track(canvas);
}

/** A bare pause menu for runs started without the title flow (dev harnesses). */
function fallbackPause(): void {
  if (overlays.count('menu', 'modal') > 0) return;
  const h = openMenu('Paused', [{ id: 'resume', label: 'Resume', onPick: () => h.close() }], { id: 'hf-pause-menu' });
}

export function attachUi(ctx: GameContext): UiApi {
  ensureKitStyle();
  const session = ctx.session;
  const pause = (): void => (getFlow()?.pause ?? fallbackPause)();
  const brood = (): void => void openBroodMenu(ctx);
  const letters = (): void => ctx.panels.letters.open();

  const hud = createHud({ onLetters: letters, onMenu: pause });
  const touch = createTouchBar(ctx, {
    act: () => ctx.interact.open(),
    brood,
    satchel: () => ctx.panels.satchel.toggle(),
    map: () => ctx.panels.map.toggle(),
    letters,
    menu: pause,
  });
  touch.onShownChange((shown) => hud.setMenuButton(!shown));
  const sheets = createSheetHost(ctx);
  const god = createGodMenu(ctx);
  const dev = createDevMenu(ctx, god?.open);

  /** Everything the HUD shows, from session state. */
  const refresh = (): void => {
    const st = session.getState();
    const snap = session.snapshot();
    const max = st?.player.sparkMax ?? 100;
    hud.spark(max > 0 ? snap.spark / max : 0);
    hud.day(st?.day ?? snap.day, ctx.world.phase());
    const unread = st ? unreadReplies(st) : 0;
    hud.letters(unread);
    touch.setLetters(unread);
    hud.purse(st ? Math.max(0, inventoryOf(st).coin ?? 0) : 0);
    touch.setBrood(isBrood(ctx));
    const d = hud.status.dataset;
    d.fingerprint = snap.fingerprint;
    d.spark = String(snap.spark);
    d.world = String(session.getSeed());
  };
  let live = true;
  let queued = false;
  const soon = (): void => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (live) refresh();
    });
  };

  const offs: (() => void)[] = [
    ctx.events.on('act', soon),
    ctx.events.on('dawn', soon),
    ctx.events.on('inventory', soon),
    ctx.events.on('state-replaced', soon),
    ctx.events.on('arrive', soon),
    session.onJuice(soon),
    installShortcuts(ctx, { pause, brood, dev: dev?.toggle, god: god?.toggle }),
    attachEndScreens(ctx, { onRested: () => getFlow()?.title() }),
  ];
  // The day phase moves on its own; a light once-a-second read keeps the word right.
  const phaseTimer = setInterval(() => {
    const st = session.getState();
    if (st) hud.day(st.day, ctx.world.phase());
  }, 1000);
  // Tell the other areas when something blocking opens or closes.
  let wasOpen = overlays.count() > 0;
  offs.push(
    overlays.subscribe(() => {
      const open = overlays.count() > 0;
      if (open === wasOpen) return;
      wasOpen = open;
      ctx.events.emit('overlay', { open });
    }),
  );

  const run = beginRun(ctx, () => {
    live = false;
    clearInterval(phaseTimer);
    for (const off of offs) off();
    sheets.destroy();
    dev?.destroy();
    god?.destroy();
    touch.destroy();
    hud.destroy();
  });
  const teardown = (): void => endRun(run);
  ctx.scene.events.once('shutdown', teardown);
  ctx.scene.events.once('destroy', teardown);
  applyMuted(ctx);
  refresh();

  const api: UiApi = {
    hud: {
      spark: (v) => hud.spark(v),
      day: (d, p) => hud.day(d, p),
      letters: (n) => (hud.letters(n), touch.setLetters(n)),
      purse: (c) => hud.purse(c),
    },
    sheet: (def) => sheets.sheet(def),
    menu(opts) {
      const h = openMenu(
        opts.title,
        opts.items.map((it) => ({ ...it, onPick: () => (h.close(), opts.onPick(it.id)) })),
        { id: opts.id, onEscape: () => (h.close(), opts.onBack?.()) },
      );
    },
    blocking: () => overlays.count() > 0,
    setActLabel: (label) => touch.setAct(label),
  };
  return api;
}

registerDevHook('ui', (ctx) => ({
  blocking: () => ctx.ui.blocking(),
  overlays: () => overlays.list().map((o) => `${o.kind}:${o.id}`),
  pause: () => getFlow()?.pause(),
  brood: () => openBroodMenu(ctx),
}));
