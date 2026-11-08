/**
 * The road sheet at a signpost: each road out with its far town and days on foot, and today's travellers
 * for hire with their prices (coin you lack is paid in warmth, two spark a coin). Taking a road runs the
 * journey in the sim (every road day is a world day), then the app puts you in the far town and you hear
 * how the road went.
 */
import Phaser from 'phaser';
import type { GameContext, SheetDef } from '../app/contracts';
import type { JourneyResult, RoadView } from '../sim/travel/journey';
import { coinOf } from '../sim/travel/journey';
import { unreadReplies } from '../sim/letter-replies';
import { button, el, townNamer } from './dom';

export const ROADS_ID = 'roads';
const days = (n: number): string => `${n} day${n === 1 ? '' : 's'}`;

export type Roads = {
  sheet(townId: string): SheetDef;
  /** Take a road as if picked on the sheet; resolves once you have arrived (null if refused). */
  travel(routeId: string, tradeId?: string): Promise<JourneyResult | null>;
  busy(): boolean;
  views(): RoadView[];
};

export function createRoads(ctx: GameContext, closeSheet: () => void): Roads {
  const nameOf = townNamer(ctx);
  let travelling = false;

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

  const travel = async (routeId: string, tradeId?: string): Promise<JourneyResult | null> => {
    if (travelling) return null;
    closeSheet();
    const res = ctx.session.journey(routeId, tradeId);
    if (!res?.ok || !res.toId) {
      ctx.voice?.tell(res?.reason === 'cant_pay' ? 'You haven’t the warmth to spare for that.' : 'Not that road, not today.', 'player');
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
      if (!roads.length) { body.append(el('p', 'hf-muted', 'No road leaves here.')); return; }
      const spark = st.player.spark, coin = coinOf(st);
      body.append(el('p', 'hf-muted hf-small', `You have ${Math.floor(spark)} spark and ${coin} coin.`));
      const list = el('div', 'hf-roads');
      for (const r of roads) {
        const to = nameOf(r.toId);
        const sec = el('section', 'hf-road', undefined, { 'aria-label': `Road to ${to}`, 'data-route': r.routeId });
        sec.append(el('h3', '', `To ${to} · ${days(r.walkDays)} on foot`));
        sec.append(button(`Walk it: ${days(r.walkDays)}`, () => void travel(r.routeId), {
          id: `walk-${r.routeId}`, title: 'On foot. The world goes on while you walk.',
        }));
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
      body.append(el('p', 'hf-note hf-small', 'Short of coin, they take two spark a coin. Watch their hands, not their words.'));
      body.append(button('Stay a while', closeSheet, { id: 'roads-stay' }));
    },
  });

  return { sheet, travel, busy: () => travelling, views };
}
