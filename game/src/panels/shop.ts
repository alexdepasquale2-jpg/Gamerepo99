/**
 * The shop sheet: one sheet for every stall, counter, pedlar and wagon (sim/goods/shop). Two columns,
 * "Their goods" and "Your satchel"; tapping a row puts one in the basket, the stepper changes how many, and
 * a sticky footer adds it all up: coin out, coin in, net, your purse after. One Settle moves the whole
 * basket at once (or tells you why it can't). In a narrow sheet (a phone, a slim window) the columns become
 * Buy / Sell tabs.
 *
 * Keys while it is open: Up/Down move the focused row, Tab switches column, Enter adds one, Right/+ and
 * Left/- step the count, Backspace takes the row out of the basket, S settles, Esc closes (the overlay
 * stack). `shopNav` exposes the same moves (moveFocus / activate / back / settle) so a gamepad can drive it.
 */
import type { GameContext, SheetDef } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import { BROWSE_VERB, SHOP_VERB, shopRefOfTarget } from '../sim/contrib/shop';
import { parseShopRef, quoteBasket, settle, shopKey, shopStock, type Basket, type ShopLine, type ShopRef, type ShopView } from '../sim/goods/shop';
import { parseTargetAction } from '../sim/play-session/targets';
import { button, el, isTyping } from './dom';
import { itemIcon } from './icons';
import { ensureShopStyles } from './style';
import { registerSheetNav } from '../ui/pad/bindings';

export const SHOP_ID = 'shop';
type Side = 'theirs' | 'yours';
export type ShopDir = 'up' | 'down' | 'left' | 'right' | 'tab';

export type ShopNav = {
  /** Up/Down move the focused row; Left/Right step its count; tab switches column. */
  moveFocus(dir: ShopDir): void;
  /** Add one of the focused row to the basket. */
  activate(): void;
  /** Close the sheet. */
  back(): void;
  settle(): void;
  clear(): void;
  isOpen(): boolean;
  /** The shop being browsed, as `kind:id`, or null. */
  current(): string | null;
};

type Controller = Omit<ShopNav, 'isOpen' | 'current'> & { ref: ShopRef };
let active: Controller | null = null;

/** Drives whichever shop sheet is open (no-ops while none is). For the gamepad and QA. */
export const shopNav: ShopNav = {
  moveFocus: (d) => active?.moveFocus(d),
  activate: () => active?.activate(),
  back: () => active?.back(),
  settle: () => active?.settle(),
  clear: () => active?.clear(),
  isOpen: () => !!active,
  current: () => (active ? shopKey(active.ref) : null),
};

const SIDE_KEY: Record<Side, keyof Basket> = { theirs: 'buy', yours: 'sell' };
const coins = (n: number): string => `${n}c`;
const TONE_TIP: Record<string, string> = { cheap: 'below the usual price', fair: 'about the usual price', dear: 'above the usual price' };

export type ShopSheetOpts = {
  /** A line under the title (the wagon's road and where it is bound). */
  subtitle?: () => string;
  /** Sheet id (the wagon keeps the trade id the actors area watches). */
  id?: string;
};

