/**
 * The road sheet at a signpost: each road out with its far town and days on foot, and today's travellers
 * for hire with their prices (coin you lack is paid in warmth, two spark a coin). Taking a road runs the
 * journey in the sim (every road day is a world day), then the app puts you in the far town and you hear
 * how the road went. A road with a waystation on it can be walked with a night there partway; each road says
 * how it is kept. Escorting a cart (the ring's Escort verb on a cart) runs here too, as a journey beside it.
 */
import Phaser from 'phaser';
import type { GameContext, SheetDef } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import { roadWord, tickRoads } from '../sim/economy/roads';
import { INNS, waystationsOn } from '../sim/economy/waystations';
import type { JourneyOpts, JourneyResult, RoadView } from '../sim/travel/journey';
import { parseTargetAction } from '../sim/play-session/targets';
import { coinOf } from '../sim/travel/journey';
import { unreadReplies } from '../sim/letter-replies';
import { button, el, townNamer } from './dom';
import { districtAt } from '../sim/map/districts';

export const ROADS_ID = 'roads';
const days = (n: number): string => `${n} day${n === 1 ? '' : 's'}`;
type Plan = Pick<JourneyOpts, 'escortCartId' | 'stopAt'>;

export type Roads = {
  sheet(townId: string): SheetDef;
  /** Take a road as if picked on the sheet; resolves once you have arrived (null if refused). */
  travel(routeId: string, tradeId?: string, plan?: Plan): Promise<JourneyResult | null>;
  busy(): boolean;
  views(): RoadView[];
};

/** Lines to tell once the rebuilt world is up after a district crossing (the game restarts around the session). */
let arrivalLines: string[] = [];

