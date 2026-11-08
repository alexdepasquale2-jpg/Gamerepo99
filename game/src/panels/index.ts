/**
 * PANELS area: hotbar + satchel, noticeboard (a tab for every board page), wagon trade, letters, world map +
 * minimap, and the road sheet at a signpost. Every sheet opens through ctx.ui.sheet, one at a time; the
 * hotbar and minimap sit in a click-through layer over the canvas. See game/README.md.
 */
import type { GameContext, PanelsApi } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import { boardPages } from '../sim/board-pages';
import { inventoryOf } from '../sim/goods/inventory';
import { unreadReplies } from '../sim/letter-replies';
import { createLayer, isTyping } from './dom';
import { createHotbar } from './hotbar';
import { createSheets } from './sheets';
import { SATCHEL_ID, satchelSheet } from './satchel';
import { boardSheet } from './board';
import { TRADE_ID, tradeSheet } from './trade';
import { lettersSheet } from './letters';
import { MAP_ID, createWorldMap } from './map';
import { createRoads } from './roads';

export function attachPanels(ctx: GameContext): PanelsApi {
  const layer = createLayer(ctx);
  const sheets = createSheets(ctx);
  const hotbar = createHotbar(ctx, layer.el);
  let trading: string | null = null;
  let boardAt: { townId: string; page: string } | null = null;

  const hudSync = (): void => {
    const st = ctx.session.getState();
    if (!st) return;
    ctx.ui.hud.purse(Math.max(0, inventoryOf(st).coin ?? 0));
    ctx.ui.hud.letters(unreadReplies(st));
  };

  const openSatchel = (): void => {
    sheets.open(satchelSheet(ctx, { held: hotbar.held, hold: hotbar.hold }));
  };
  const map = createWorldMap(ctx, layer.el, () => sheets.toggle(MAP_ID, openMap));
  function openMap(): void { sheets.open(map.sheet()); }
  const roads = createRoads(ctx, () => sheets.close());

  const api: PanelsApi = {
    satchel: {
      toggle: () => sheets.toggle(SATCHEL_ID, openSatchel),
      held: () => hotbar.held(),
      hold: (id) => hotbar.hold(id),
    },
    board: {
      open(townId, page) {
        const start = page ?? (boardAt?.townId === townId ? boardAt.page : 0);
        sheets.open(boardSheet(ctx, townId, start, (p) => { boardAt = { townId, page: p }; }));
      },
    },
    trade: {
      open(caravanId) {
        trading = caravanId;
        sheets.open(tradeSheet(ctx, caravanId, () => { if (trading === caravanId) trading = null; }));
      },
      current: () => (trading && sheets.current() === TRADE_ID ? trading : null),
    },
    letters: { open: () => sheets.open(lettersSheet(ctx)) },
    map: { toggle: () => sheets.toggle(MAP_ID, openMap) },
    roads: { open: (townId) => sheets.open(roads.sheet(townId)) },
    dragging: () => hotbar.dragging(),
    closeAll() {
      hotbar.cancelDrag();
      sheets.close();
    },
    anyOpen: () => sheets.current() !== null,
  };

  // Keys: 1–9 pick a hotbar slot, M the map. Only while nothing else (ring, sheet, menu) has the floor;
  // M also closes the map it opened. Escape drops a drag.
  const ringOpen = (): boolean => !!ctx.interact?.isOpen?.();
  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
    if (e.key === 'Escape') { hotbar.cancelDrag(); return; }
    const free = !ringOpen() && !api.anyOpen() && !ctx.ui.blocking();
    if (/^[1-9]$/.test(e.key) && free) { hotbar.selectSlot(Number(e.key) - 1); return; }
    if ((e.key === 'm' || e.key === 'M') && (free || sheets.current() === MAP_ID)) api.map.toggle();
  };
  window.addEventListener('keydown', onKey);

  const offs = [
    ctx.events.on('inventory', () => { hotbar.sync(); hudSync(); sheets.refresh(SATCHEL_ID); sheets.refresh(TRADE_ID); }),
    ctx.events.on('act', () => { hotbar.sync(); hudSync(); sheets.refresh(SATCHEL_ID); }),
    ctx.events.on('held-item', () => sheets.refresh(SATCHEL_ID)),
    ctx.events.on('dawn', () => { hotbar.sync(); hudSync(); }),
    ctx.events.on('arrive', () => { hotbar.sync(); hudSync(); }),
    ctx.events.on('state-replaced', () => { sheets.close(); hotbar.reset(); map.reset(); hudSync(); }),
  ];

  // One light tick: keep the layer on the canvas, catch inventory changes no event announced, redraw maps.
  const timer = window.setInterval(() => {
    layer.sync();
    hotbar.sync();
    const blocked = api.anyOpen() || ringOpen() || !!ctx.ui.blocking();
    map.tick(performance.now(), sheets.current() === MAP_ID, blocked);
  }, 250);
  hudSync();
  map.tick(performance.now(), false, false);

  const teardown = (): void => {
    window.clearInterval(timer);
    window.removeEventListener('keydown', onKey);
    offs.forEach((off) => off());
    hotbar.cancelDrag();
    map.destroy();
    layer.destroy();
  };
  ctx.scene.events.once('shutdown', teardown);
  ctx.scene.events.once('destroy', teardown);
  return api;
}

// ---- QA hooks (window.__hearth.dev) ----
registerDevHook('board', (ctx) => (townId?: string, page?: string | number) => {
  ctx.panels.board.open(townId ?? ctx.session.snapshot().townId, page);
  return boardPages().map((p) => p.id);
});
registerDevHook('openTrade', (ctx) => (id?: string) => {
  const caravans = ctx.session.getState()?.caravans ?? [];
  const pick = id ?? caravans[0]?.id;
  if (pick) ctx.panels.trade.open(pick);
  return { opened: pick ?? null, caravans: caravans.map((c) => c.id) };
});
registerDevHook('roads', (ctx) => () => {
  ctx.panels.roads.open(ctx.session.snapshot().townId);
  return ctx.session.roads().map((r) => ({ routeId: r.routeId, to: r.toId, walkDays: r.walkDays, offers: r.offers.map((o) => ({ tradeId: o.tradeId, name: o.name, spark: o.spark, coin: o.coin, days: o.days })) }));
});
registerDevHook('panels', (ctx) => () => ({
  open: ctx.panels.anyOpen(),
  held: ctx.panels.satchel.held(),
  trading: ctx.panels.trade.current(),
  slots: [...document.querySelectorAll<HTMLElement>('.hf-hotslot')].map((b) => b.dataset.item ?? null),
}));