export function shopSheet(ctx: GameContext, ref: ShopRef, onClose?: () => void, opts: ShopSheetOpts = {}): SheetDef {
  const basket: Basket = { buy: {}, sell: {} };
  let side: Side = 'theirs';
  const focus: Record<Side, number> = { theirs: 0, yours: 0 };
  let message = '';
  let bodyEl: HTMLElement | null = null;
  let view: ShopView | null = null;
  let scrollFocus = false;

  const rowsOf = (s: Side): ShopLine[] => (view ? (s === 'theirs' ? view.theirs : view.yours) : []);
  const inBasket = (s: Side, itemId: string): number => basket[SIDE_KEY[s]][itemId] ?? 0;
  const setQty = (s: Side, itemId: string, n: number): void => {
    const row = rowsOf(s).find((r) => r.itemId === itemId);
    const cap = row && !row.refused ? row.count : 0;
    const q = Math.max(0, Math.min(cap, n));
    const b = basket[SIDE_KEY[s]];
    if (q) b[itemId] = q; else delete b[itemId];
  };
  const focused = (): ShopLine | undefined => rowsOf(side)[focus[side]];
  const rerender = (): void => { if (bodyEl) def.render(bodyEl); };
  const step = (s: Side, itemId: string, by: number): void => {
    setQty(s, itemId, inBasket(s, itemId) + by);
    message = '';
    rerender();
  };

  const doSettle = (): void => {
    const st = ctx.session.getState();
    if (!st) return;
    const res = settle(st, ref, basket);
    if (res.ok) {
      basket.buy = {};
      basket.sell = {};
      message = res.line;
      ctx.voice?.sfx?.('pickup');
      if (res.keeperId && res.say) ctx.voice?.say?.(res.keeperId, res.say);
    } else {
      message = res.line;
      ctx.voice?.sfx?.('refuse');
    }
    ctx.events.emit('inventory', {});
    rerender();
  };

  const ctl: Controller = {
    ref,
    moveFocus(dir) {
      const rows = rowsOf(side);
      if (dir === 'tab') { side = side === 'theirs' ? 'yours' : 'theirs'; }
      else if (dir === 'up' || dir === 'down') {
        if (rows.length) focus[side] = (focus[side] + (dir === 'down' ? 1 : -1) + rows.length) % rows.length;
      } else {
        const r = focused();
        if (r) setQty(side, r.itemId, inBasket(side, r.itemId) + (dir === 'right' ? 1 : -1));
      }
      scrollFocus = true;
      rerender();
    },
    activate() { const r = focused(); if (r) step(side, r.itemId, 1); },
    back() { ctx.panels.closeAll(); },
    settle: doSettle,
    clear() { basket.buy = {}; basket.sell = {}; message = ''; rerender(); },
  };

  const onKey = (e: KeyboardEvent): void => {
    if (active !== ctl || e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
    const k = e.key;
    const take = (): void => { e.preventDefault(); e.stopPropagation(); };
    if (k === 'ArrowUp' || k === 'ArrowDown') { take(); ctl.moveFocus(k === 'ArrowUp' ? 'up' : 'down'); }
    else if (k === 'Tab') { take(); ctl.moveFocus('tab'); }
    else if (k === 'ArrowRight' || k === '+' || k === '=') { take(); ctl.moveFocus('right'); }
    else if (k === 'ArrowLeft' || k === '-' || k === '_') { take(); ctl.moveFocus('left'); }
    else if (k === 'Enter' || k === ' ') { take(); ctl.activate(); }
    else if (k === 'Backspace' || k === 'Delete') { take(); const r = focused(); if (r) { setQty(side, r.itemId, 0); rerender(); } }
    else if ((k === 's' || k === 'S') && !e.repeat) { take(); ctl.settle(); }
  };

  const rowEl = (s: Side, r: ShopLine, i: number): HTMLElement => {
    const n = inBasket(s, r.itemId);
    const isFocus = s === side && i === focus[s];
    const row = el('div', `hf-shop__row${isFocus ? ' is-focus' : ''}${n ? ' is-picked' : ''}${r.refused ? ' is-refused' : ''}`, undefined, {
      role: 'option', 'aria-selected': isFocus, 'data-item': r.itemId, 'data-side': s,
    });
    const main = el('button', 'hf-shop__pick', undefined, {
      type: 'button', disabled: r.refused || n >= r.count,
      title: r.refused ? `They won't take ${r.name}` : `${s === 'theirs' ? 'Buy' : 'Sell'} ${r.name} · ${coins(r.price)} (${TONE_TIP[r.tone]})`,
    });
    const price = el('span', `hf-shop__price is-${r.refused ? 'none' : r.tone}`, r.refused ? '—' : coins(r.price));
    main.append(itemIcon(r.itemId), el('span', 'hf-shop__name', r.name), price, el('span', 'hf-shop__count hf-num', `×${r.count}`));
    main.addEventListener('click', (e) => { e.stopPropagation(); side = s; focus[s] = i; step(s, r.itemId, 1); });
    row.append(main);
    if (n) {
      const stepper = el('div', 'hf-shop__step');
      stepper.append(
        button('−', () => { side = s; focus[s] = i; step(s, r.itemId, -1); }, { title: 'One fewer', cls: 'hf-shop__stepbtn' }),
        el('span', 'hf-shop__qty hf-num', `${n} · ${coins(n * r.price)}`),
        button('+', () => { side = s; focus[s] = i; step(s, r.itemId, 1); }, { title: 'One more', cls: 'hf-shop__stepbtn', disabled: n >= r.count }),
      );
      row.append(stepper);
    }
    return row;
  };

  const column = (s: Side, v: ShopView): HTMLElement => {
    const col = el('section', 'hf-shop__col', undefined, { 'data-side': s });
    const head = el('h3', 'hf-subhead hf-shop__head', s === 'theirs' ? 'Their goods' : 'Your satchel');
    head.append(el('span', 'hf-shop__purse hf-num', s === 'theirs' ? `till ${coins(v.purse)}` : `purse ${coins(v.coin)}`));
    col.append(head);
    const rows = rowsOf(s);
    const list = el('div', 'hf-rows hf-shop__rows', undefined, { role: 'listbox', 'aria-label': s === 'theirs' ? 'Their goods' : 'Your satchel' });
    rows.forEach((r, i) => list.append(rowEl(s, r, i)));
    if (!rows.length) list.append(el('p', 'hf-muted hf-small', s === 'theirs' ? (v.closed ?? 'Their shelves are bare today.') : 'Your satchel is empty.'));
    col.append(list);
    return col;
  };

  const footer = (v: ShopView): HTMLElement => {
    const st = ctx.session.getState()!;
    const q = quoteBasket(st, ref, basket, v);
    const foot = el('div', 'hf-shop__foot');
    if (q.lines.length) {
      const ul = el('ul', 'hf-shop__basket');
      for (const l of q.lines) {
        const li = el('li', `hf-shop__line is-${l.side}`);
        li.append(el('span', '', `${l.side === 'buy' ? 'Buy' : 'Sell'} ${l.qty} ${l.name}`), el('span', 'hf-num', `${l.side === 'buy' ? '−' : '+'}${coins(l.total)}`));
        ul.append(li);
      }
      foot.append(ul);
    } else foot.append(el('p', 'hf-muted hf-small', 'Tap a row to put it in the basket.'));
    const sum = el('div', 'hf-shop__sum hf-small');
    sum.append(
      el('span', '', `Out ${coins(q.out)}`), el('span', '', `In ${coins(q.in)}`),
      el('span', `hf-shop__net${q.net < 0 ? ' is-out' : q.net > 0 ? ' is-in' : ''}`, `Net ${q.net > 0 ? '+' : ''}${coins(q.net)}`),
      el('span', '', `Purse after ${coins(Math.max(0, q.coinAfter))}`),
    );
    foot.append(sum);
    if (!q.ok && q.lines.length && q.reason) foot.append(el('p', 'hf-shop__why hf-small', q.reason));
    const acts = el('div', 'hf-shop__acts');
    acts.append(
      button('Clear', () => ctl.clear(), { cls: 'hf-shop__clear', disabled: !q.lines.length, title: 'Empty the basket' }),
      button('Settle', () => ctl.settle(), { cls: 'hf-shop__settle', disabled: !q.ok, title: q.ok ? 'Settle the basket (S)' : (q.reason ?? '') }),
    );
    foot.append(acts);
    return foot;
  };

  const def: SheetDef = {
    id: opts.id ?? SHOP_ID,
    title: (() => { const st = ctx.session.getState(); return st ? shopStock(st, ref).title : 'Shop'; })(),
    onClose() {
      if (active === ctl) active = null;
      window.removeEventListener('keydown', onKey, true);
      onClose?.();
    },
    render(body) {
      if (!bodyEl) {
        // First render = the sheet just opened: take the keys (capture, so the world's arrow keys don't walk).
        active = ctl;
        window.addEventListener('keydown', onKey, true);
      }
      bodyEl = body;
      ensureShopStyles();
      const st = ctx.session.getState();
      body.replaceChildren();
      if (!st) return;
      view = shopStock(st, ref);
      // Stock and satchel may have changed under us: the basket never asks for more than is there.
      for (const s of ['theirs', 'yours'] as const) {
        for (const id of Object.keys(basket[SIDE_KEY[s]])) setQty(s, id, inBasket(s, id));
        focus[s] = Math.max(0, Math.min(focus[s], rowsOf(s).length - 1));
      }
      const root = el('div', 'hf-shop', undefined, { 'data-col': side });
      const sub = opts.subtitle?.();
      if (sub) root.append(el('p', 'hf-muted hf-small hf-shop__sub', sub));
      const tabs = el('div', 'hf-tabs hf-shop__tabs', undefined, { role: 'tablist' });
      const tab = (s: Side, label: string): HTMLButtonElement => button(label, () => { side = s; rerender(); }, { pressed: side === s, cls: 'hf-shop__tab' });
      tabs.append(tab('theirs', 'Buy'), tab('yours', 'Sell'));
      const cols = el('div', 'hf-shop__cols');
      cols.append(column('theirs', view), column('yours', view));
      root.append(tabs, cols, footer(view));
      if (message) root.append(el('p', 'hf-note hf-small hf-shop__msg', message));
      body.append(root);
      if (scrollFocus) {
        scrollFocus = false;
        body.querySelector<HTMLElement>('.hf-shop__row.is-focus')?.scrollIntoView?.({ block: 'nearest' });
      }
    },
  };
  return def;
}

/** Open the shop sheet when a stall's Shop verb or a person's Browse wares chip goes through. */
export function watchShopVerbs(ctx: GameContext, open: (ref: ShopRef) => void): () => void {
  return ctx.events.on('act', (e) => {
    const verb = parseTargetAction(e.actionId)?.verb;
    if (!e.outcome?.ok || (verb !== SHOP_VERB && verb !== BROWSE_VERB)) return;
    const st = ctx.session.getState();
    const ref = st && shopRefOfTarget(st, e.target);
    if (ref) open(ref);
  });
}

const refOf = (ctx: GameContext, r?: string | ShopRef): ShopRef | null => {
  if (r && typeof r === 'object') return r;
  if (r) return parseShopRef(r);
  return { kind: 'stall', id: ctx.session.snapshot().townId };
};

// ---- QA hooks (window.__hearth.dev) ----
/** `dev.shop('stall:<townId>' | {kind,id})`: open the sheet; returns what the shop shows. Default: this town's stall. */
registerDevHook('shop', (ctx) => (r?: string | ShopRef) => {
  const ref = refOf(ctx, r);
  const st = ctx.session.getState();
  if (!ref || !st) return null;
  ctx.panels.shop.open(ref);
  return shopStock(st, ref);
});
/** `dev.shopSettle(ref, {buy:{bread:1}, sell:{wood:2}})`: settle without the sheet. */
registerDevHook('shopSettle', (ctx) => (r: string | ShopRef, basket: Partial<Basket> = {}) => {
  const ref = refOf(ctx, r);
  const st = ctx.session.getState();
  if (!ref || !st) return null;
  const res = settle(st, ref, { buy: basket.buy ?? {}, sell: basket.sell ?? {} });
  if (res.ok && res.keeperId && res.say) ctx.voice.say(res.keeperId, res.say);
  ctx.events.emit('inventory', {});
  return res;
});
/** `dev.shopNav.moveFocus('down')` etc.: the gamepad's handle on the open sheet. */
registerDevHook('shopNav', () => shopNav);
// The gamepad drives the open shop through its own nav (the wagon's sheet keeps the `trade` id).
for (const id of [SHOP_ID, 'trade']) registerSheetNav(`hf-sheet-${id}`, shopNav);