export function createRoads(ctx: GameContext, closeSheet: () => void): Roads {
  const nameOf = townNamer(ctx);
  let travelling = false;
  if (arrivalLines.length) {
    const lines = arrivalLines;
    arrivalLines = [];
    lines.forEach((line, i) => window.setTimeout(() => ctx.voice?.tell(line, 'player'), 1800 + 2600 * i));
  }

  /** Take a trunk road into another district: its days pass, the district swaps, the world is rebuilt. */
  const crossDistrict = async (to: { col: number; row: number }): Promise<void> => {
    if (travelling) return;
    closeSheet();
    travelling = true;
    ctx.actors.player.setFrozen(true);
    await fade(true);
    const res = ctx.session.journeyDistrict(to);
    if (!res) {
      ctx.actors.player.setFrozen(false);
      travelling = false;
      await fade(false);
      ctx.voice?.tell('The trunk road is closed to you today.', 'player');
      return;
    }
    const d = districtAt(ctx.seed, to.col, to.row);
    arrivalLines = [
      `Day ${ctx.session.snapshot().day}. ${res.days} days on the trunk road, and you come down into ${d.name}.`,
      d.home ? 'Home. The hearths you left are still here, for better or worse.' : `A ${d.character.woundLabel} land. The ${d.character.doctrine.name} rules here, and promises ${d.character.doctrine.promise}.`,
    ];
    ctx.autosave();
    const restart = ctx.scene.registry.get('restart') as (() => void) | undefined;
    if (restart) restart();
    else { ctx.actors.player.setFrozen(false); travelling = false; }
  };

  const views = (): RoadView[] => {
    try { return ctx.session.roads(); } catch (err) { console.error('roads failed', err); return []; }
  };

  const fade = (out: boolean): Promise<void> => new Promise((done) => {
    const cam = ctx.scene.cameras?.main;
    if (!cam) return done();
    const ev = out ? Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE : Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE;
    let settled = false;
    const finish = (): void => { if (settled) return; settled = true; cam.off(ev, finish); done(); };
    cam.once(ev, finish);
    window.setTimeout(finish, 1600); // never hang on a fade that did not start
    if (out) cam.fadeOut(600, 8, 8, 20); else cam.fadeIn(800, 8, 8, 20);
  });

  const travel = async (routeId: string, tradeId?: string, plan?: Plan): Promise<JourneyResult | null> => {
    if (travelling) return null;
    closeSheet();
    const res = ctx.session.journey(routeId, tradeId, plan);
    if (!res?.ok || !res.toId) {
      const why = res?.reason === 'cant_pay' ? 'You haven’t the warmth to spare for that.' : plan?.escortCartId ? 'The cart has gone on without you.' : 'Not that road, not today.';
      ctx.voice?.tell(why, 'player');
      ctx.voice?.sfx?.('refuse');
      return res;
    }
    travelling = true;
    ctx.actors.player.setFrozen(true);
    try {
      await fade(true);
      ctx.arriveAt(res.toId);
      const st = ctx.session.getState();
      ctx.events.emit('inventory', {});
      if (st) ctx.ui.hud.letters(unreadReplies(st));
      ctx.autosave();
      await fade(false);
    } finally {
      ctx.actors.player.setFrozen(false);
      travelling = false;
    }
    ctx.voice?.sfx?.('dawn');
    const lines = [`Day ${ctx.session.snapshot().day}. ${nameOf(res.toId)}.`, ...res.lines];
    lines.forEach((line, i) => window.setTimeout(() => ctx.voice?.tell(line, 'player'), 2600 * i));
    return res;
  };

  const sheet = (townId: string): SheetDef => ({
    id: ROADS_ID,
    title: `${nameOf(townId)}: the road out`,
    render(body) {
      body.replaceChildren();
      const st = ctx.session.getState();
      const roads = views();
      if (!st) return;
      if (!roads.length) body.append(el('p', 'hf-muted', 'No road leaves this town for another in the district.'));
      const spark = st.player.spark, coin = coinOf(st);
      body.append(el('p', 'hf-muted hf-small', `You have ${Math.floor(spark)} spark and ${coin} coin.`));
      const list = el('div', 'hf-roads');
      for (const r of roads) {
        const to = nameOf(r.toId);
        const sec = el('section', 'hf-road', undefined, { 'aria-label': `Road to ${to}`, 'data-route': r.routeId });
        const kept = st.economyRoutes?.find((x) => x.id === r.routeId);
        sec.append(el('h3', '', `To ${to} · ${days(r.walkDays)} on foot${kept ? ` · the road is ${roadWord(kept)}` : ''}`));
        sec.append(button(`Walk it: ${days(r.walkDays)}`, () => void travel(r.routeId), {
          id: `walk-${r.routeId}`, title: 'On foot. The world goes on while you walk.',
        }));
        for (const inn of waystationsOn(st, r.routeId)) {
          sec.append(button(`Walk it, a night at ${inn.name}: ${INNS.restCoin} coin`, () => void travel(r.routeId, undefined, { stopAt: inn.id }), {
            id: `stop-${r.routeId}-${inn.id}`, title: 'A bed partway, a safe night, and the talk of the road. No coin: the hayloft.',
          }));
        }
        if (!r.offers.length) sec.append(el('p', 'hf-muted hf-small', 'No one is heading that way today.'));
        for (const o of r.offers) {
          const total = o.spark + Math.max(0, o.coin - coin) * 2;
          const short = spark - total < 1;
          const b = button(`${o.name}, ${o.roleLabel}: ${days(o.days)} · ${o.spark} spark, ${o.coin} coin`, () => void travel(r.routeId, o.tradeId), {
            id: `hire-${r.routeId}-${o.tradeId}`,
            disabled: short,
            title: short ? 'You haven’t the warmth to spare.' : o.tellLines.join(' '),
          });
          sec.append(b);
          if (!short && o.tellLines.length) sec.append(el('p', 'hf-muted hf-small', o.tellLines.join(' ')));
        }
        list.append(sec);
      }
      body.append(list);
      // Trunk roads: seat to seat into the neighbouring districts of the realm.
      const trunks = ctx.session.trunkRoads();
      if (trunks.length) {
        const beyond = el('section', 'hf-road', undefined, { 'aria-label': 'Beyond this district', 'data-id': 'trunk-roads' });
        beyond.append(el('h3', '', 'Beyond this district'));
        for (const t of trunks) {
          const d = districtAt(ctx.seed, t.to.col, t.to.row);
          const what = d.home ? 'your home district' : `${d.character.woundLabel}, ruled by the ${d.character.doctrine.name}`;
          beyond.append(button(`The trunk road to ${t.name}: ${days(t.days)}`, () => void crossDistrict(t.to), {
            id: `trunk-${t.id}`, title: `${what}. The days pass on the road; the district you leave goes quiet until you come back.`,
          }));
        }
        body.append(beyond);
      }
      body.append(el('p', 'hf-note hf-small', 'Short of coin, they take two spark a coin. Watch their hands, not their words.'));
      body.append(button('Stay a while', closeSheet, { id: 'roads-stay' }));
    },
  });

  // The ring's Escort verb on a cart (sim/contrib/roads) settles in the sim; the walk beside it runs here.
  const off = ctx.events.on('act', (e) => {
    const parsed = parseTargetAction(e.actionId);
    if (parsed?.verb !== 'escort' || !e.outcome?.ok || e.target.kind !== 'wagon' || !e.target.id.startsWith('cart:')) return;
    const cartId = e.target.id.slice(5);
    const cart = ctx.session.getState()?.logistics?.carts.find((c) => c.id === cartId);
    window.setTimeout(() => void travel(cart?.legs[0]?.routeId ?? '', undefined, { escortCartId: cartId }), 900);
  });
  ctx.scene.events.once('shutdown', off);

  return { sheet, travel, busy: () => travelling, views };
}

// ---- QA hooks (window.__hearth.dev.roadway) ----
registerDevHook('roadway', (ctx) => ({
  /** Every road: condition, broken, the word people use. */
  list: () => (ctx.session.getState()?.economyRoutes ?? []).map((r) => ({ id: r.id, from: r.fromTownId, to: r.toTownId, condition: Math.round(r.condition * 1000) / 1000, broken: r.broken, word: roadWord(r) })),
  /** Run the roads' dawn tick n times (wear, crews, breaks) without moving the day. */
  wear: (n = 10) => { const st = ctx.session.getState(); if (st) for (let i = 0; i < n; i++) tickRoads(st); return st?.roadway?.news.slice(-6); },
  /** Set a road's condition (and broken below the break line on the next tick). */
  set: (routeId: string, condition: number) => { const r = ctx.session.getState()?.economyRoutes?.find((x) => x.id === routeId); if (r) r.condition = condition; return r; },
  carts: () => (ctx.session.getState()?.logistics?.carts ?? []).map((c) => ({ id: c.id, to: c.toTownId, daysLeft: c.daysLeft, escortedBy: c.escortedBy })),
}));
